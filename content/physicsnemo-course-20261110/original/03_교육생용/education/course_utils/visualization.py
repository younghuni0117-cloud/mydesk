"""Verified surface geometry and a bounded cache for the educational API."""

from collections import OrderedDict
import csv
import json
from pathlib import Path
import threading
import time
import xml.etree.ElementTree as ET

import numpy as np
import pyvista as pv
from scipy.spatial import Delaunay

from .dataset import content_sha256, file_sha256, json_write
from .inference import load_selected_model, predict_fields


def prepare_surfaces(education_dir, training_dir=None, output_dir=None):
    root = Path(education_dir).resolve()
    _, _, cases, split, _, context = load_selected_model(root, training_dir)
    out = Path(output_dir) if output_dir is not None else root / 'runs/visualization/surfaces'
    out.mkdir(parents=True, exist_ok=True)
    with (root / 'data/rst_manifest.csv').open(encoding='utf-8-sig') as stream:
        sources = {r['case_id']: r for r in csv.DictReader(stream)}
    inventory = {}
    material_sources = {}
    for name, case in cases.items():
        material_path = root / 'data' / Path(sources[name]['source_rst']).with_name('MatML.xml')
        xml = ET.parse(material_path).getroot()
        bulk = xml.find('.//Material/BulkDetails')
        values = [p for p in bulk.findall('.//ParameterValue')
                  if p.findtext("Qualifier[@name='Localized Name']") == 'Tensile Yield Strength']
        if bulk.findtext('Name') != 'Structural Steel' or len(values) != 1:
            raise ValueError('Expected Structural Steel with one tensile yield strength')
        parameter = values[0].get('parameter')
        unit = xml.findtext(f".//ParameterDetails[@id='{parameter}']/Units/Unit/Name")
        if unit != 'Pa':
            raise ValueError('Yield strength must be recorded in Pa')
        yield_mpa = float(values[0].findtext('Data')) / 1e6
        if yield_mpa != 250.0:
            raise ValueError('Educational material differs between design points')
        material_sources[str(material_path.relative_to(root))] = file_sha256(material_path)
        mesh = pv.read(root / 'data/vtu' / f'{name}.vtu')
        surface = mesh.extract_surface(nonlinear_subdivision=1, algorithm='dataset_surface').triangulate()
        # vtkOriginalPointIds is reindexed by the nonlinear filter. Use real node IDs.
        lookup = {int(node): index for index, node in enumerate(case.node_ids)}
        indices = np.array([lookup[int(node)] for node in surface['node_id']], dtype=np.int64)
        if len(np.unique(indices)) != len(indices):
            raise ValueError('Surface contains duplicated/created nodes')
        np.testing.assert_allclose(surface.points, case.coords[indices], atol=1e-5, rtol=0)
        faces = surface.faces.reshape(-1, 4)
        if not np.all(faces[:, 0] == 3):
            raise ValueError('Expected triangular surface')
        geometry = {'case_id': name, 'points_mm': case.coords[indices].tolist(),
                    'node_ids': case.node_ids[indices].tolist(), 'triangles': faces[:, 1:].tolist()}
        pack = {**geometry, 'schema_version': 1, 'surface_version': content_sha256(geometry),
                'source_vtu_sha256': case.vtu_sha256, 'full_node_indices': indices.tolist(),
                'thickness_mm': float(case.globals[0]), 'nominal_force_N': float(case.globals[1]),
                'fea_stress_mpa': case.stress[indices, 0].tolist(),
                'fea_displacement_mm': case.displacement[indices].tolist(),
                'fea_full_max_stress_mpa': float(case.stress.max()),
                'fea_full_peak_position_mm': case.coords[int(np.argmax(case.stress[:, 0]))].tolist(),
                'fea_full_peak_node_id': int(case.node_ids[int(np.argmax(case.stress[:, 0]))]),
                'yield_strength_mpa': yield_mpa, 'material_source': str(material_path.relative_to(root)),
                'material_sha256': file_sha256(material_path),
                'surface_policy': 'Tet10 boundary faces split into 4 triangles through existing corner/midside nodes; original float64 coordinates restored by node ID',
                'units': {'coordinates': 'mm', 'stress': 'MPa', 'displacement': 'mm'}}
        path = out / f'{name}.json'
        json_write(path, pack)
        inventory[name] = {'file': path.name, 'sha256': file_sha256(path),
                           'surface_version': pack['surface_version'],
                           'points': len(indices), 'triangles': len(faces)}
    manifest = {'schema_version': 1, 'context': context, 'cases': inventory,
                'material_sources': material_sources, 'split_sha256': split['split_sha256']}
    json_write(out / 'surface_manifest.json', manifest)
    return manifest


