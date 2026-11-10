"""Behavioral audits of saved case splits, leakage and sampled node alignment."""

from dataclasses import replace

import numpy as np
import torch

from .dataset import FIELDS, create_loaders, fit_train_statistics, validate_split


def audit_dataset(cases, split, normalizer, fixed_indices, n_points=4096):
    validate_split(split, cases)
    datasets, loaders = create_loaders(cases, split, normalizer, n_points, fixed_indices=fixed_indices)
    results = {"case_counts": {role: len(dataset) for role, dataset in datasets.items()},
               "point_count": n_points, "split_disjoint_and_complete": True}

    # Changing every holdout field must not affect statistics fitted to training.
    perturbed = dict(cases)
    for case_id in split["validation"] + split["test"]:
        case = cases[case_id]
        perturbed[case_id] = replace(case, coords=case.coords + 1e6, globals=case.globals + 1e6,
                                    stress=case.stress + 1e6, displacement=case.displacement - 1e6)
    if fit_train_statistics(perturbed, split) != normalizer.stats:
        raise AssertionError("Holdout data affected training statistics.")
    results["holdout_mutation_does_not_change_statistics"] = True

    invalid = {**split, "train": split["train"] + [split["validation"][0]]}
    try:
        validate_split(invalid, cases)
    except ValueError:
        results["overlapping_split_rejected"] = True
    else:
        raise AssertionError("Overlapping cases were not rejected.")

    train = datasets["train"]
    train.set_epoch(0)
    epoch_zero = train[0]["node_ids"].clone()
    if not torch.equal(epoch_zero, train[0]["node_ids"]):
        raise AssertionError("Within-epoch training sample is not deterministic.")
    train.set_epoch(1)
    if torch.equal(epoch_zero, train[0]["node_ids"]):
        raise AssertionError("Training nodes did not change across epochs.")
    train.set_epoch(0)
    results["train_sample_reproducible_within_epoch"] = True
    results["train_sample_changes_between_epochs"] = True
    for role in ["validation", "test"]:
        dataset = datasets[role]
        original = dataset[0]["node_ids"].clone()
        dataset.set_epoch(99)
        if not torch.equal(original, dataset[0]["node_ids"]):
            raise AssertionError(f"{role} nodes changed between epochs.")
    results["holdout_samples_fixed_across_epochs"] = True

    maximum_errors = {field: 0.0 for field in FIELDS}
    batch_shapes = {}
    for role, loader in loaders.items():
        seen = []
        for batch in loader:
            expected_shapes = {"coords": (2, n_points, 3), "globals": (2, 2),
                               "stress": (2, n_points, 1), "displacement": (2, n_points, 3),
                               "node_ids": (2, n_points)}
            for field, shape in expected_shapes.items():
                if tuple(batch[field].shape) != shape:
                    raise AssertionError(f"Wrong batch shape: {role}, {field}")
            batch_shapes[role] = {field: list(batch[field].shape) for field in expected_shapes}
            for field in FIELDS:
                if batch[field].dtype != torch.float32 or not torch.isfinite(batch[field]).all():
                    raise AssertionError("Batch is non-finite or not float32.")
            for index, case_id in enumerate(batch["case_id"]):
                seen.append(case_id)
                case = cases[case_id]
                ids = batch["node_ids"][index].numpy()
                if np.unique(ids).size != n_points:
                    raise AssertionError("Duplicated sampled nodes.")
                # Independent ID lookup checks that sampled coordinates and labels belong together.
                by_id = {int(node_id): position for position, node_id in enumerate(case.node_ids)}
                positions = np.array([by_id[int(node_id)] for node_id in ids])
                for field in FIELDS:
                    reference = case.globals if field == "globals" else getattr(case, field)[positions]
                    restored = normalizer.denormalize(field, batch[field][index]).numpy().astype(np.float64)
                    error = float(np.max(np.abs(restored - reference)))
                    tolerance = 1e-5 + 1e-6 * float(np.max(np.abs(reference)))
                    if error > tolerance:
                        raise AssertionError(f"Node/label alignment or inverse-normalization error: {field}")
                    maximum_errors[field] = max(maximum_errors[field], error)
        if sorted(seen) != sorted(split[role]):
            raise AssertionError("DataLoader omitted or mixed cases.")
    results["batch_shapes"] = batch_shapes
    results["all_batch_fields_finite_float32"] = True
    results["sampled_nodes_unique_and_labels_aligned"] = True
    results["float32_inverse_max_absolute_error"] = maximum_errors

    train_moments = {}
    for field, dimension in FIELDS.items():
        values = [normalizer.normalize(field, getattr(cases[case_id], field).reshape(-1, dimension))
                  for case_id in split["train"]]
        mean = np.stack([array.mean(axis=0) for array in values]).mean(axis=0)
        second_moment = np.stack([(array ** 2).mean(axis=0) for array in values]).mean(axis=0)
        constant = np.array(normalizer.stats["fields"][field]["constant_channels"])
        if not np.allclose(mean, 0, atol=1e-10) or not np.allclose(second_moment[~constant], 1, atol=1e-10):
            raise AssertionError("Equal-case training normalization does not have mean 0/variance 1.")
        train_moments[field] = {"mean": mean.tolist(), "second_moment": second_moment.tolist()}
    results["normalized_train_moments"] = train_moments
    results["all_passed"] = True
    return results
