"""Train the educational PhysicsNeMo-linked MLP with isolated validation."""

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import random
import time

import numpy as np
import torch
from torch.utils.data import DataLoader

from .checkpoint import load_checkpoint, save_checkpoint
from .dataset import HookPointDataset, N_POINTS, content_sha256, file_sha256, json_write, load_prepared
from .models import normalized_loss


@dataclass(frozen=True)
class TrainingConfig:
    seed: int = 42
    batch_size: int = 2
    max_epochs: int = 300
    learning_rate: float = 1e-3
    weight_decay: float = 1e-4
    gradient_clip: float = 1.0
    scheduler_patience: int = 15
    scheduler_factor: float = 0.5
    min_learning_rate: float = 1e-5
    early_stopping_patience: int = 50
    early_stopping_min_delta: float = 1e-5
    log_every: int = 10

    def validate(self):
        for name in ["seed", "batch_size", "max_epochs", "scheduler_patience",
                     "early_stopping_patience", "log_every"]:
            value = getattr(self, name)
            if type(value) is not int or value < (0 if name in ["seed", "scheduler_patience"] else 1):
                raise ValueError(f"Invalid {name}")
        for name in ["learning_rate", "gradient_clip", "min_learning_rate"]:
            if not math.isfinite(getattr(self, name)) or getattr(self, name) <= 0:
                raise ValueError(f"Invalid {name}")
        for name in ["weight_decay", "early_stopping_min_delta"]:
            if not math.isfinite(getattr(self, name)) or getattr(self, name) < 0:
                raise ValueError(f"Invalid {name}")
        if not 0 < self.scheduler_factor < 1 or self.min_learning_rate > self.learning_rate:
            raise ValueError("Invalid scheduler settings")


def seed_training(seed):
    # Set before the first CUDA operation. Determinism applies to this environment;
    # bitwise equality is not promised across different devices/library versions.
    os.environ.setdefault("CUBLAS_WORKSPACE_CONFIG", ":4096:8")
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    torch.use_deterministic_algorithms(True)
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    torch.backends.cudnn.benchmark = False
    torch.set_num_threads(4)


def training_loaders(cases, split, normalizer, fixed, config):
    """Create only train and validation loaders; no test loader or test scoring."""
    datasets = {
        "train": HookPointDataset(cases, split["train"], normalizer, seed=config.seed, dynamic=True),
        "validation": HookPointDataset(cases, split["validation"], normalizer,
                                       seed=split["seed"], dynamic=False, fixed_indices=fixed),
    }
    loaders = {role: DataLoader(dataset, batch_size=config.batch_size, shuffle=(role == "train"),
                                num_workers=0, generator=torch.Generator().manual_seed(config.seed))
               for role, dataset in datasets.items()}
    return datasets, loaders


def run_epoch(model, loader, device, optimizer=None, gradient_clip=1.0):
    """Average loss over cases, including any incomplete last batch."""
    training = optimizer is not None
    model.train(training)
    sums = {"total": 0.0, "stress": 0.0, "displacement": 0.0}
    seen = []
    max_gradient_norm = 0.0
    with torch.set_grad_enabled(training):
        for batch in loader:
            tensors = {field: batch[field].to(device) for field in
                       ["coords", "globals", "stress", "displacement"]}
            if training:
                optimizer.zero_grad(set_to_none=True)
            output = model((tensors["coords"], tensors["globals"]))
            losses = normalized_loss(output, tensors)
            if not all(torch.isfinite(value).item() for value in losses.values()):
                raise FloatingPointError("Non-finite model loss")
            if training:
                losses["total"].backward()
                norm = torch.nn.utils.clip_grad_norm_(model.parameters(), gradient_clip,
                                                      error_if_nonfinite=True)
                max_gradient_norm = max(max_gradient_norm, float(norm))
                optimizer.step()
            count = len(batch["case_id"])
            seen.extend(batch["case_id"])
            for field in sums:
                sums[field] += float(losses[field].detach()) * count
    if not seen or len(set(seen)) != len(seen):
        raise ValueError("Empty epoch or repeated cases")
    return {"loss": {field: value / len(seen) for field, value in sums.items()},
            "cases": seen, "max_gradient_norm_before_clip": max_gradient_norm if training else None}


class EarlyStopping:
    """Patience tracks significant improvements separately from exact argmin."""

    def __init__(self, patience=50, min_delta=1e-5):
        if type(patience) is not int or patience < 1 or not math.isfinite(min_delta) or min_delta < 0:
            raise ValueError("Invalid early stopping settings")
        self.patience = patience
        self.min_delta = min_delta
        self.best_significant = float("inf")
        self.bad_epochs = 0

    def update(self, value):
        if not math.isfinite(value):
            raise FloatingPointError("Non-finite validation loss")
        if value < self.best_significant - self.min_delta:
            self.best_significant = value
            self.bad_epochs = 0
        else:
            self.bad_epochs += 1
        return self.bad_epochs >= self.patience