class PredictionEngine:
    """One local educational model, serialized predictions and model-aware LRU."""

    def __init__(self, education_dir, training_dir=None, device='cpu', cache_limit=32, surface_dir=None):
        self.root = Path(education_dir).resolve()
        self.device = device
        self.cache_limit = cache_limit
        self.lock = threading.RLock()
        self.cache = OrderedDict()
        self.generation = 0
        folder = Path(surface_dir) if surface_dir is not None else self.root / 'runs/visualization/surfaces'
        self.surface_dir = folder
        self.manifest = json.loads((folder / 'surface_manifest.json').read_text(encoding='utf-8'))
        self.packs = {}
        for name, info in self.manifest['cases'].items():
            path = folder / info['file']
            if file_sha256(path) != info['sha256']:
                raise ValueError('Surface artifact hash mismatch')
            pack = json.loads(path.read_text(encoding='utf-8'))
            geometry = {key: pack[key] for key in ['case_id', 'points_mm', 'node_ids', 'triangles']}
            if content_sha256(geometry) != pack['surface_version']:
                raise ValueError('Surface geometry version mismatch')
            self.packs[name] = pack
        for name, digest in self.manifest['material_sources'].items():
            if file_sha256(self.root / name) != digest:
                raise ValueError('Material source changed')
        self.set_model(training_dir or self.root / 'runs/training/reference')

    def set_model(self, training_dir):
        path = Path(training_dir).resolve()
        if not path.is_relative_to(self.root / 'runs/training'):
            raise ValueError('Model must be a verified educational training run')
        # Atomic replacement: failure leaves the previous model/source intact.
        with self.lock:
            model, norm, cases, split, _, context = load_selected_model(self.root, path, self.device)
            for name, case in cases.items():
                pack = self.packs[name]
                if case.vtu_sha256 != pack['source_vtu_sha256']:
                    raise ValueError('Model/surface source mismatch')
                np.testing.assert_array_equal(case.coords[pack['full_node_indices']], pack['points_mm'])
            bounds = np.array([split['scaling_bounds'][k] for k in ['thickness_mm', 'force_N']])
            offset, width = bounds[:, 0], bounds[:, 1] - bounds[:, 0]
            hull = Delaunay((np.stack([cases[n].globals for n in split['train']]) - offset) / width)
            self.model, self.normalizer, self.cases, self.context = model, norm, cases, context
            self.hull, self.offset, self.width = hull, offset, width
            self.training_dir = str(path)
            self.cache.clear()
            self.generation += 1

    def health(self):
        with self.lock:
            return {'ready': True, 'model_id': self.context['checkpoint_sha256'],
                    'model_path': self.context['checkpoint'], 'selected_epoch': self.context['selected_epoch'],
                    'stats_sha256': self.context['stats_sha256'], 'generation': self.generation,
                    'surface_manifest_sha256': file_sha256(self.surface_dir / 'surface_manifest.json'),
                    'surface_versions': {n: p['surface_version'] for n, p in self.packs.items()},
                    'cache_entries': len(self.cache), 'device': self.device}

    def predict(self, case_id, force_N):
        started = time.perf_counter()
        with self.lock:
            if case_id not in self.cases:
                raise ValueError('Unknown educational case')
            case, pack = self.cases[case_id], self.packs[case_id]
            force_N = float(force_N)
            condition = np.array([case.globals[0], force_N])
            if not np.isfinite(condition).all() or not 100 <= force_N <= 500:
                raise ValueError('Force must be finite within 100..500 N')
            if self.hull.find_simplex((condition - self.offset) / self.width, tol=1e-10) < 0:
                raise ValueError('Condition outside train condition convex hull')
            key = (self.context['checkpoint_sha256'], pack['surface_version'], float(condition[0]), force_N)
            hit = key in self.cache
            if hit:
                payload = self.cache.pop(key)
            else:
                fields = predict_fields(self.model, self.normalizer, case.coords, condition)
                ids = pack['full_node_indices']
                stress = fields['stress'][:, 0]
                peak = int(np.argmax(stress))
                maximum = float(stress[peak])
                nominal = force_N == pack['nominal_force_N']
                payload = {'case_id': case_id, 'thickness_mm': float(condition[0]), 'force_N': force_N,
                           'model_id': self.context['checkpoint_sha256'], 'selected_epoch': self.context['selected_epoch'],
                           'stats_sha256': self.context['stats_sha256'], 'surface_version': pack['surface_version'],
                           'node_ids': pack['node_ids'], 'stress_mpa': stress[ids].tolist(),
                           'displacement_mm': fields['displacement'][ids].tolist(),
                           'matching_fea': nominal, 'comparison_kind': 'same-condition FEA' if nominal else 'model observation; no matching FEA',
                           'full_max_stress_mpa': maximum, 'full_peak_node_id': int(case.node_ids[peak]),
                           'full_peak_position_mm': case.coords[peak].tolist(),
                           'full_max_displacement_mm': float(np.linalg.norm(fields['displacement'], axis=1).max()),
                           'negative_stress_nodes': int(np.sum(stress < 0)),
                           'yield_strength_mpa': pack['yield_strength_mpa'],
                           'illustrative_yield_ratio': pack['yield_strength_mpa'] / maximum if maximum > 0 else None,
                           'fea_full_max_stress_mpa': pack['fea_full_max_stress_mpa'] if nominal else None,
                           'fea_illustrative_yield_ratio': pack['yield_strength_mpa'] / pack['fea_full_max_stress_mpa'] if nominal else None}
            self.cache[key] = payload
            while len(self.cache) > self.cache_limit:
                self.cache.popitem(last=False)
            return {**payload, 'cache_hit': hit, 'generation': self.generation,
                    'server_ms': (time.perf_counter() - started) * 1000}
