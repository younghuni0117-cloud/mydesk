"""Functional MeshGraphNet check on CPU and available CUDA device."""
from pathlib import Path
import os
import sys
import json
from importlib.metadata import version

EDUCATION_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(EDUCATION_DIR))
os.environ['PHYSICSNEMO_FORCE_TE'] = 'False'
os.environ.setdefault('WARP_CACHE_PATH', str(EDUCATION_DIR / 'runs/.warp_cache'))
import course_utils
import warp
warp.config.log_level = warp.LOG_WARNING
import torch
from physicsnemo.models.meshgraphnet import MeshGraphNet
from torch_geometric.data import Data


def check():
    results = {}
    for device in ['cpu'] + (['cuda'] if torch.cuda.is_available() else []):
        torch.manual_seed(42)
        model = MeshGraphNet(4, 3, 1, processor_size=2, hidden_dim_processor=16,
                             hidden_dim_node_encoder=16, hidden_dim_edge_encoder=16,
                             hidden_dim_node_decoder=16).to(device)
        graph = Data(edge_index=torch.tensor([[0, 1, 1, 2], [1, 0, 2, 1]], device=device),
                     num_nodes=3)
        prediction = model(torch.rand(3, 4, device=device),
                           torch.rand(4, 3, device=device), graph)
        assert prediction.shape == (3, 1) and torch.isfinite(prediction).all()
        prediction.square().mean().backward()
        assert all(p.grad is not None and torch.isfinite(p.grad).all() for p in model.parameters())
        results[device] = 'forward/backward PASS'
    return {'torch': str(torch.__version__), 'torch_cuda': torch.version.cuda,
            'physicsnemo': version('nvidia-physicsnemo'), 'pyg': version('torch-geometric'),
            'torch_scatter': version('torch-scatter'), 'checks': results,
            'gpu': torch.cuda.get_device_name() if torch.cuda.is_available() else None}


if __name__ == '__main__':
    print(json.dumps(check(), ensure_ascii=False, indent=2))
