"""Chapter 7: continuous-thickness STL/full-node morphing and live inference."""
import argparse
from contextlib import contextmanager
from pathlib import Path
import socket
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
import course_utils  # Activate the course runtime dependencies before model imports.
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from course_utils.morphing import MorphingPredictionEngine, prepare_morphing_reference


class Conditions(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    thickness_mm: float = Field(ge=6, le=12)
    force_N: float = Field(ge=100, le=500)
    include_surface_topology: bool = Field(default=True, strict=True)


def make_app(training_dir, surface_dir, device='cuda'):
    import torch
    torch.set_num_threads(2)
    engine = MorphingPredictionEngine(ROOT, training_dir, device, surface_dir=surface_dir)
    if not getattr(engine.model, 'requires_full_point_context', False):
        raise ValueError('This server requires the chapter 5 native Transolver checkpoint')
    app = FastAPI(title='Hook Transolver Inference API', version='4.0')
    app.state.engine = engine

    @app.get('/health')
    def health():
        return {**engine.health(), 'api_kind': 'live_transolver',
                'training_run': Path(engine.training_dir).name,
                'units': {'thickness': 'mm', 'force': 'N', 'coordinates': 'mm',
                          'stress': 'MPa', 'displacement': 'mm'},
                'geometry_policy': 'Continuous 6..12 mm; identical affine Z morph for reference STL and full nodes',
                'extrapolation_policy': 'Allow design rectangle; report training-hull membership without rejecting extrapolation',
                'inference_policy': 'New conditions run the complete case; identical conditions reuse a versioned cache; weights are frozen'}

    @app.get('/geometries')
    def geometries():
        return engine.catalog()

    @app.get('/surface')
    def morphed_surface(thickness_mm: float = Query(ge=6, le=12)):
        _, pack = engine.geometry(thickness_mm)
        return {k:v for k,v in pack.items() if k != 'full_node_indices'}

    @app.get('/surface/{case_id}')
    def surface(case_id: str):
        if case_id not in engine.packs:
            raise HTTPException(404, 'Unknown prepared geometry')
        return {k: v for k, v in engine.packs[case_id].items() if k != 'full_node_indices'}

    @app.post('/predict')
    def predict(request: Conditions):
        try:
            result = engine.predict_conditions(request.thickness_mm, request.force_N)
            if not request.include_surface_topology:
                result['surface'].pop('triangles', None)
            return result
        except ValueError as error:
            raise HTTPException(422, detail=str(error)) from error

    return app


@contextmanager
def temporary_api(app):
    """Real HTTP for a notebook check; the separate Console server stays independent."""
    import uvicorn
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    listener.bind(('127.0.0.1', 0))
    server = uvicorn.Server(uvicorn.Config(app, log_level='error', access_log=False))
    thread = threading.Thread(target=server.run, kwargs={'sockets': [listener]}, daemon=True)
    thread.start()
    try:
        deadline = time.monotonic() + 30
        while not server.started:
            if not thread.is_alive() or time.monotonic() > deadline:
                raise RuntimeError('Inference API did not start')
            time.sleep(0.05)
        yield 'http://127.0.0.1:' + str(listener.getsockname()[1])
    finally:
        server.should_exit = True
        thread.join(timeout=15)
        listener.close()
        if thread.is_alive():
            raise RuntimeError('Inference API did not stop')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--training-dir', type=Path, required=True)
    parser.add_argument('--surface-dir', type=Path, required=True)
    parser.add_argument('--prepare', action='store_true', help='Create surface files for this checkpoint before serving')
    parser.add_argument('--device', choices=['cpu', 'cuda'], default='cuda')
    parser.add_argument('--port', type=int, default=8098)
    args = parser.parse_args()
    if args.prepare:
        prepare_morphing_reference(ROOT, args.training_dir, args.surface_dir)
    import uvicorn
    uvicorn.run(make_app(args.training_dir, args.surface_dir, args.device), host='127.0.0.1', port=args.port)


if __name__ == '__main__':
    main()
