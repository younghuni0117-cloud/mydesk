"""Prepare the educational 6/2/2 case split, statistics and dataset contract."""

import argparse
import csv
from datetime import datetime, timezone
from importlib.metadata import version
import json
from pathlib import Path
import platform
import sys

import numpy as np
import torch

EDUCATION_DIR = Path(__file__).resolve().parents[1]
if str(EDUCATION_DIR) not in sys.path:
    sys.path.insert(0, str(EDUCATION_DIR))

from course_utils.dataset import (FIELDS, N_POINTS, CONDITION_ORDER, Normalizer, content_sha256,
                                 file_sha256, fit_train_statistics, json_write, load_cases,
                                 load_prepared, make_split, point_indices)
from course_utils.dataset_checks import audit_dataset


def prepare(output_dir):
    data_dir = EDUCATION_DIR / "data"
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    cases = load_cases(data_dir)
    doe_hash = file_sha256(data_dir / "lhs_doe.csv")
    vtu_hashes = {case_id: case.vtu_sha256 for case_id, case in cases.items()}
    prior_manifest = output_dir / "dataset_manifest.json"
    if prior_manifest.is_file():
        prior = json.loads(prior_manifest.read_text(encoding="utf-8"))
        if prior["doe_sha256"] != doe_hash or prior["vtu_sha256"] != vtu_hashes:
            raise ValueError("Inputs changed. Preserve this run and choose a new --output-dir.")
    split = make_split(cases)
    stats = fit_train_statistics(cases, split)
    normalizer = Normalizer(stats)
    fixed = {case_id: point_indices(cases[case_id]) for case_id in split["validation"] + split["test"]}
    contract = {
        "schema_version": 1, "case_count": 10,
        "condition_order": CONDITION_ORDER, "condition_units": ["mm", "N"],
        "material": "Structural Steel (fixed, not an input variable)",
        "force_definition": "Positive total force magnitude, direction fixed by the source analysis",
        "source_fields": {"coords": "VTU points", "globals": "DOE thickness_mm, force_N",
                          "stress": "von_mises_stress", "displacement": "displacement", "node_ids": "node_id"},
        "units": {"coords": "mm", "stress": "MPa", "displacement": "mm"},
        "item_shapes": {"coords": [N_POINTS, 3], "globals": [2], "stress": [N_POINTS, 1],
                        "displacement": [N_POINTS, 3], "node_ids": [N_POINTS]},
        "batch_shapes": {"coords": ["B", N_POINTS, 3], "globals": ["B", 2],
                         "stress": ["B", N_POINTS, 1], "displacement": ["B", N_POINTS, 3]},
        "float_dtype": "float32", "node_id_dtype": "int64", "points_per_case": N_POINTS,
        "sampling_replacement": False,
        "training_sampling": "set_epoch(epoch) selects deterministic new points per case; same epoch reproduces the same sample",
        "holdout_sampling": "Fixed validation/test point indices stored in fixed_sample_indices.npz",
        "normalization": "Z-score with full-node train-only statistics, equal weight per case, ddof=0",
        "constant_channel_policy": "A standard deviation below 1e-12 uses scale=1; actual std remains recorded",
        "loader_num_workers": 0, "reason_num_workers_zero": "Portable Windows/Jupyter execution",
        "mesh_rule": "Coordinates and labels are paired within each case; node IDs are not shared identities across cases",
        "stress_rule": "Tensor-average corners, interpolate midside tensors, then compute von Mises; derived midside targets remain included",
        "test_use": "No model selection using test results; fixed test samples are not a full-mesh evaluation",
        "split_sha256": split["split_sha256"], "stats_sha256": stats["stats_sha256"],
    }
    checks = audit_dataset(cases, split, normalizer, fixed)
    json_write(output_dir / "split_info.json", split)
    json_write(output_dir / "stats.json", stats)
    json_write(output_dir / "data_contract.json", contract)
    np.savez_compressed(output_dir / "fixed_sample_indices.npz", **fixed)
    json_write(output_dir / "dataset_checks.json", checks)

    with (output_dir / "case_inventory.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["case_id", "split", "thickness_mm", "force_N", "n_nodes", "sample_points", "holdout_inside_train_convex_hull"])
        for role in ["train", "validation", "test"]:
            for case_id in split[role]:
                case = cases[case_id]
                writer.writerow([case_id, role, *case.globals.tolist(), case.node_ids.size, N_POINTS,
                                 split["holdout_inside_train_convex_hull"].get(case_id, "")])

    files = ["split_info.json", "stats.json", "data_contract.json", "fixed_sample_indices.npz", "dataset_checks.json", "case_inventory.csv"]
    manifest = {
        "schema_version": 1, "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "doe_sha256": doe_hash, "vtu_sha256": vtu_hashes,
        "source_data": "education/data/lhs_doe.csv and education/data/vtu/case_*.vtu",
        "split_sha256": split["split_sha256"], "stats_sha256": stats["stats_sha256"],
        "points_per_case": N_POINTS, "batch_size": 2,
        "artifact_sha256": {name: file_sha256(output_dir / name) for name in files},
        "source_code_sha256": {name: file_sha256(EDUCATION_DIR / name)
                               for name in ["course_utils/dataset.py", "course_utils/dataset_checks.py", "preparation/prepare_dataset.py"]},
        "environment": {"python": platform.python_version(), "numpy": np.__version__, "torch": torch.__version__,
                        "scipy": version("scipy"), "pyvista": version("pyvista")},
        "scope": "Dataset preparation only; no model training, test scoring or inference performed",
    }
    json_write(output_dir / "dataset_manifest.json", manifest)
    # Loading all saved artifacts checks hashes, source identity and portability to a fresh process.
    reloaded_cases, reloaded_split, reloaded_normalizer, reloaded_fixed, _ = load_prepared(data_dir, output_dir)
    if reloaded_split != split or reloaded_normalizer.stats != stats:
        raise AssertionError("Saved split/statistics differ from computed values.")
    if any(not np.array_equal(reloaded_fixed[name], values) for name, values in fixed.items()):
        raise AssertionError("Saved fixed sample indices differ from computed values.")
    print("Output:", output_dir)
    for role in ["train", "validation", "test"]:
        print(f"{role}: {', '.join(split[role])}")
    print("All holdouts inside training convex hull:", all(split["holdout_inside_train_convex_hull"].values()))
    print("Batch shapes:", checks["batch_shapes"]["train"])
    print("Float32 inverse errors:", checks["float32_inverse_max_absolute_error"])
    print("PASS: split isolation, train-only statistics, dynamic/fixed sampling, node-label alignment and artifact reload.")
    return output_dir


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=EDUCATION_DIR / "runs" / "dataset")
    args = parser.parse_args()
    prepare(args.output_dir)
