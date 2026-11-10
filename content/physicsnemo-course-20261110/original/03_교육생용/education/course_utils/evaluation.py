"""Unweighted nodal error metrics and prediction VTU export for the course."""

from pathlib import Path
import numpy as np
import pyvista as pv


def relative_percent(numerator, denominator, epsilon=1e-12):
    return None if abs(denominator) <= epsilon else float(100 * numerator / abs(denominator))


def stress_r2(actual, predicted):
    centered_energy = float(np.sum((actual - actual.mean()) ** 2))
    if centered_energy <= 1e-24:
        return None
    return float(1 - np.sum((predicted - actual) ** 2) / centered_energy)


def case_metrics(case, prediction, indices=None):
    indices = np.arange(len(case.coords)) if indices is None else np.asarray(indices)
    if indices.ndim != 1 or not np.issubdtype(indices.dtype, np.integer) or not len(indices):
        raise ValueError("Evaluation indices must be a nonempty integer vector")
    if np.unique(indices).size != len(indices) or indices.min() < 0 or indices.max() >= len(case.coords):
        raise ValueError("Evaluation indices must be unique and within the case")
    for field, shape in [("stress", case.stress.shape), ("displacement", case.displacement.shape)]:
        if prediction[field].shape != shape or not np.isfinite(prediction[field]).all():
            raise ValueError(f"Invalid full-node predictions: {field}")
    stress = case.stress[indices, 0]
    predicted_stress = prediction["stress"][indices, 0]
    displacement = case.displacement[indices]
    predicted_displacement = prediction["displacement"][indices]
    stress_error = predicted_stress - stress
    vector_error = np.linalg.norm(predicted_displacement - displacement, axis=1)
    actual_magnitude = np.linalg.norm(displacement, axis=1)
    predicted_magnitude = np.linalg.norm(predicted_displacement, axis=1)
    magnitude_error = predicted_magnitude - actual_magnitude
    stress_fea_peak, stress_ai_peak = int(np.argmax(stress)), int(np.argmax(predicted_stress))
    displacement_fea_peak, displacement_ai_peak = int(np.argmax(actual_magnitude)), int(np.argmax(predicted_magnitude))
    stress_peak_difference = float(abs(predicted_stress.max() - stress.max()))
    displacement_peak_difference = float(abs(predicted_magnitude.max() - actual_magnitude.max()))
    row = {
        "case_id": case.case_id, "scope": "full_nodes" if len(indices) == len(case.coords) else "fixed_sample_4096",
        "thickness_mm": float(case.globals[0]), "force_N": float(case.globals[1]), "n_points": int(len(indices)),
        "stress_mae_mpa": float(np.mean(abs(stress_error))),
        "stress_rmse_mpa": float(np.sqrt(np.mean(stress_error ** 2))),
        "stress_r2": stress_r2(stress, predicted_stress),
        "stress_relative_l2_percent": relative_percent(np.linalg.norm(stress_error), np.linalg.norm(stress)),
        "fea_max_stress_mpa": float(stress.max()), "ai_max_stress_mpa": float(predicted_stress.max()),
        "max_stress_abs_error_mpa": stress_peak_difference,
        "max_stress_relative_error_percent": relative_percent(stress_peak_difference, float(stress.max())),
        "fea_max_stress_node_id": int(case.node_ids[indices[stress_fea_peak]]),
        "ai_max_stress_node_id": int(case.node_ids[indices[stress_ai_peak]]),
        "max_stress_location_distance_mm": float(np.linalg.norm(case.coords[indices[stress_fea_peak]] - case.coords[indices[stress_ai_peak]])),
        "negative_stress_count": int(np.sum(predicted_stress < 0)),
        "negative_stress_percent": float(100 * np.mean(predicted_stress < 0)),
        "displacement_mean_vector_error_mm": float(vector_error.mean()),
        "displacement_vector_rmse_mm": float(np.sqrt(np.mean(vector_error ** 2))),
        "displacement_relative_l2_percent": relative_percent(np.linalg.norm(predicted_displacement - displacement), np.linalg.norm(displacement)),
        "displacement_magnitude_mae_mm": float(np.mean(abs(magnitude_error))),
        "displacement_magnitude_rmse_mm": float(np.sqrt(np.mean(magnitude_error ** 2))),
        "fea_max_displacement_mm": float(actual_magnitude.max()),
        "ai_max_displacement_mm": float(predicted_magnitude.max()),
        "max_displacement_abs_error_mm": displacement_peak_difference,
        "max_displacement_relative_error_percent": relative_percent(displacement_peak_difference, float(actual_magnitude.max())),
        "fea_max_displacement_node_id": int(case.node_ids[indices[displacement_fea_peak]]),
        "ai_max_displacement_node_id": int(case.node_ids[indices[displacement_ai_peak]]),
    }
    component_rmse = np.sqrt(np.mean((predicted_displacement - displacement) ** 2, axis=0))
    row.update({f"displacement_{axis}_rmse_mm": float(component_rmse[i]) for i, axis in enumerate(["x", "y", "z"])})
    peaks = {
        "fea_stress_peak_position_mm": case.coords[indices[stress_fea_peak]].tolist(),
        "ai_stress_peak_position_mm": case.coords[indices[stress_ai_peak]].tolist(),
        "fea_displacement_peak_position_mm": case.coords[indices[displacement_fea_peak]].tolist(),
        "ai_displacement_peak_position_mm": case.coords[indices[displacement_ai_peak]].tolist(),
        "tie_policy": "First maximum in the evaluated input ordering",
    }
    return row, peaks


