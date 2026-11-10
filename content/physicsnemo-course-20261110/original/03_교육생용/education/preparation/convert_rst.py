"""Convert the independent educational Tet10 RSTs to validated mm/MPa VTUs.

DPF extracts native displacement and elemental-nodal global stress tensors.
NumPy averages tensors at corner nodes, extends averaged tensors to midside
nodes, and then computes von Mises stress. Quadratic connectivity is preserved.
"""

import argparse
import csv
from datetime import datetime, timezone
import hashlib
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
import time

import numpy as np
import pyvista as pv
from ansys.dpf import core as dpf


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
EDGES = np.array([[0, 1], [1, 2], [2, 0], [0, 3], [1, 3], [2, 3]])
REFERENCE_TOLERANCE_PERCENT = 0.01
POLICY = "global tensor average at corners -> midside tensor interpolation -> von Mises"
SOURCES = {
    "dpf_native_extraction": "https://dpf.docs.pyansys.com/version/stable/getting_started/licensing.html",
    "mechanical_averaging": "https://ansyshelp.ansys.com/public/Views/Secured/corp/v252/en/wb_sim/ds_Unaveraged_Results.html",
}


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def index_by_id(target, source):
    """Find source positions by ID; never assume result and mesh ordering agree."""
    target, source = np.asarray(target), np.asarray(source)
    if np.unique(source).size != source.size:
        raise ValueError("Duplicate source IDs.")
    order = np.argsort(source)
    positions = np.searchsorted(source[order], target)
    if np.any(positions >= source.size) or not np.array_equal(source[order[positions]], target):
        raise ValueError("Missing node or element IDs in extracted data.")
    return order[positions]


def von_mises(tensors):
    sx, sy, sz, txy, tyz, txz = np.moveaxis(tensors, -1, 0)
    return np.sqrt(0.5 * ((sx - sy) ** 2 + (sy - sz) ** 2 + (sz - sx) ** 2)
                   + 3 * (txy ** 2 + tyz ** 2 + txz ** 2))


def average_tet10_stress(connectivity, tensors, n_nodes):
    counts = np.zeros(n_nodes, dtype=np.int64)
    averaged = np.zeros((n_nodes, 6), dtype=np.float64)
    corners = connectivity[:, :4].ravel()
    np.add.at(counts, corners, 1)
    np.add.at(averaged, corners, tensors.reshape(-1, 6))
    is_corner = counts > 0
    averaged[is_corner] /= counts[is_corner, None]

    mid_nodes = connectivity[:, 4:].ravel()
    pairs = np.sort(connectivity[:, EDGES].reshape(-1, 2), axis=1)
    unique_mid, first = np.unique(mid_nodes, return_index=True)
    edge_for_node = np.full((n_nodes, 2), -1, dtype=np.int64)
    edge_for_node[unique_mid] = pairs[first]
    if not np.array_equal(edge_for_node[mid_nodes], pairs):
        raise ValueError("Inconsistent corner pairs for a shared midside node.")
    if np.any(is_corner[unique_mid]) or not np.all(is_corner[pairs]):
        raise ValueError("Unexpected mixed corner/midside topology.")
    if int(is_corner.sum()) + unique_mid.size != n_nodes:
        raise ValueError("Nodes missing stress coverage.")
    averaged[unique_mid] = averaged[edge_for_node[unique_mid]].mean(axis=1)
    return averaged, counts, is_corner, unique_mid.size


def load_case_records():
    with (DATA_DIR / "rst_manifest.csv").open(encoding="utf-8-sig", newline="") as stream:
        manifest = list(csv.DictReader(stream))
    log_path = DATA_DIR / "results" / "wb_files" / "user_files" / "DesignPointLog.csv"
    with log_path.open(encoding="utf-8-sig", newline="") as stream:
        references = list(csv.DictReader(line for line in stream if line.strip() and not line.lstrip().startswith("#")))
    header = log_path.read_text(encoding="utf-8-sig")
    if "P3 - Total Deformation Maximum [m]" not in header or "P4 - Equivalent Stress Maximum [Pa]" not in header:
        raise ValueError("Workbench reference result units differ from expected m/Pa.")
    refs = {row["Name"]: row for row in references}
    if len(refs) != len(references):
        raise ValueError("Duplicate Workbench reference design points.")
    return manifest, refs


