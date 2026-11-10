"""Chapter 6: explicit frozen-run evaluation, real mesh plots and fresh reload audit."""
from pathlib import Path
import csv
import json
import numpy as np
import pyvista as pv
import torch
import physicsnemo
from physicsnemo.metrics.general.mse import rmse
from .dataset import file_sha256
from .inference import load_selected_model, predict_fields
from .evaluation import case_metrics, export_prediction_vtu
from .training import seed_training


def evaluate_case(case, prediction, indices=None):
    row, peaks = case_metrics(case, prediction, indices)
    selected = np.arange(len(case.coords)) if indices is None else np.asarray(indices)
    # Evaluate physical-unit float64 fields using the official PhysicsNeMo API.
    # Each case/scope stays separate; do not mix MPa and mm in a single RMSE.
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    tensor = lambda values: torch.tensor(values, dtype=torch.float64, device=device)
    predicted_stress = tensor(prediction['stress'][selected])
    target_stress = tensor(case.stress[selected])
    predicted_displacement = tensor(prediction['displacement'][selected])
    target_displacement = tensor(case.displacement[selected])
    vector_error = torch.linalg.vector_norm(predicted_displacement-target_displacement, dim=1)
    component_rmse = rmse(predicted_displacement, target_displacement, dim=0)
    official = dict(stress_rmse_mpa=rmse(predicted_stress, target_stress).item(),
        displacement_vector_rmse_mm=rmse(vector_error, torch.zeros_like(vector_error)).item(),
        displacement_magnitude_rmse_mm=rmse(
            torch.linalg.vector_norm(predicted_displacement, dim=1),
            torch.linalg.vector_norm(target_displacement, dim=1)).item(),
        **{f'displacement_{a}_rmse_mm': component_rmse[i].item() for i,a in enumerate('xyz')})
    # This independent NumPy reference also guards vector-vs-component semantics.
    for key, value in official.items():
        np.testing.assert_allclose(value, row[key], rtol=1e-12, atol=1e-12)
    row.update(official)
    delta = prediction['displacement'][selected] - case.displacement[selected]
    row.update({f'displacement_{a}_mae_mm': float(np.abs(delta[:, i]).mean())
                for i, a in enumerate('xyz')})
    row['max_displacement_location_distance_mm'] = float(np.linalg.norm(
        np.array(peaks['ai_displacement_peak_position_mm']) - peaks['fea_displacement_peak_position_mm']))
    return row, peaks


def print_metrics(row):
    print(f"{row['case_id']} | {row['scope']} | {row['n_points']:,}개 노드")
    for key, label in [('stress_mae_mpa', '응력 MAE(MPa)'),
                       *[(f'displacement_{a}_mae_mm', f'변위 {a.upper()} MAE(mm)') for a in 'xyz'],
                       ('displacement_magnitude_mae_mm', '변위 크기 MAE(mm)'),
                       ('stress_rmse_mpa', '응력 RMSE(MPa)'),
                       *[(f'displacement_{a}_rmse_mm', f'변위 {a.upper()} RMSE(mm)') for a in 'xyz'],
                       ('displacement_magnitude_rmse_mm', '변위 크기 RMSE(mm)'),
                       ('displacement_vector_rmse_mm', '변위 벡터 RMSE(mm)')]:
        print(f"  {label}: {row[key]:.6g}")
    print(f"  음수 응력: {row['negative_stress_count']}개 ({row['negative_stress_percent']:.3f}%)")


def print_peaks(row, peaks):
    for field, label, unit in [('stress', '최대응력', 'MPa'), ('displacement', '최대 변위 크기', 'mm')]:
        value_key = 'max_stress_mpa' if field == 'stress' else 'max_displacement_mm'
        print(label)
        for role, title in [('fea', 'ANSYS 정답'), ('ai', 'Transolver 예측')]:
            xyz = peaks[f'{role}_{field}_peak_position_mm']
            print(f"  {title}: {row[f'{role}_{value_key}']:.6f} {unit} | 노드 ID {row[f'{role}_max_{field}_node_id']}")
            print('    변형 전 좌표(mm):', ', '.join(f'{a}={v:.6f}' for a, v in zip('XYZ', xyz)))
        print(f"  최대값 절대차: {row[f'max_{field}_abs_error_' + ('mpa' if field == 'stress' else 'mm')]:.6f} {unit}")
        print(f"  최대 위치 거리: {row[f'max_{field}_location_distance_mm']:.6f} mm")


