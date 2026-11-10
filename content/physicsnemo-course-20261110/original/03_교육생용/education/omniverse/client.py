"""Standard-library HTTP client usable inside Kit's separate Python runtime."""
import json
import math
from copy import deepcopy
import time
import urllib.request


class HookClient:
    def __init__(self, base_url='http://127.0.0.1:8098'):
        self.base_url = base_url.rstrip('/')
        self.cache = {}
        self.identity = None
        self.topologies = {}

    def request(self, path, body=None):
        data = None if body is None else json.dumps(body, allow_nan=False).encode('utf-8')
        request = urllib.request.Request(self.base_url + path, data=data,
                                         headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.load(response)

    def invalidate(self):
        self.cache.clear()
        self.identity = None
        self.topologies.clear()

    def fetch(self, case_id, force_N):
        started = time.perf_counter()
        health = self.request('/health')
        if not health['ready']:
            raise RuntimeError('API model is not ready')
        identity = (health['model_id'], health['generation'], health['surface_manifest_sha256'])
        if identity != self.identity:
            self.cache.clear()
            self.identity = identity
        key = (*identity, health['surface_versions'][case_id], case_id, float(force_N))
        hit = key in self.cache
        if hit:
            surface, prediction = self.cache[key]
        else:
            surface = self.request('/surface/' + case_id)
            prediction = self.request('/predict', {'case_id': case_id, 'force_N': float(force_N)})
        after = self.request('/health')
        if (after['model_id'], after['generation'], after['surface_manifest_sha256']) != identity:
            self.invalidate()
            raise RuntimeError('Model/source changed during request; retry')
        if prediction['model_id'] != health['model_id'] or prediction['generation'] != health['generation']:
            self.invalidate()
            raise RuntimeError('Prediction source mismatch')
        if prediction['surface_version'] != surface['surface_version'] or surface['surface_version'] != key[3]:
            raise RuntimeError('Surface source mismatch')
        if prediction['node_ids'] != surface['node_ids'] or prediction['case_id'] != case_id or prediction['force_N'] != float(force_N):
            raise RuntimeError('Prediction geometry/condition mismatch')
        self.cache[key] = (surface, prediction)
        while len(self.cache) > 32:
            self.cache.pop(next(iter(self.cache)))
        return surface, prediction, {'client_cache_hit': hit, 'http_ms': (time.perf_counter() - started) * 1000}

    def select_model(self, run):
        health = self.request('/model', {'training_run': run})
        self.invalidate()
        return health

    def fetch_conditions(self, thickness_mm, force_N):
        """One prediction response carries both fields and morphed coordinates."""
        started = time.perf_counter()
        thickness_mm, force_N = float(thickness_mm), float(force_N)
        if not math.isfinite(thickness_mm) or not 6 <= thickness_mm <= 12:
            raise ValueError('Thickness must be finite within 6..12 mm')
        if not math.isfinite(force_N) or not 100 <= force_N <= 500:
            raise ValueError('Force must be finite within 100..500 N')
        try:
            before = self.request('/health')
        except Exception:
            self.invalidate()
            raise
        if not before['ready'] or before.get('api_kind') != 'live_transolver':
            self.invalidate()
            raise RuntimeError('Start the chapter 7 Transolver server first')
        identity_keys = ('model_id', 'stats_sha256', 'generation', 'session_id',
                         'surface_manifest_sha256', 'morphing_manifest_sha256', 'topology_id')
        identity = tuple(before[k] for k in identity_keys)
        if self.identity != identity:
            self.invalidate()
            self.identity = identity
        key = (self.base_url, *identity, thickness_mm, force_N)
        if key in self.cache:
            cached = self.cache.pop(key)
            self.cache[key] = cached
            surface, prediction = deepcopy(cached)
            return surface, prediction, {'client_cache_hit':True,
                'http_ms':(time.perf_counter()-started)*1000}
        topology_id = before['topology_id']
        result = self.request('/predict', {'thickness_mm':thickness_mm, 'force_N':force_N,
            'include_surface_topology':topology_id not in self.topologies})
        if tuple(result.get('source_identity', {}).get(k) for k in identity_keys) != identity:
            self.invalidate()
            raise RuntimeError('Server model/source changed during request; retry')
        prediction = result.copy()
        surface = prediction.pop('surface')
        if surface.get('topology_id') != topology_id:
            self.invalidate()
            raise RuntimeError('Surface topology identity differs')
        if 'triangles' not in surface:
            if topology_id not in self.topologies:
                raise RuntimeError('Surface topology not available; reconnect')
            surface['triangles'] = deepcopy(self.topologies[topology_id])
        if (prediction['model_id'] != before['model_id'] or
                prediction['generation'] != before['generation'] or
                prediction['surface_version'] != surface['surface_version'] or
                (before.get('geometry_mode') != 'continuous_thickness_morphing' and
                 prediction['surface_version'] != before['surface_versions'][prediction['case_id']]) or
                prediction['node_ids'] != surface['node_ids'] or
                surface['thickness_mm'] != thickness_mm or
                prediction['thickness_mm'] != thickness_mm or
                prediction['force_N'] != force_N or
                len(surface['points_mm']) != len(prediction['node_ids']) or
                len(prediction['stress_mpa']) != len(prediction['node_ids']) or
                len(prediction['displacement_mm']) != len(prediction['node_ids'])):
            self.invalidate()
            raise RuntimeError('Prediction model, geometry, node order or conditions differ')
        self.topologies[topology_id] = deepcopy(surface['triangles'])
        self.cache[key] = deepcopy((surface, prediction))
        while len(self.cache) > 16:
            self.cache.pop(next(iter(self.cache)))
        return surface, prediction, {'client_cache_hit': False,
                                     'http_ms': (time.perf_counter() - started) * 1000}
