"""Self-contained educational checkpoint: weights, config, split and scaling."""

import copy
from pathlib import Path
import torch

from .dataset import Normalizer, content_sha256
from .models import MODEL_KIND, make_model


def check_metadata(split, stats):
    for value, key in [(split, "split_sha256"), (stats, "stats_sha256")]:
        if content_sha256({k: v for k, v in value.items() if k != key}) != value[key]:
            raise ValueError(f"Checkpoint metadata hash mismatch: {key}")
    if stats["split_sha256"] != split["split_sha256"] or stats["train_cases"] != split["train"]:
        raise ValueError("Checkpoint statistics and split disagree.")
    if stats["condition_order"] != ["thickness_mm", "force_N"]:
        raise ValueError("Unexpected condition order.")
    if stats["units"] != {"coords": "mm", "globals": ["mm", "N"],
                           "stress": "MPa", "displacement": "mm"}:
        raise ValueError("Unexpected checkpoint units.")


def save_checkpoint(path, model, config, split, stats, provenance, training=None):
    check_metadata(split, stats)
    from .hook_transolver import HookTransolver, MODEL_KIND as TRANSOLVER_KIND
    kind = TRANSOLVER_KIND if isinstance(model, HookTransolver) else MODEL_KIND
    package = {"schema_version": 1, "model_kind": kind,
               "config": copy.deepcopy(config), "split": copy.deepcopy(split),
               "stats": copy.deepcopy(stats), "provenance": copy.deepcopy(provenance),
               "training": copy.deepcopy(training or {"status": "initialized", "epoch": 0}),
               "state_dict": {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}}
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(package, path)


def load_checkpoint(path, device="cpu", expected_split_sha256=None):
    package = torch.load(path, map_location="cpu", weights_only=True)
    from .hook_transolver import MODEL_KIND as TRANSOLVER_KIND, make_model as make_transolver
    if package["schema_version"] != 1 or package["model_kind"] not in [MODEL_KIND, TRANSOLVER_KIND]:
        raise ValueError("Unsupported educational checkpoint.")
    check_metadata(package["split"], package["stats"])
    if expected_split_sha256 is not None and package["split"]["split_sha256"] != expected_split_sha256:
        raise ValueError("Checkpoint belongs to a different dataset split.")
    factory = make_transolver if package["model_kind"] == TRANSOLVER_KIND else make_model
    model = factory(package["config"])
    model.load_state_dict(package["state_dict"], strict=True)
    model.to(device).eval()
    return model, Normalizer(package["stats"]), package