def export_prediction_vtu(source_path, output_path, case, prediction, context):
    source = pv.read(source_path)
    if not np.array_equal(source.points, case.coords) or not np.array_equal(source["node_id"], case.node_ids):
        raise ValueError("Prediction source node ordering differs from the verified case")
    grid = source.copy(deep=True)
    grid.point_data["predicted_stress_mpa"] = prediction["stress"][:, 0]
    grid.point_data["predicted_displacement_mm"] = prediction["displacement"]
    grid.point_data["predicted_displacement_magnitude_mm"] = np.linalg.norm(prediction["displacement"], axis=1)
    grid.point_data["stress_abs_error_mpa"] = abs(prediction["stress"][:, 0] - case.stress[:, 0])
    grid.point_data["displacement_vector_error_mm"] = np.linalg.norm(prediction["displacement"] - case.displacement, axis=1)
    grid.point_data["predicted_stress_negative"] = (prediction["stress"][:, 0] < 0).astype(np.uint8)
    for name, value in [("prediction_model_sha256", context["checkpoint_sha256"]),
                        ("prediction_split_sha256", context["split_sha256"]),
                        ("prediction_stats_sha256", context["stats_sha256"]),
                        ("prediction_stress_policy", "Raw predictions; no clipping or calibration"),
                        ("evaluation_role", "test")]:
        grid.field_data[name] = np.array([value])
    grid.field_data["prediction_selected_epoch"] = np.array([context["selected_epoch"]], dtype=np.int64)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    grid.save(output_path)
    restored = pv.read(output_path)
    for left, right in [(grid.points, restored.points), (grid.cells, restored.cells), (grid.celltypes, restored.celltypes)]:
        if not np.array_equal(left, right):
            raise AssertionError("Prediction VTU geometry/connectivity round trip failed")
    for container in ["point_data", "cell_data", "field_data"]:
        for name, values in getattr(grid, container).items():
            if not np.array_equal(values, getattr(restored, container)[name]):
                raise AssertionError(f"Prediction VTU field round trip failed: {name}")
    # Check the original FEA arrays remain exact, including node IDs and derived stress tensors.
    for name, values in source.point_data.items():
        if not np.array_equal(values, restored.point_data[name]):
            raise AssertionError(f"Original FEA field modified: {name}")
    return output_path
