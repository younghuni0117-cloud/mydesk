"""Physical-unit inference using a frozen, validation-selected checkpoint."""

import json
from pathlib import Path
import numpy as np
import torch

from .checkpoint import load_checkpoint
from .dataset import file_sha256, load_prepared


def load_selected_model(education_dir, training_dir=None, device="cpu"):
    education_dir = Path(education_dir).resolve()
    training_dir = Path(training_dir or education_dir / "runs/training/transolver_reference").resolve()
    manifest = json.loads((training_dir / "training_manifest.json").read_text(encoding="utf-8"))
    if manifest["status"] != "completed" or manifest["test_scored"]:
        raise ValueError("Expected a completed train/validation-only run")
    for name, digest in manifest["artifact_sha256"].items():
        if file_sha256(training_dir / name) != digest:
            raise ValueError(f"Training artifact hash mismatch: {name}")
    for name, digest in manifest["provenance"]["source_code_sha256"].items():
        if file_sha256(education_dir / name) != digest:
            raise ValueError(f"Training source differs from recorded run: {name}")
    cases, split, normalizer, fixed, dataset_manifest = load_prepared(
        education_dir / "data", education_dir / "runs/dataset")
    if manifest["provenance"]["vtu_sha256"] != dataset_manifest["vtu_sha256"]:
        raise ValueError("Evaluation inputs differ from training provenance")
    if file_sha256(education_dir / "runs/dataset/dataset_manifest.json") != manifest["provenance"]["dataset_manifest_sha256"]:
        raise ValueError("Prepared dataset manifest differs from training provenance")
    checkpoint = training_dir / "best_model.pt"
    model, saved_normalizer, package = load_checkpoint(checkpoint, device,
                                                      expected_split_sha256=split["split_sha256"])
    summary = json.loads((training_dir / "training_summary.json").read_text(encoding="utf-8"))
    history = json.loads((training_dir / "history.json").read_text(encoding="utf-8"))
    chosen = min((r for r in history if r["epoch"] > 0), key=lambda r: r["validation"]["total"])
    if package["training"]["status"] != "trained" or package["training"]["epoch"] != chosen["epoch"]:
        raise ValueError("Checkpoint does not match validation-selected trained epoch")
    if summary["best_epoch"] != chosen["epoch"] or saved_normalizer.stats != normalizer.stats:
        raise ValueError("Checkpoint selection/statistics mismatch")
    context = {"checkpoint": str(checkpoint), "checkpoint_sha256": file_sha256(checkpoint),
               "selected_epoch": chosen["epoch"], "training_manifest_sha256": file_sha256(training_dir / "training_manifest.json"),
               "dataset_manifest_sha256": file_sha256(education_dir / "runs/dataset/dataset_manifest.json"),
               "split_sha256": split["split_sha256"], "stats_sha256": normalizer.stats["stats_sha256"]}
    return model, saved_normalizer, cases, split, fixed, context


def predict_fields(model, normalizer, coords_mm, conditions, chunk_size=4096):
    """Return raw stress (MPa) and displacement (mm) in the input node order.

    Native Transolver evaluates the full case together. chunk_size applies only
    to legacy pointwise models; independent Transolver chunks change context.
    Geometry and conditions must belong to the same case for FEA comparison.
    """
    coords_mm = np.asarray(coords_mm, dtype=np.float64)
    conditions = np.asarray(conditions, dtype=np.float64)
    if coords_mm.ndim != 2 or coords_mm.shape[1] != 3 or coords_mm.shape[0] < 1:
        raise ValueError("Coordinates must be a nonempty (N,3) array in mm")
    if conditions.shape != (2,) or not np.isfinite(conditions).all() or (conditions <= 0).any():
        raise ValueError("Conditions must be positive finite [thickness_mm, force_N]")
    if not np.isfinite(coords_mm).all():
        raise ValueError("Non-finite coordinates")
    if type(chunk_size) is not int or chunk_size < 1:
        raise ValueError("chunk_size must be a positive integer")
    device = next(model.parameters()).device
    globals_ = torch.from_numpy(normalizer.normalize("globals", conditions).astype(np.float32)).unsqueeze(0).to(device)
    collected = {"stress": [], "displacement": []}
    model.eval()
    with torch.no_grad():
        context_size = len(coords_mm) if getattr(model, 'requires_full_point_context', False) else chunk_size
        for start in range(0, len(coords_mm), context_size):
            coords = torch.from_numpy(normalizer.normalize("coords", coords_mm[start:start + context_size]).astype(np.float32))
            output = model((coords.unsqueeze(0).to(device), globals_))
            for field, channels in [("stress", 1), ("displacement", 3)]:
                expected = (1, coords.shape[0], channels)
                if output[field].shape != expected or not torch.isfinite(output[field]).all():
                    raise FloatingPointError(f"Invalid model output: {field}")
                physical = normalizer.denormalize(field, output[field]).squeeze(0)
                values = physical.cpu().numpy().astype(np.float64)
                if not np.isfinite(values).all():
                    raise FloatingPointError(f"Invalid physical prediction: {field}")
                collected[field].append(values)
    return {field: np.concatenate(parts, axis=0) for field, parts in collected.items()}
