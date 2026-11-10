"""Continuous thickness by affine Z morphing of a verified extruded hook mesh.

STL contains the reference surface; NPZ retains the original full-node and
surface correspondence that STL alone cannot represent. No result fields are
interpolated or rescaled: the frozen model runs on the morphed full point set.
"""
import json
from copy import deepcopy
from pathlib import Path
import time
import uuid

import numpy as np
import pyvista as pv

from .dataset import content_sha256, file_sha256, json_write
from .inference import predict_fields
from .visualization import PredictionEngine, prepare_surfaces


def morph_points(points, reference_thickness, thickness):
    """Anchor Z=0, keep XY, and scale all corner and midside Z coordinates."""
    points = np.asarray(points, dtype=np.float64)
    thickness, reference_thickness = float(thickness), float(reference_thickness)
    if not np.isfinite(thickness) or not 6 <= thickness <= 12:
        raise ValueError('Thickness must be finite within 6..12 mm')
    if not np.isfinite(reference_thickness) or reference_thickness <= 0:
        raise ValueError('Invalid reference thickness')
    result = points.copy()
    result[:, 2] *= thickness/reference_thickness
    return result


def morph_reference_stl(surface_dir, thickness_mm, output_path):
    """Export an actual morphed STL with the same transform as inference nodes."""
    folder = Path(surface_dir)
    metadata = json.loads((folder/'morphing_manifest.json').read_text(encoding='utf-8'))
    source = folder/'reference_hook.stl'
    if file_sha256(source) != metadata['artifacts']['reference_hook.stl']:
        raise ValueError('Reference STL changed')
    mesh = pv.read(source)
    mesh.points = morph_points(mesh.points, metadata['reference_thickness_mm'], thickness_mm)
    output_path = Path(output_path)
    mesh.save(output_path, binary=True)
    return output_path


def prepare_morphing_reference(education_dir, training_dir, output_dir, reference_case_id='case_001'):
    root, folder = Path(education_dir).resolve(), Path(output_dir).resolve()
    manifest = prepare_surfaces(root, training_dir, folder)
    pack = json.loads((folder/manifest['cases'][reference_case_id]['file']).read_text(encoding='utf-8'))
    mesh = pv.read(root/'data/vtu'/f'{reference_case_id}.vtu')
    reference_thickness = pack['thickness_mm']
    np.testing.assert_allclose([mesh.points[:, 2].min(), mesh.points[:, 2].max()],
                               [0, reference_thickness], atol=1e-6, rtol=0)
    if set(mesh.celltypes) != {24}:
        raise ValueError('Expected the educational extruded Tet10 mesh')
    indices = np.asarray(pack['full_node_indices'], dtype=np.int64)
    triangles = np.asarray(pack['triangles'], dtype=np.int64)
    points = np.asarray(mesh.points, dtype=np.float64)
    # Serialize STL from exactly the same surface points and triangles used by
    # the model correspondence. STL itself has no node IDs or declared units.
    faces = np.c_[np.full(len(triangles), 3), triangles].ravel()
    surface = pv.PolyData(points[indices], faces)
    surface.save(folder/'reference_hook.stl', binary=True)
    np.savez_compressed(folder/'reference_nodes.npz', points_mm=points,
                        node_ids=np.asarray(mesh['node_id'], dtype=np.int64),
                        surface_indices=indices, triangles=triangles,
                        tet10=mesh.cells.reshape(-1, 11)[:, 1:])
    record = dict(schema_version=1, method='Affine thickness morph: x=x0; y=y0; z=z0*t/t0',
                  reference_case_id=reference_case_id, reference_thickness_mm=reference_thickness,
                  nominal_force_N=pack['nominal_force_N'], thickness_range_mm=[6., 12.],
                  force_range_N=[100., 500.], coordinates_unit='mm', anchor_z_mm=0.,
                  full_node_count=len(points), surface_node_count=len(indices),
                  triangle_count=len(triangles), context=manifest['context'],
                  artifacts={name:file_sha256(folder/name) for name in ['reference_hook.stl','reference_nodes.npz']},
                  policy='Same affine transform for STL vertices and every full inference node; fixed connectivity and node IDs')
    json_write(folder/'morphing_manifest.json', record)
    return record


