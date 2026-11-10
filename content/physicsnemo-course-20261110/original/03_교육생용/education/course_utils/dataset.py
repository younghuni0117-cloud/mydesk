"""Case splits, train-only statistics and point-cloud datasets for the course."""

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path

import numpy as np
import pyvista as pv
from scipy.spatial import Delaunay
import torch
from torch.utils.data import DataLoader, Dataset


CONDITION_ORDER = ["thickness_mm", "force_N"]
FIELDS = {"coords": 3, "globals": 2, "stress": 1, "displacement": 3}
SEED = 42
N_POINTS = 4096
BOUNDS = np.array([[6.0, 12.0], [100.0, 500.0]])


def file_sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def content_sha256(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     allow_nan=False).encode("utf-8")).hexdigest()


def json_write(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


@dataclass(frozen=True)
class HookCase:
    case_id: str
    coords: np.ndarray
    globals: np.ndarray
    stress: np.ndarray
    displacement: np.ndarray
    node_ids: np.ndarray
    vtu_sha256: str


def load_cases(data_dir):
    import csv
    data_dir = Path(data_dir)
    with (data_dir / "lhs_doe.csv").open(encoding="utf-8-sig", newline="") as stream:
        doe = list(csv.DictReader(stream))
    if len(doe) != 10 or len({row["case_id"] for row in doe}) != 10:
        raise ValueError("Expected ten unique DOE cases.")
    cases = {}
    for row in doe:
        case_id = row["case_id"]
        path = data_dir / "vtu" / f"{case_id}.vtu"
        report = json.loads(path.with_name(f"{case_id}_validation.json").read_text(encoding="utf-8"))
        digest = file_sha256(path)
        if digest != report["vtu_sha256"] or report["validation"] != "PASS":
            raise ValueError(f"Unverified or changed VTU: {case_id}")
        mesh = pv.read(path)
        for name, expected in [("coordinate_unit", "mm"), ("stress_unit", "MPa"), ("displacement_unit", "mm")]:
            if str(mesh.field_data[name][0]) != expected:
                raise ValueError(f"Unexpected {name} in {case_id}")
        if str(mesh.field_data["case_id"][0]) != case_id:
            raise ValueError("VTU case ID differs from DOE.")
        conditions = np.array([float(row[name]) for name in CONDITION_ORDER], dtype=np.float64)
        actual_conditions = [float(mesh.field_data[name][0]) for name in CONDITION_ORDER]
        if not np.array_equal(conditions, actual_conditions):
            raise ValueError(f"VTU conditions differ from DOE: {case_id}")
        coords = np.array(mesh.points, dtype=np.float64)
        stress = np.array(mesh["von_mises_stress"], dtype=np.float64).reshape(-1, 1)
        displacement = np.array(mesh["displacement"], dtype=np.float64)
        node_ids = np.array(mesh["node_id"], dtype=np.int64)
        if displacement.shape != coords.shape or stress.shape != (mesh.n_points, 1):
            raise ValueError(f"Unexpected field shape: {case_id}")
        if np.unique(node_ids).size != mesh.n_points or mesh.n_points < N_POINTS:
            raise ValueError(f"Duplicate IDs or insufficient nodes: {case_id}")
        for array in (coords, conditions, stress, displacement):
            if not np.isfinite(array).all():
                raise ValueError(f"Non-finite field: {case_id}")
            array.setflags(write=False)
        node_ids.setflags(write=False)
        cases[case_id] = HookCase(case_id, coords, conditions, stress, displacement, node_ids, digest)
    return cases


def validate_split(split, case_ids):
    roles = ["train", "validation", "test"]
    flattened = [case_id for role in roles for case_id in split[role]]
    if len(flattened) != len(set(flattened)):
        raise ValueError("A case occurs in more than one split or is duplicated.")
    if set(flattened) != set(case_ids):
        raise ValueError("Split has missing or unknown cases.")
    if [len(split[role]) for role in roles] != [6, 2, 2]:
        raise ValueError("Expected train/validation/test counts of 6/2/2.")


def make_split(cases, seed=SEED):
    """Select six space-filling training conditions using inputs only."""
    ids = sorted(cases)
    conditions = np.stack([cases[case_id].globals for case_id in ids])
    normalized = (conditions - BOUNDS[:, 0]) / (BOUNDS[:, 1] - BOUNDS[:, 0])
    if not ((normalized >= 0) & (normalized <= 1)).all():
        raise ValueError("DOE conditions fall outside configured bounds.")
    train = sorted(set(np.argmin(normalized, axis=0).tolist() + np.argmax(normalized, axis=0).tolist()))
    rng = np.random.default_rng(seed)
    remaining = [index for index in rng.permutation(len(ids)).tolist() if index not in train]
    while len(train) < 6:
        nearest = np.linalg.norm(normalized[remaining, None] - normalized[train][None], axis=2).min(axis=1)
        train.append(remaining.pop(int(np.argmax(nearest))))
    split = {
        "schema_version": 1, "seed": seed,
        "strategy": "Input extrema in training, then greedy farthest-point selection; seeded remaining order for validation/test",
        "uses_fea_targets_for_selection": False,
        "condition_order": CONDITION_ORDER,
        "scaling_bounds": {name: BOUNDS[index].tolist() for index, name in enumerate(CONDITION_ORDER)},
        "train": [ids[index] for index in sorted(train)],
        "validation": [ids[index] for index in remaining[:2]],
        "test": [ids[index] for index in remaining[2:]],
    }
    validate_split(split, ids)
    hull = Delaunay(normalized[train])
    split["holdout_inside_train_convex_hull"] = {
        ids[index]: bool(hull.find_simplex(normalized[index]) >= 0) for index in remaining
    }
    split["split_sha256"] = content_sha256(split)
    return split


def fit_train_statistics(cases, split):
    """Fit moments from all nodes of TRAIN cases, with equal weight per case."""
    validate_split(split, cases)
    stats = {
        "schema_version": 1, "train_cases": list(split["train"]),
        "split_sha256": split["split_sha256"],
        "weighting": "Equal weight per training case; all nodes within each case have equal weight",
        "sampling_used_to_fit_statistics": False, "std_ddof": 0,
        "condition_order": CONDITION_ORDER,
        "units": {"coords": "mm", "globals": ["mm", "N"], "stress": "MPa", "displacement": "mm"},
        "train_vtu_sha256": {case_id: cases[case_id].vtu_sha256 for case_id in split["train"]},
        "fields": {},
    }
    for field, dimension in FIELDS.items():
        arrays = [getattr(cases[case_id], field).reshape(-1, dimension) for case_id in split["train"]]
        case_means = np.stack([array.mean(axis=0) for array in arrays])
        mean = case_means.mean(axis=0)
        # E_case[var_within_case + (mean_case - mean_global)^2] avoids cancellation.
        variance = np.stack([array.var(axis=0, ddof=0) + (case_mean - mean) ** 2
                             for array, case_mean in zip(arrays, case_means)]).mean(axis=0)
        raw_std = np.sqrt(variance)
        constant = raw_std < 1e-12
        scale = np.where(constant, 1.0, raw_std)
        stats["fields"][field] = {"mean": mean.tolist(), "std": raw_std.tolist(),
                                  "scale": scale.tolist(), "constant_channels": constant.tolist()}
    stats["stats_sha256"] = content_sha256(stats)
    return stats


class Normalizer:
    def __init__(self, stats):
        self.stats = stats
        for field, dimension in FIELDS.items():
            description = stats["fields"][field]
            mean, scale = np.asarray(description["mean"]), np.asarray(description["scale"])
            if mean.shape != (dimension,) or scale.shape != (dimension,):
                raise ValueError(f"Statistics dimension mismatch: {field}")
            if not np.isfinite(mean).all() or not np.isfinite(scale).all() or np.any(scale <= 0):
                raise ValueError(f"Invalid statistics: {field}")

    def _parameters(self, field, values):
        description = self.stats["fields"][field]
        if isinstance(values, torch.Tensor):
            mean = torch.as_tensor(description["mean"], dtype=values.dtype, device=values.device)
            scale = torch.as_tensor(description["scale"], dtype=values.dtype, device=values.device)
        else:
            mean = np.asarray(description["mean"], dtype=np.float64)
            scale = np.asarray(description["scale"], dtype=np.float64)
        return mean, scale

    def normalize(self, field, values):
        mean, scale = self._parameters(field, values)
        return (values - mean) / scale

    def denormalize(self, field, values):
        mean, scale = self._parameters(field, values)
        return values * scale + mean


def point_indices(case, n_points=N_POINTS, seed=SEED, epoch=0):
    if n_points < 1 or n_points > case.node_ids.size:
        raise ValueError("Point count must be positive and no larger than the case node count.")
    case_number = int(case.case_id.rsplit("_", 1)[1])
    rng = np.random.default_rng(np.random.SeedSequence([seed, epoch, case_number]))
    return rng.choice(case.node_ids.size, n_points, replace=False)


class HookPointDataset(Dataset):
    """One item per case; dynamic across training epochs, fixed for holdouts."""
    def __init__(self, cases, case_ids, normalizer, n_points=N_POINTS, seed=SEED,
                 dynamic=False, fixed_indices=None):
        self.cases = cases
        self.case_ids = tuple(case_ids)
        self.normalizer = normalizer
        self.n_points = n_points
        self.seed = seed
        self.dynamic = dynamic
        self.epoch = 0
        self.fixed_indices = {}
        if len(self.case_ids) != len(set(self.case_ids)):
            raise ValueError("Duplicate dataset cases.")
        for case_id in self.case_ids:
            if case_id not in cases:
                raise ValueError(f"Unknown case: {case_id}")
            if not dynamic:
                selected = (point_indices(cases[case_id], n_points, seed) if fixed_indices is None
                            else np.array(fixed_indices[case_id], dtype=np.int64))
                if selected.shape != (n_points,) or np.unique(selected).size != n_points:
                    raise ValueError("Fixed sample has duplicate indices or wrong point count.")
                if selected.min() < 0 or selected.max() >= cases[case_id].node_ids.size:
                    raise ValueError("Fixed sample has out-of-range indices.")
                self.fixed_indices[case_id] = selected

    def __len__(self):
        return len(self.case_ids)

    def set_epoch(self, epoch):
        if int(epoch) != epoch or epoch < 0:
            raise ValueError("Epoch must be a non-negative integer.")
        self.epoch = int(epoch)

    def sample_indices(self, index):
        case_id = self.case_ids[index]
        if self.dynamic:
            return point_indices(self.cases[case_id], self.n_points, self.seed, self.epoch)
        return self.fixed_indices[case_id].copy()

    def __getitem__(self, index):
        case_id = self.case_ids[index]
        case = self.cases[case_id]
        indices = self.sample_indices(index)
        raw = {"coords": case.coords[indices], "globals": case.globals,
               "stress": case.stress[indices], "displacement": case.displacement[indices]}
        item = {field: torch.from_numpy(self.normalizer.normalize(field, values).astype(np.float32))
                for field, values in raw.items()}
        item["node_ids"] = torch.from_numpy(case.node_ids[indices].copy())
        item["case_id"] = case_id
        return item


def create_loaders(cases, split, normalizer, n_points=N_POINTS, batch_size=2, fixed_indices=None):
    validate_split(split, cases)
    if normalizer.stats["split_sha256"] != split["split_sha256"]:
        raise ValueError("Statistics were fitted for a different split.")
    datasets = {
        role: HookPointDataset(cases, split[role], normalizer, n_points, split["seed"],
                               dynamic=(role == "train"), fixed_indices=fixed_indices)
        for role in ["train", "validation", "test"]
    }
    loaders = {role: DataLoader(dataset, batch_size=batch_size, shuffle=(role == "train"),
                               num_workers=0, generator=torch.Generator().manual_seed(split["seed"]))
               for role, dataset in datasets.items()}
    return datasets, loaders


def load_prepared(data_dir, output_dir):
    """Reload the recorded split/statistics/fixed indices in a new process."""
    output_dir = Path(output_dir)
    manifest = json.loads((output_dir / "dataset_manifest.json").read_text(encoding="utf-8"))
    split = json.loads((output_dir / "split_info.json").read_text(encoding="utf-8"))
    stats = json.loads((output_dir / "stats.json").read_text(encoding="utf-8"))
    for value, key in [(split, "split_sha256"), (stats, "stats_sha256")]:
        if content_sha256({name: field for name, field in value.items() if name != key}) != value[key]:
            raise ValueError(f"Modified prepared metadata: {key}")
    for name, digest in manifest["artifact_sha256"].items():
        if file_sha256(output_dir / name) != digest:
            raise ValueError(f"Prepared artifact hash mismatch: {name}")
    if file_sha256(Path(data_dir) / "lhs_doe.csv") != manifest["doe_sha256"]:
        raise ValueError("DOE differs from prepared dataset.")
    cases = load_cases(data_dir)
    if {case_id: case.vtu_sha256 for case_id, case in cases.items()} != manifest["vtu_sha256"]:
        raise ValueError("VTU inputs differ from prepared dataset.")
    with np.load(output_dir / "fixed_sample_indices.npz", allow_pickle=False) as archive:
        fixed = {name: archive[name].copy() for name in archive.files}
    return cases, split, Normalizer(stats), fixed, manifest