def convert_case(record, reference, server, output_dir=None):
    """Convert one case; explicit output_dir keeps learner output separate."""
    started = time.perf_counter()
    rst_path = DATA_DIR / record["rst_file"]
    source_hash = sha256(rst_path)
    if source_hash != record["sha256"]:
        raise ValueError(f"RST hash differs from collection manifest: {rst_path}")
    model = dpf.Model(str(rst_path), server=server)
    mesh = model.metadata.meshed_region
    coordinate_field = mesh.nodes.coordinates_field
    if mesh.unit != "m" or coordinate_field.unit != "m":
        raise ValueError(f"Unsupported coordinate units: {mesh.unit}, {coordinate_field.unit}")
    node_ids = np.array(mesh.nodes.scoping.ids, dtype=np.int64)
    points = np.array(coordinate_field.data, dtype=np.float64)[index_by_id(node_ids, coordinate_field.scoping.ids)] * 1000
    element_ids = np.array(mesh.elements.scoping.ids, dtype=np.int64)
    types = np.array(mesh.elements.element_types_field.data)
    conn_field = mesh.elements.connectivities_field
    flat_connectivity = np.array(conn_field.data, dtype=np.int64)
    offsets = np.array(conn_field.entity_data_offsets, dtype=np.int64)
    sizes = np.diff(np.append(offsets, flat_connectivity.size))
    if not np.all(types == 0) or not np.all(sizes == 10):
        raise ValueError("This educational converter supports only complete quadratic Tet10 meshes.")
    connectivity = flat_connectivity.reshape(-1, 10)[index_by_id(element_ids, conn_field.scoping.ids)]
    if connectivity.min() < 0 or connectivity.max() >= node_ids.size:
        raise ValueError("Invalid connectivity index.")

    times = np.array(model.metadata.time_freq_support.time_frequencies.data, dtype=float)
    if times.size == 0 or not np.isfinite(times).all():
        raise ValueError("No finite result times in RST.")
    selected_set = int(times.size)
    args = dict(time_scoping=[selected_set], data_sources=model.metadata.data_sources, server=server)
    displacement_fc = dpf.operators.result.displacement(**args).outputs.fields_container()
    stress_fc = dpf.operators.result.stress(**args, bool_rotate_to_global=True).outputs.fields_container()
    if len(displacement_fc) != 1 or len(stress_fc) != 1:
        raise ValueError("Expected one displacement field and one solid stress field.")
    displacement_field, stress_field = displacement_fc[0], stress_fc[0]
    if displacement_field.location != "Nodal" or displacement_field.unit != "m":
        raise ValueError("Unexpected displacement location/unit.")
    if stress_field.location != "ElementalNodal" or stress_field.unit != "Pa":
        raise ValueError("Unexpected native stress location/unit.")
    displacement = np.array(displacement_field.data, dtype=np.float64)[index_by_id(node_ids, displacement_field.scoping.ids)] * 1000
    stress_data = np.array(stress_field.data, dtype=np.float64)
    stress_offsets = np.array(stress_field.entity_data_offsets, dtype=np.int64)
    if not np.all(np.diff(np.append(stress_offsets, stress_data.size)) == 24):
        raise ValueError("Expected six stress components at four corner nodes per element.")
    tensors = stress_data.reshape(-1, 4, 6)[index_by_id(element_ids, stress_field.scoping.ids)] / 1e6
    averaged, contributions, is_corner, n_mid = average_tet10_stress(connectivity, tensors, node_ids.size)
    stress = von_mises(averaged)
    magnitude = np.linalg.norm(displacement, axis=1)
    for array in (points, displacement, averaged, stress, magnitude):
        if not np.isfinite(array).all():
            raise ValueError("Non-finite coordinate or result value.")
    if displacement.shape != points.shape or np.any(stress < 0):
        raise ValueError("Invalid output shape or negative equivalent stress.")

    # Materialize independent NumPy arrays to avoid DPFArray/VTK ownership issues.
    cells = np.column_stack((np.full(element_ids.size, 10), connectivity)).ravel()
    grid = pv.UnstructuredGrid(cells.copy(), np.full(element_ids.size, 24, dtype=np.uint8), points.copy())
    grid.point_data["node_id"] = node_ids
    grid.point_data["von_mises_stress"] = stress
    grid.point_data["displacement"] = displacement
    grid.point_data["displacement_magnitude"] = magnitude
    grid.point_data["stress_tensor"] = averaged
    grid.point_data["is_corner_node"] = is_corner.astype(np.uint8)
    grid.point_data["stress_element_contributions"] = contributions
    grid.cell_data["element_id"] = element_ids
    for key, value in {"case_id": record["case_id"], "coordinate_unit": "mm", "stress_unit": "MPa",
                       "displacement_unit": "mm", "stress_policy": POLICY}.items():
        grid.field_data[key] = np.array([value])
    grid.field_data["thickness_mm"] = np.array([float(record["thickness_mm"])])
    grid.field_data["force_N"] = np.array([float(record["force_N"])])
    grid.field_data["result_set_id"] = np.array([selected_set])
    grid.field_data["result_time_s"] = np.array([times[-1]])

    wb_stress, wb_displacement = float(reference["P4"]) / 1e6, float(reference["P3"]) * 1000
    stress_error = abs(float(stress.max()) - wb_stress) / abs(wb_stress) * 100
    disp_error = abs(float(magnitude.max()) - wb_displacement) / abs(wb_displacement) * 100
    if max(stress_error, disp_error) > REFERENCE_TOLERANCE_PERCENT:
        raise ValueError(f"Workbench maximum mismatch: stress {stress_error:.6g}%, displacement {disp_error:.6g}%.")
    thickness_error = abs(float(np.ptp(points[:, 2])) - float(record["thickness_mm"]))
    if thickness_error > 1e-5:
        raise ValueError("Actual Z thickness differs from DOE thickness.")

    output_dir = DATA_DIR / "vtu" if output_dir is None else Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{record['case_id']}.vtu"
    grid.save(output_path, binary=True)
    loaded = pv.read(output_path)
    if loaded.n_points != node_ids.size or loaded.n_cells != element_ids.size:
        raise ValueError("VTU round-trip node/element counts differ.")
    for name in grid.point_data:
        if not np.array_equal(loaded.point_data[name], grid.point_data[name]):
            raise ValueError(f"VTU round-trip changed point field: {name}")
    if not np.array_equal(loaded.points, points) or not np.array_equal(loaded.cells, cells):
        raise ValueError("VTU round-trip changed coordinates or connectivity.")
    if not np.all(loaded.celltypes == 24) or not np.array_equal(loaded.cell_data["element_id"], element_ids):
        raise ValueError("VTU round-trip changed quadratic element types or IDs.")

    summary = {
        "case_id": record["case_id"], "workbench_design_point": record["workbench_design_point"],
        "thickness_mm": float(record["thickness_mm"]), "force_N": float(record["force_N"]),
        "n_nodes": int(node_ids.size), "n_elements": int(element_ids.size),
        "corner_nodes": int(is_corner.sum()), "midside_nodes": int(n_mid),
        "result_set_id": selected_set, "result_time_s": float(times[-1]),
        "max_stress_mpa": float(stress.max()), "workbench_max_stress_mpa": wb_stress,
        "max_stress_difference_percent": stress_error,
        "max_displacement_mm": float(magnitude.max()), "workbench_max_displacement_mm": wb_displacement,
        "max_displacement_difference_percent": disp_error,
        "vtu_file": Path(os.path.relpath(output_path, DATA_DIR)).as_posix(), "validation": "PASS",
    }
    stress_index, displacement_index = int(stress.argmax()), int(magnitude.argmax())
    report = {
        **summary,
        "rst_file": record["rst_file"], "rst_sha256": source_hash, "vtu_sha256": sha256(output_path),
        "source_units": {"coordinates": "m", "displacement": "m", "stress": "Pa"},
        "output_units": {"coordinates": "mm", "displacement": "mm", "stress": "MPa", "force": "N"},
        "conversion_factors": {"coordinates": 1000, "displacement": 1000, "stress": 1e-6},
        "source_stress_location": "ElementalNodal, four corner tensors per Tet10",
        "output_stress_location": "Nodal, all corner and midside nodes",
        "stress_component_order": ["SX", "SY", "SZ", "SXY", "SYZ", "SXZ"],
        "stress_policy": POLICY,
        "midside_stress_is_derived": True,
        "mesh_policy": "Preserve all Tet10 nodes and quadratic VTK type 24 connectivity",
        "node_id_alignment": "Explicit ID mapping for coordinates and displacement; explicit element ID mapping for stress",
        "reference_tolerance_percent": REFERENCE_TOLERANCE_PERCENT,
        "max_unaveraged_element_nodal_stress_mpa": float(von_mises(tensors).max()),
        "max_stress_node_id": int(node_ids[stress_index]), "max_stress_position_mm": points[stress_index].tolist(),
        "max_displacement_node_id": int(node_ids[displacement_index]),
        "bounds_min_mm": points.min(axis=0).tolist(), "bounds_max_mm": points.max(axis=0).tolist(),
        "thickness_difference_mm": thickness_error,
        "all_fields_finite": True, "complete_stress_coverage": True, "vtu_round_trip_verified": True,
        "dpf_server_version": server.version, "dpf_server_context": "Entry (native extraction)",
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "environment": {"python": platform.python_version(), "numpy": np.__version__, "pyvista": pv.__version__,
                        "ansys_dpf_core": version("ansys-dpf-core")},
        "converter_sha256": sha256(__file__), "references": SOURCES,
        "elapsed_seconds": round(time.perf_counter() - started, 3),
    }
    report_path = output_dir / f"{record['case_id']}_validation.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{record['case_id']}: {node_ids.size} nodes, {element_ids.size} elements; "
          f"max stress {stress.max():.6f} MPa, displacement {magnitude.max():.6f} mm; PASS", flush=True)
    return summary, report