def plot_case(education_dir, case, prediction, output_path):
    """Undeformed real surface; prediction nodes stay in original VTU order."""
    grid = pv.read(Path(education_dir)/'data/vtu'/f'{case.case_id}.vtu')
    np.testing.assert_array_equal(grid.points, case.coords)
    np.testing.assert_array_equal(grid['node_id'], case.node_ids)
    stress = [case.stress[:, 0], prediction['stress'][:, 0],
              np.abs(prediction['stress'][:, 0]-case.stress[:, 0])]
    displacement = [np.linalg.norm(case.displacement, axis=1),
                    np.linalg.norm(prediction['displacement'], axis=1),
                    np.linalg.norm(prediction['displacement']-case.displacement, axis=1)]
    for r, values in enumerate([stress, displacement]):
        for col, values_col in enumerate(values):
            grid.point_data[f'panel_{r}_{col}'] = values_col
    surface = grid.extract_surface(algorithm='dataset_surface')
    plotter = pv.Plotter(off_screen=True, shape=(2, 3), window_size=(1650, 1250), border=False)
    try:
        for r, (values, unit, field) in enumerate([(stress, 'MPa', '응력'), (displacement, 'mm', '변위 크기')]):
            low = min(0., float(values[0].min()), float(values[1].min()))
            high = max(float(values[0].max()), float(values[1].max()), low+1e-12)
            for col, title in enumerate(['ANSYS 정답', 'Transolver 예측', '절대오차' if r == 0 else '벡터 차이의 크기']):
                plotter.subplot(r, col)
                plotter.set_background('white')
                limits = (low, high) if col < 2 else (0., max(float(values[col].max()), 1e-12))
                key = f'panel_{r}_{col}'
                plotter.add_mesh(surface, scalars=key, clim=limits,
                    cmap='turbo' if col < 2 else 'viridis', lighting=False, show_edges=False,
                    scalar_bar_args=dict(title=key, color='black', fmt='%.3g', n_labels=4,
                        width=.7, height=.08, position_x=.15, position_y=.06,
                        title_font_size=15, label_font_size=15))
                plotter.scalar_bars[key].SetTitle(unit)
                plotter.add_text(f'{field}: {title}', font_file='C:/Windows/Fonts/malgun.ttf',
                                 font_size=16, color='black')
                plotter.view_xy()
                plotter.camera.roll = 0
        plotter.link_views()
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        plotter.screenshot(str(output_path))
        return output_path
    finally:
        plotter.close()