def sample_fingerprint(dataset):
    # Record indices, not floating targets. The full trace is cheap for six cases.
    return {case_id: content_sha256(dataset.sample_indices(i).tolist())
            for i, case_id in enumerate(dataset.case_ids)}


def train_model(education_dir, output_dir, config=None, device=None):
    config = config or TrainingConfig()
    config.validate()
    education_dir, output_dir = Path(education_dir).resolve(), Path(output_dir).resolve()
    # Each run is immutable. New trials get a new output directory.
    if output_dir.exists() and any(output_dir.iterdir()):
        raise FileExistsError(f"Run folder is not empty; select a new output directory: {output_dir}")
    cases, split, normalizer, fixed, dataset_manifest = load_prepared(
        education_dir / "data", education_dir / "runs/dataset")
    initial_dir = education_dir / "runs/model"
    initial_manifest = json.loads((initial_dir / "model_manifest.json").read_text(encoding="utf-8"))
    if file_sha256(initial_dir / "initialized_model.pt") != initial_manifest["artifact_sha256"]["initialized_model.pt"]:
        raise ValueError("Initialized checkpoint hash mismatch")
    for name, digest in initial_manifest["provenance"]["source_code_sha256"].items():
        if file_sha256(education_dir / name) != digest:
            raise ValueError(f"Model implementation differs from prepared initialization: {name}")
    seed_training(config.seed)
    device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
    model, saved_normalizer, initial_package = load_checkpoint(
        initial_dir / "initialized_model.pt", device, expected_split_sha256=split["split_sha256"])
    if saved_normalizer.stats != normalizer.stats or initial_package["training"]["status"] != "initialized":
        raise ValueError("Starting checkpoint statistics/status differ from module 4")
    datasets, loaders = training_loaders(cases, split, normalizer, fixed, config)
    optimizer = torch.optim.AdamW(model.parameters(), lr=config.learning_rate, weight_decay=config.weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="min", factor=config.scheduler_factor, patience=config.scheduler_patience,
        threshold=1e-4, threshold_mode="rel", min_lr=config.min_learning_rate)
    stopper = EarlyStopping(config.early_stopping_patience, config.early_stopping_min_delta)
    output_dir.mkdir(parents=True, exist_ok=True)
    source_names = ["course_utils/training.py", "course_utils/models.py", "course_utils/checkpoint.py",
                    "course_utils/dataset.py", "course_utils/__init__.py", "preparation/train_model.py"]
    provenance = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "initial_checkpoint_sha256": file_sha256(initial_dir / "initialized_model.pt"),
        "dataset_manifest_sha256": file_sha256(education_dir / "runs/dataset/dataset_manifest.json"),
        "vtu_sha256": dataset_manifest["vtu_sha256"],
        "source_code_sha256": {name: file_sha256(education_dir / name) for name in source_names},
        "training_config": asdict(config), "device": str(device), "torch": str(torch.__version__),
        "gpu": torch.cuda.get_device_name(device) if device.type == "cuda" else None,
        "precision": "float32; AMP disabled; TF32 disabled",
        "deterministic_algorithms": True, "cublas_workspace_config": os.environ["CUBLAS_WORKSPACE_CONFIG"],
        "reproducibility_scope": "Same recorded environment/device; no cross-version bitwise promise",
    }
    json_write(output_dir / "training_config.json", asdict(config))
    json_write(output_dir / "run_status.json", {"status": "running", "provenance": provenance})
    start = time.perf_counter()
    history = []
    validation_samples = sample_fingerprint(datasets["validation"])
    best_value, best_epoch = float("inf"), None
    stop_reason = "max_epochs"
    try:
        baseline = run_epoch(model, loaders["validation"], device)
        history.append({"epoch": 0, "train": None, "validation": baseline["loss"],
                        "learning_rate": config.learning_rate, "next_learning_rate": config.learning_rate,
                        "elapsed_seconds": time.perf_counter() - start})
        print(f"Initial validation: {baseline['loss']['total']:.6f}", flush=True)
        for epoch in range(1, config.max_epochs + 1):
            datasets["train"].set_epoch(epoch - 1)
            learning_rate = optimizer.param_groups[0]["lr"]
            train = run_epoch(model, loaders["train"], device, optimizer, config.gradient_clip)
            validation = run_epoch(model, loaders["validation"], device)
            assert set(train["cases"]) == set(split["train"])
            assert set(validation["cases"]) == set(split["validation"])
            assert sample_fingerprint(datasets["validation"]) == validation_samples
            value = validation["loss"]["total"]
            scheduler.step(value)
            should_stop = stopper.update(value)
            improved = value < best_value
            if improved:
                best_value, best_epoch = value, epoch
            row = {"epoch": epoch, "train": train["loss"], "validation": validation["loss"],
                   "learning_rate": learning_rate, "next_learning_rate": optimizer.param_groups[0]["lr"],
                   "max_gradient_norm_before_clip": train["max_gradient_norm_before_clip"],
                   "early_stopping_bad_epochs": stopper.bad_epochs,
                   "saved_as_best": improved, "train_cases": train["cases"],
                   "validation_cases": validation["cases"],
                   "train_sampling_epoch": epoch - 1, "train_sample_sha256": sample_fingerprint(datasets["train"]),
                   "elapsed_seconds": time.perf_counter() - start}
            history.append(row)
            state = {"status": "trained", "epoch": epoch, "validation_loss": validation["loss"],
                     "train_online_loss": train["loss"], "best_epoch": best_epoch,
                     "best_validation_loss": best_value, "training_config": asdict(config),
                     "early_stopping_bad_epochs": stopper.bad_epochs,
                     "scheduler_state": scheduler.state_dict(),
                     "selection_rule": "Exact lowest validation total loss among completed epochs 1..E",
                     "resume_supported": False}
            save_checkpoint(output_dir / "latest_model.pt", model, initial_package["config"],
                            split, normalizer.stats, provenance, state)
            if improved:
                save_checkpoint(output_dir / "best_model.pt", model, initial_package["config"],
                                split, normalizer.stats, provenance, state)
            json_write(output_dir / "history.json", history)
            if epoch == 1 or improved and epoch % config.log_every == 0 or epoch % config.log_every == 0 or should_stop:
                print(f"Epoch {epoch:03d} | train {train['loss']['total']:.6f} | "
                      f"val {value:.6f} | lr {learning_rate:.2g} | best {best_epoch}", flush=True)
            if should_stop:
                stop_reason = "early_stopping"
                break
        # Independently re-evaluate the file selected by validation, not in-memory last weights.
        restored, _, package = load_checkpoint(output_dir / "best_model.pt", device,
                                              expected_split_sha256=split["split_sha256"])
        reload_metrics = run_epoch(restored, loaders["validation"], device)["loss"]
        reload_error = max(abs(reload_metrics[k] - package["training"]["validation_loss"][k]) for k in reload_metrics)
        if reload_error > 1e-6:
            raise AssertionError("Best checkpoint validation does not reproduce recorded loss")
        initial_value = baseline["loss"]["total"]
        summary = {
            "status": "completed", "scope": "Supervised train/validation; test not scored",
            "epochs_completed": epoch, "stop_reason": stop_reason, "best_epoch": best_epoch,
            "initial_validation_loss": baseline["loss"], "best_validation_loss": reload_metrics,
            "latest_validation_loss": history[-1]["validation"],
            "validation_total_reduction_percent": 100 * (initial_value - best_value) / initial_value if initial_value else None,
            "elapsed_seconds": time.perf_counter() - start, "device": str(device),
            "train_cases": split["train"], "validation_cases": split["validation"],
            "test_scored": False, "points_per_case": N_POINTS,
            "validation_sample_sha256": validation_samples,
            "split_sha256": split["split_sha256"], "stats_sha256": normalizer.stats["stats_sha256"],
            "best_reload_validation_max_difference": reload_error,
            "checkpoint_policy": "best = strict validation minimum; latest = last completed epoch; no optimizer resume",
            "loss_scope": "Normalized MSE: stress + mean of 3 displacement channels; sampled validation, not physical accuracy",
        }
        json_write(output_dir / "training_summary.json", summary)
        artifact_names = ["best_model.pt", "latest_model.pt", "history.json", "training_config.json", "training_summary.json"]
        json_write(output_dir / "training_manifest.json", {
            "schema_version": 1, "provenance": provenance,
            "split_sha256": split["split_sha256"], "stats_sha256": normalizer.stats["stats_sha256"],
            "artifact_sha256": {name: file_sha256(output_dir / name) for name in artifact_names},
            "test_scored": False, "status": "completed"})
        json_write(output_dir / "run_status.json", {"status": "completed", "stop_reason": stop_reason})
        print(f"Completed: best epoch {best_epoch}, validation {best_value:.6f}, {stop_reason}", flush=True)
        return summary
    except Exception as error:
        json_write(output_dir / "run_status.json", {"status": "failed", "error": str(error)})
        raise