def resolve_ansys_path(explicit=None):
    """Use an explicit override, otherwise the same lookup as chapter 2."""
    selected = explicit if explicit is not None else os.environ.get(
        "AWP_ROOT252", "C:/Program Files/ANSYS Inc/v252")
    if not selected or not Path(selected).is_dir():
        raise FileNotFoundError(
            f"ANSYS 2025 R2 설치 폴더를 찾지 못했습니다: {selected!r}. "
            "2장 Notebook에서 출력한 ANSYS 2025 R2 경로를 확인하고, "
            "--ansys-path 옵션에 그 경로를 따옴표로 묶어 지정하세요.")
    return str(Path(selected))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", default="case_001", help="Case ID or 'all'; default: representative case_001")
    parser.add_argument("--ansys-path", default=None, help="ANSYS 2025 R2 directory; default: AWP_ROOT252 or standard installation")
    parser.add_argument("--output-dir", type=Path,
                        default=DATA_DIR.parent / "runs/conversion/latest",
                        help="VTU/report folder; default: education/runs/conversion/latest")
    args = parser.parse_args()
    args.ansys_path = resolve_ansys_path(args.ansys_path)
    records, references = load_case_records()
    selected = records if args.case == "all" else [row for row in records if row["case_id"] == args.case]
    if not selected:
        raise ValueError(f"Unknown case: {args.case}")
    server = dpf.start_local_server(ansys_path=args.ansys_path, as_global=False,
                                    context=dpf.AvailableServerContexts.entry, timeout=30)
    try:
        summaries, reports = [], []
        for record in selected:
            summary, report = convert_case(record, references[record["workbench_design_point"]], server,
                                           output_dir=args.output_dir)
            summaries.append(summary)
            reports.append(report)
        output_dir = args.output_dir.resolve()
        name = "conversion_summary.csv" if args.case == "all" else f"{args.case}_summary.csv"
        with (output_dir / name).open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.DictWriter(stream, fieldnames=list(summaries[0]))
            writer.writeheader()
            writer.writerows(summaries)
        if args.case == "all":
            batch = {"schema_version": 1, "cases_converted": len(reports), "all_passed": True,
                     "result_units": {"coordinates": "mm", "stress": "MPa", "displacement": "mm"},
                     "stress_policy": POLICY, "case_reports": [f"{row['case_id']}_validation.json" for row in summaries],
                     "max_stress_difference_percent": max(row["max_stress_difference_percent"] for row in summaries),
                     "max_displacement_difference_percent": max(row["max_displacement_difference_percent"] for row in summaries)}
            (output_dir / "batch_validation.json").write_text(json.dumps(batch, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    finally:
        server.shutdown()


if __name__ == "__main__":
    main()
