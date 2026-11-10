"""Native PhysicsNeMo Transolver with the course's coordinate/condition contract."""
import torch
from torch import nn
from physicsnemo.models.transolver import Transolver

MODEL_KIND = 'education_hook_transolver_v1'
MODEL_CONFIG = dict(functional_dim=2, embedding_dim=3, out_dim=4, n_layers=3,
                    n_hidden=64, n_head=4, slice_num=16, dropout=0.0,
                    structured_shape=None, use_te=False)

class HookTransolver(nn.Module):
    """Only adapt input/output names; all learned computation is native Transolver."""
    requires_full_point_context = True

    def __init__(self, config=None):
        super().__init__()
        self.config = dict(MODEL_CONFIG if config is None else config)
        if any(self.config.get(k) != v for k, v in dict(functional_dim=2,
                embedding_dim=3, out_dim=4, structured_shape=None, use_te=False).items()):
            raise ValueError('Expected XYZ embeddings, thickness/force input and four outputs.')
        self.transolver = Transolver(**self.config)

    def forward(self, inputs):
        if not isinstance(inputs, (tuple, list)) or len(inputs) != 2:
            raise ValueError('Use model((coords, globals)).')
        coords, conditions = inputs
        if coords.ndim != 3 or coords.shape[-1] != 3 or coords.shape[1] < 1:
            raise ValueError('coords must have shape (B,N,3), N >= 1.')
        if conditions.shape != (coords.shape[0], 2):
            raise ValueError('globals must have shape (B,2).')
        if conditions.device != coords.device or conditions.dtype != coords.dtype:
            raise ValueError('Coordinates and conditions must share device and dtype.')
        point_conditions = conditions[:, None, :].expand(-1, coords.shape[1], -1)
        values = self.transolver(point_conditions, embedding=coords)
        return {'stress': values[..., :1], 'displacement': values[..., 1:4]}

def make_model(config=None):
    return HookTransolver(config)