class MorphingPredictionEngine(PredictionEngine):
    def __init__(self, education_dir, training_dir, device='cuda', surface_dir=None):
        super().__init__(education_dir, training_dir, device, surface_dir=surface_dir)
        self.morphing = json.loads((self.surface_dir/'morphing_manifest.json').read_text(encoding='utf-8'))
        for name,digest in self.morphing['artifacts'].items():
            if file_sha256(self.surface_dir/name) != digest:
                raise ValueError('Morphing reference artifact changed: '+name)
        if self.morphing['context']['checkpoint_sha256'] != self.context['checkpoint_sha256']:
            raise ValueError('Morphing reference and selected model differ')
        with np.load(self.surface_dir/'reference_nodes.npz', allow_pickle=False) as data:
            self.reference_points = data['points_mm'].copy()
            self.reference_ids = data['node_ids'].copy()
            self.surface_indices = data['surface_indices'].copy()
            self.surface_triangles = data['triangles'].copy()
        self.reference_case_id = self.morphing['reference_case_id']
        self.session_id = uuid.uuid4().hex
        self.cache_limit = 16
        self.topology_id = content_sha256(dict(
            node_ids=self.reference_ids[self.surface_indices].tolist(),
            triangles=self.surface_triangles.tolist()))
        case = self.cases[self.reference_case_id]
        if self.morphing['reference_thickness_mm'] != float(case.globals[0]):
            raise ValueError('Reference thickness differs from the verified source mesh')
        np.testing.assert_array_equal(case.coords, self.reference_points)
        np.testing.assert_array_equal(case.node_ids, self.reference_ids)
        np.testing.assert_array_equal(self.reference_ids[self.surface_indices], self.packs[self.reference_case_id]['node_ids'])

    def health(self):
        return {**super().health(), 'geometry_mode':'continuous_thickness_morphing',
                'session_id':self.session_id, 'topology_id':self.topology_id,
                'morphing_manifest_sha256':file_sha256(self.surface_dir/'morphing_manifest.json')}

    def catalog(self):
        return {k:self.morphing[k] for k in ['method','reference_case_id','reference_thickness_mm',
                    'nominal_force_N','thickness_range_mm','force_range_N','full_node_count','surface_node_count']}

    def geometry(self, thickness_mm):
        thickness = float(thickness_mm)
        full = morph_points(self.reference_points, self.morphing['reference_thickness_mm'], thickness)
        template = self.packs[self.reference_case_id]
        geometry = dict(case_id=self.reference_case_id,points_mm=full[self.surface_indices].tolist(),
                        node_ids=self.reference_ids[self.surface_indices].tolist(), triangles=self.surface_triangles.tolist())
        # FEA belongs only to the unmodified reference geometry and original force.
        reference = thickness == self.morphing['reference_thickness_mm']
        pack = {**template, **geometry, 'surface_version':content_sha256(geometry),
                'thickness_mm':thickness, 'geometry_mode':'continuous_thickness_morphing',
                'reference_thickness_mm':self.morphing['reference_thickness_mm']}
        if not reference:
            for key in list(pack):
                if key.startswith('fea_'):pack[key] = None
        return full, pack

    def predict_conditions(self, thickness_mm, force_N):
        started = time.perf_counter()
        with self.lock:
            force = float(force_N)
            if not np.isfinite(force) or not 100 <= force <= 500:
                raise ValueError('Force must be finite within 100..500 N')
            thickness = float(thickness_mm)
            if not np.isfinite(thickness) or not 6 <= thickness <= 12:
                raise ValueError('Thickness must be finite within 6..12 mm')
            health = self.health()
            identity = {k:health[k] for k in ('model_id', 'stats_sha256', 'generation',
                'session_id', 'surface_manifest_sha256', 'morphing_manifest_sha256', 'topology_id')}
            key = ('continuous', *identity.values(), thickness, force)
            if key in self.cache:
                cached = self.cache.pop(key)
                self.cache[key] = cached
                result = deepcopy(cached)
                result['cache_hit'] = True
                result['server_ms'] = (time.perf_counter()-started)*1000
                return result
            coords, pack = self.geometry(thickness_mm)
            condition = np.array([float(thickness_mm), force])
            inside = bool(self.hull.find_simplex((condition-self.offset)/self.width, tol=1e-10) >= 0)
            fields = predict_fields(self.model, self.normalizer, coords, condition)
            stress, displacement = fields['stress'][:, 0], fields['displacement']
            peak = int(np.argmax(stress)); maximum = float(stress[peak])
            displacement_size = np.linalg.norm(displacement, axis=1)
            displacement_peak = int(np.argmax(displacement_size))
            ids = self.surface_indices
            matching = condition[0] == self.morphing['reference_thickness_mm'] and force == pack['nominal_force_N']
            result = dict(case_id=self.reference_case_id, thickness_mm=float(condition[0]), force_N=force,
                model_id=self.context['checkpoint_sha256'], selected_epoch=self.context['selected_epoch'],
                stats_sha256=self.context['stats_sha256'], surface_version=pack['surface_version'],
                node_ids=pack['node_ids'], stress_mpa=stress[ids].tolist(), displacement_mm=displacement[ids].tolist(),
                surface_url='/surface?thickness_mm='+repr(float(condition[0])),
                geometry_mode='continuous_thickness_morphing', full_node_count=len(coords),
                returned_node_scope='surface', inside_training_hull=inside,
                condition_scope='interpolation' if inside else 'extrapolation',
                accuracy_status='Morphed-geometry accuracy requires separate matching FEA validation',
                matching_fea=bool(matching), comparison_kind='same-condition FEA' if matching else 'morphed/input condition; no matching FEA',
                full_max_stress_mpa=maximum, full_peak_node_id=int(self.reference_ids[peak]),
                full_peak_position_mm=coords[peak].tolist(),
                full_max_displacement_mm=float(displacement_size[displacement_peak]),
                full_displacement_peak_node_id=int(self.reference_ids[displacement_peak]),
                full_displacement_peak_position_mm=coords[displacement_peak].tolist(),
                negative_stress_nodes=int(np.sum(stress<0)), yield_strength_mpa=pack['yield_strength_mpa'],
                illustrative_yield_ratio=pack['yield_strength_mpa']/maximum if maximum>0 else None,
                fea_full_max_stress_mpa=pack['fea_full_max_stress_mpa'] if matching else None,
                fea_illustrative_yield_ratio=pack['yield_strength_mpa']/pack['fea_full_max_stress_mpa'] if matching else None,
                cache_hit=False, generation=self.generation, server_ms=(time.perf_counter()-started)*1000,
                units={'thickness':'mm','force':'N','coordinates':'mm','stress':'MPa','displacement':'mm'})
            result['source_identity'] = identity
            result['surface'] = {k:v for k,v in pack.items() if k != 'full_node_indices'}
            result['surface']['topology_id'] = self.topology_id
            self.cache[key] = deepcopy(result)
            while len(self.cache) > self.cache_limit:
                self.cache.popitem(last=False)
            return result
