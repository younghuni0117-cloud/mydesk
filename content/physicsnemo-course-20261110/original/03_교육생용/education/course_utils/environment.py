"""Read-only course environment checks; no package installation or training."""
import csv
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path
import platform
import sys

PACKAGE_GROUPS = {
    'jupyter': ['notebook', 'ipykernel', 'jupyter-client'],
    'data': ['numpy', 'scipy', 'pandas', 'matplotlib', 'pyvista', 'ansys-dpf-core'],
    'model': ['torch', 'nvidia-physicsnemo', 'GitPython', 'packaging'],
    'api': ['fastapi', 'uvicorn'],
}
if sys.platform == 'win32':
    PACKAGE_GROUPS['model'].append('triton-windows')


def digest(path):
    value = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()


def runtime_snapshot(expected_prefix=None):
    packages = {}
    for group, names in PACKAGE_GROUPS.items():
        packages[group] = {}
        for name in names:
            try:
                packages[group][name] = metadata.version(name)
            except metadata.PackageNotFoundError:
                packages[group][name] = None
    prefix = Path(sys.prefix).resolve()
    return {'python_version': platform.python_version(), 'python_executable': sys.executable,
            'prefix': str(prefix), 'base_prefix': sys.base_prefix,
            'is_virtual_environment': sys.prefix != sys.base_prefix,
            'python_312': sys.version_info[:2] == (3, 12),
            'manager_environment_confirmed': expected_prefix is not None and prefix == Path(expected_prefix).resolve(),
            'packages': packages}


def physics_dependencies():
    from packaging.requirements import Requirement
    try:
        requirements = metadata.requires('nvidia-physicsnemo') or []
    except metadata.PackageNotFoundError:
        return {'installed': False, 'all_declared_dependencies_satisfied': False,
                'conflicts': [{'requirement': 'nvidia-physicsnemo', 'installed_version': None}]}
    conflicts = []
    for raw in requirements:
        requirement = Requirement(raw)
        if requirement.marker and not requirement.marker.evaluate({'extra': ''}):
            continue
        try:
            installed = metadata.version(requirement.name)
        except metadata.PackageNotFoundError:
            installed = None
        if installed is None or not requirement.specifier.contains(installed, prereleases=True):
            conflicts.append({'requirement': raw, 'installed_version': installed})
    return {'installed': True, 'all_declared_dependencies_satisfied': not conflicts, 'conflicts': conflicts}


def data_inventory(education_dir):
    root = Path(education_dir)
    with (root / 'data/lhs_doe.csv').open(encoding='utf-8-sig', newline='') as stream:
        doe = {row['case_id']: row for row in csv.DictReader(stream)}
    with (root / 'data/rst_manifest.csv').open(encoding='utf-8-sig', newline='') as stream:
        rows = list(csv.DictReader(stream))
    if len(doe) != 10 or len(rows) != 10 or {r['case_id'] for r in rows} != set(doe):
        raise ValueError('Expected ten unique corresponding DOE/RST cases')
    checked = []
    for row in rows:
        name = row['case_id']
        path = (root / 'data' / row['rst_file']).resolve()
        if not path.is_relative_to((root / 'data/raw').resolve()) or digest(path) != row['sha256']:
            raise ValueError('RST path/hash mismatch: ' + name)
        for key in ['thickness_mm', 'force_N']:
            if float(row[key]) != float(doe[name][key]):
                raise ValueError('DOE condition mismatch: ' + name)
        vtu = root / 'data/vtu' / (name + '.vtu')
        report = json.loads(vtu.with_name(name + '_validation.json').read_text(encoding='utf-8'))
        if report['validation'] != 'PASS' or digest(vtu) != report['vtu_sha256']:
            raise ValueError('VTU validation/hash mismatch: ' + name)
        checked.append({'case_id': name, 'thickness_mm': float(row['thickness_mm']),
                        'force_N': float(row['force_N']), 'rst_hash_verified': True,
                        'vtu_hash_verified': True, 'nodes': report['n_nodes']})
    return checked


def model_probe():
    import torch
    from .hook_transolver import make_model, MODEL_KIND
    with torch.random.fork_rng(devices=[]):
        model = make_model().eval()
        with torch.no_grad():
            fields = model((torch.zeros(1, 8, 3), torch.zeros(1, 2)))
        assert fields['stress'].shape == (1, 8, 1)
        assert fields['displacement'].shape == (1, 8, 3)
        assert all(torch.isfinite(value).all() for value in fields.values())
    gpu = {'available': torch.cuda.is_available(), 'name': None, 'tensor_probe_passed': None}
    if gpu['available']:
        gpu['name'] = torch.cuda.get_device_name(0)
        result = torch.ones(2, 2, device='cuda') @ torch.ones(2, 2, device='cuda')
        torch.cuda.synchronize()
        gpu['tensor_probe_passed'] = bool(torch.all(result == 2).item())
    return {'passed': True, 'model_kind': MODEL_KIND,
            'model_name': type(model.transolver).__module__ + '.' + type(model.transolver).__name__,
            'model_device': 'cpu',
            'stress_shape': [1, 8, 1], 'displacement_shape': [1, 8, 3],
            'input_kind': 'synthetic normalized zeros; not FEA/physical prediction',
            'checkpoint_updated': False, 'gpu': gpu}


def dpf_probe(ansys_path, rst_path):
    import numpy as np
    from ansys.dpf import core as dpf
    server = dpf.start_local_server(ansys_path=str(ansys_path), as_global=False,
                                    context=dpf.AvailableServerContexts.entry, timeout=30)
    try:
        sources = dpf.DataSources(str(rst_path), server=server)
        operator = dpf.operators.result.displacement(time_scoping=[1], data_sources=sources, server=server)
        fields = operator.outputs.fields_container()
        field = fields[0]
        values = np.asarray(field.data)
        assert values.ndim == 2 and values.shape[1] == 3 and np.isfinite(values).all()
        return {'passed': True, 'server_version': str(server.version), 'server_context': 'Entry',
                'rst_file': str(rst_path), 'displacement_nodes': values.shape[0],
                'native_displacement_unit': str(field.unit),
                'server_shutdown_in_finally': True}
    finally:
        server.shutdown()