def save_evaluation(education_dir, output_dir, training_run, context, cases, split, fixed, predictions, device):
    output_dir = Path(output_dir)
    rows, records = [], {}
    for cid in split['test']:
        case, prediction = cases[cid], predictions[cid]
        metrics, peaks = [], {}
        for indices in [None, fixed[cid]]:
            row, locations = evaluate_case(case, prediction, indices)
            rows.append(row); metrics.append(row); peaks[row['scope']] = locations
        vtu = export_prediction_vtu(Path(education_dir)/'data/vtu'/f'{cid}.vtu',
            output_dir/'predictions_vtu'/f'{cid}_prediction.vtu', case, prediction, context)
        records[cid] = dict(metrics=metrics, peaks=peaks, prediction_vtu=str(vtu.relative_to(output_dir)))
    with (output_dir/'test_metrics.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0])); writer.writeheader(); writer.writerows(rows)
    report = dict(status='completed', training_run=str(Path(training_run).resolve()), context=context,
        test_cases=split['test'], device=str(device), gpu=torch.cuda.get_device_name(device) if str(device).startswith('cuda') else None,
        torch=str(torch.__version__), cases=records, test_used_to_update_model=False,
        physicsnemo=str(physicsnemo.__version__),
        rmse_implementation='physicsnemo.metrics.general.mse.rmse; physical-unit float64 tensors; GPU when available',
        inference_policy='One complete case per forward call; float32; no independent node chunks',
        metric_policy='Unweighted nodes; full and fixed-sample metrics sliced from the same full prediction',
        stress_policy='Raw; no clipping, scaling or calibration')
    (output_dir/'evaluation_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    paths = [output_dir/'test_metrics.csv', output_dir/'evaluation_report.json',
             *[output_dir/r['prediction_vtu'] for r in records.values()], *sorted(output_dir.glob('*.png'))]
    names = ['course_utils/transolver_evaluation.py', 'course_utils/inference.py', 'course_utils/evaluation.py']
    manifest = dict(status='completed', context=context, test_used_to_update_model=False,
        source_vtu_sha256={cid:cases[cid].vtu_sha256 for cid in split['test']},
        artifact_sha256={str(p.relative_to(output_dir)):file_sha256(p) for p in paths},
        source_code_sha256={name:file_sha256(Path(education_dir)/name) for name in names})
    (output_dir/'evaluation_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return report


def audit_evaluation(education_dir, output_dir, device='cuda'):
    """Run this in a fresh process, checking this run's actual artifacts."""
    seed_training(42)
    education_dir, output_dir = Path(education_dir), Path(output_dir)
    report = json.loads((output_dir/'evaluation_report.json').read_text(encoding='utf-8'))
    manifest = json.loads((output_dir/'evaluation_manifest.json').read_text(encoding='utf-8'))
    for name, digest in manifest['artifact_sha256'].items():
        assert file_sha256(output_dir/name) == digest, name
    for name, digest in manifest['source_code_sha256'].items():
        assert file_sha256(education_dir/name) == digest, name
    model, norm, cases, split, fixed, context = load_selected_model(education_dir, report['training_run'], device)
    assert getattr(model, 'requires_full_point_context', False)
    assert context == report['context'] == manifest['context']
    assert report['test_cases'] == split['test']
    assert report['test_used_to_update_model'] is manifest['test_used_to_update_model'] is False
    weights = {k:v.detach().clone() for k,v in model.state_dict().items()}
    with (output_dir/'test_metrics.csv').open(encoding='utf-8-sig', newline='') as stream:
        csv_rows = list(csv.DictReader(stream))
    assert len(csv_rows) == 2*len(split['test'])
    result = {}
    for cid in split['test']:
        case = cases[cid]; record = report['cases'][cid]
        assert file_sha256(education_dir/'data/vtu'/f'{cid}.vtu') == manifest['source_vtu_sha256'][cid]
        grid = pv.read(output_dir/record['prediction_vtu'])
        source = pv.read(education_dir/'data/vtu'/f'{cid}.vtu')
        for name in ['points', 'cells', 'celltypes']:
            np.testing.assert_array_equal(getattr(source,name), getattr(grid,name))
        for container in ['point_data','cell_data','field_data']:
            for name, values in getattr(source, container).items():
                np.testing.assert_array_equal(values, getattr(grid, container)[name])
        for name, key in [('prediction_model_sha256','checkpoint_sha256'), ('prediction_split_sha256','split_sha256'), ('prediction_stats_sha256','stats_sha256')]:
            assert str(grid.field_data[name][0]) == context[key]
        assert int(grid.field_data['prediction_selected_epoch'][0]) == context['selected_epoch']
        assert str(grid.field_data['evaluation_role'][0]) == 'test'
        stored = dict(stress=np.asarray(grid['predicted_stress_mpa']).reshape(-1,1),
                      displacement=np.asarray(grid['predicted_displacement_mm']))
        np.testing.assert_array_equal(grid['stress_abs_error_mpa'], abs(stored['stress'][:,0]-case.stress[:,0]))
        np.testing.assert_array_equal(grid['displacement_vector_error_mm'], np.linalg.norm(stored['displacement']-case.displacement,axis=1))
        np.testing.assert_array_equal(grid['predicted_displacement_magnitude_mm'], np.linalg.norm(stored['displacement'],axis=1))
        calls=[]
        handle=model.register_forward_pre_hook(lambda module,args:calls.append(tuple(args[0][0].shape)))
        try:
            fresh = predict_fields(model, norm, case.coords, case.globals)
        finally:
            handle.remove()
        assert calls == [(1,len(case.coords),3)], calls
        differences = {}
        for field, tolerance in [('stress',1e-4),('displacement',1e-6)]:
            differences[field]=float(np.max(abs(fresh[field]-stored[field])))
            assert differences[field] <= tolerance, differences
        for indices, recorded in zip([None,fixed[cid]],record['metrics'],strict=True):
            row, peaks = evaluate_case(case, stored, indices)
            assert row.keys() == recorded.keys()
            for key, value in row.items():
                if isinstance(value, float):
                    np.testing.assert_allclose(value, recorded[key], rtol=1e-12, atol=1e-12)
                else:
                    assert value == recorded[key]
            assert peaks == record['peaks'][row['scope']]
            csv_row=next(r for r in csv_rows if r['case_id']==cid and r['scope']==row['scope'])
            # CSV must be an exact serialization of the saved JSON row.
            assert all(csv_row[k] == ('' if v is None else str(v)) for k,v in recorded.items())
        result[cid]=dict(nodes=len(case.coords),one_full_case_forward=True,
            geometry_and_original_fields_preserved=True, metrics_and_csv_recomputed=True,
            maximum_reload_difference=differences)
    assert all(torch.equal(weights[k], v) for k,v in model.state_dict().items())
    assert all(p.grad is None for p in model.parameters())
    assert file_sha256(context['checkpoint']) == context['checkpoint_sha256']
    audit = dict(passed=True, fresh_process=True, model_sha256=context['checkpoint_sha256'],
        selected_epoch=context['selected_epoch'], frozen_weights_and_file_unchanged=True,
        tolerance=dict(stress_MPa=1e-4,displacement_mm=1e-6), cases=result)
    (output_dir/'reload_check.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return audit
