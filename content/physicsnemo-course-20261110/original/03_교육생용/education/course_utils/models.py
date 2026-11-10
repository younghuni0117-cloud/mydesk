"""Independent educational coordinate/condition model and PhysicsNeMo adapter."""

import torch
from torch import nn
from physicsnemo import Module

MODEL_KIND = "education_hook_point_mlp_v1"
MODEL_CONFIG = {"hidden_dim": 64, "n_blocks": 3}


class PointResidualBlock(nn.Module):
    """Shared channel MLP; no mixing between nodes or cases."""

    def __init__(self, hidden_dim):
        super().__init__()
        self.layers = nn.Sequential(nn.Linear(hidden_dim, hidden_dim), nn.SiLU(),
                                    nn.Linear(hidden_dim, hidden_dim))

    def forward(self, features):
        return features + 0.5 * self.layers(features)


class EducationalHookMLP(nn.Module):
    """Normalized (coords, globals) tuple -> normalized stress/displacement dict.

    coords: (B,N,3); globals: (B,2), thickness then force.
    The tuple is one input because Module.from_torch.forward accepts one input.
    """

    def __init__(self, hidden_dim=64, n_blocks=3):
        super().__init__()
        if type(hidden_dim) is not int or hidden_dim < 4:
            raise ValueError("hidden_dim must be an integer >= 4.")
        if type(n_blocks) is not int or n_blocks < 1:
            raise ValueError("n_blocks must be a positive integer.")
        self.coord_encoder = nn.Sequential(nn.Linear(3, hidden_dim), nn.SiLU())
        self.condition_encoder = nn.Sequential(nn.Linear(2, hidden_dim), nn.SiLU())
        self.fusion = nn.Sequential(nn.Linear(2 * hidden_dim, hidden_dim), nn.SiLU())
        self.blocks = nn.Sequential(*(PointResidualBlock(hidden_dim) for _ in range(n_blocks)))
        self.stress_head = nn.Linear(hidden_dim, 1)
        self.displacement_head = nn.Linear(hidden_dim, 3)

    def forward(self, inputs):
        if not isinstance(inputs, (tuple, list)) or len(inputs) != 2:
            raise ValueError("Use model((coords, globals)).")
        coords, globals_ = inputs
        if coords.ndim != 3 or coords.shape[-1] != 3 or coords.shape[1] < 1:
            raise ValueError("coords must have shape (B,N,3), N >= 1.")
        if globals_.ndim != 2 or globals_.shape != (coords.shape[0], 2):
            raise ValueError("globals must have shape (B,2), matching coords batch.")
        if coords.device != globals_.device or coords.dtype != globals_.dtype:
            raise ValueError("coords and globals must share device and dtype.")
        spatial = self.coord_encoder(coords)
        condition = self.condition_encoder(globals_).unsqueeze(1).expand(-1, coords.shape[1], -1)
        features = self.blocks(self.fusion(torch.cat((spatial, condition), dim=-1)))
        return {"stress": self.stress_head(features),
                "displacement": self.displacement_head(features)}


# Import this module before Module.from_checkpoint in each fresh Python process.
# A stable registration name lets .mdlus reconstruct the custom constructor.
PhysicsNeMoHookMLP = Module.from_torch(
    EducationalHookMLP, name="EducationHookPointMLPV1", register=True
)


def make_model(config=None):
    return PhysicsNeMoHookMLP(**(MODEL_CONFIG if config is None else config))


def normalized_loss(prediction, target, stress_weight=1.0, displacement_weight=1.0):
    """Per-case, per-channel mean squared errors in train-normalized units.

    Each displacement channel contributes equally despite different raw scales.
    This supervised loss does not impose PDE or boundary-condition residuals.
    """
    weights = (stress_weight, displacement_weight)
    if any(not isinstance(w, (float, int)) or not 0 <= w < float("inf") for w in weights):
        raise ValueError("Loss weights must be finite and non-negative.")
    if sum(weights) == 0:
        raise ValueError("At least one loss weight must be positive.")
    losses = {}
    for field, channels in [("stress", 1), ("displacement", 3)]:
        predicted, actual = prediction[field], target[field]
        if predicted.shape != actual.shape or predicted.ndim != 3 or predicted.shape[-1] != channels:
            raise ValueError(f"Invalid or mismatched {field} shapes.")
        losses[field] = (predicted - actual).square().mean(dim=(1, 2)).mean()
    losses["total"] = stress_weight * losses["stress"] + displacement_weight * losses["displacement"]
    return losses
