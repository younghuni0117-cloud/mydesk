"""Plot actual training records and full-context validation mesh predictions."""
from pathlib import Path
import json
import numpy as np
import torch
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter, LogLocator, NullLocator
from .inference import predict_fields

def plot_history(run_dir, output_path):
    run_dir, output_path = Path(run_dir), Path(output_path)
    rows = json.loads((run_dir / 'history.json').read_text(encoding='utf-8'))
    summary = json.loads((run_dir / 'training_summary.json').read_text(encoding='utf-8'))
    epochs = [r['epoch'] for r in rows]
    fig, axes = plt.subplots(2, 2, figsize=(12, 7), layout='constrained')
    axes[0, 0].plot(epochs[1:], [r['train']['total'] for r in rows[1:]], label='학습: 노드 재선택')
    axes[0, 0].plot(epochs, [r['validation']['total'] for r in rows], label='검증: 고정 노드')
    axes[0, 0].scatter([summary['best_epoch']], [summary['best_validation_loss']['total']],
                       marker='*', s=100, color='red', label='선택 모델')
    axes[0, 0].set(title='학습/검증 총손실', ylabel='응력 MSE + 변위 평균 MSE', yscale='log')
    for k, label in [('stress', '응력'), ('displacement', '변위 XYZ 평균')]:
        axes[0, 1].plot(epochs, [r['validation'][k] for r in rows], label=label)
    axes[0, 1].set(title='검증 손실의 구성', ylabel='Z-score 정규화한 값의 MSE', yscale='log')
    axes[1, 0].plot(epochs, [r['validation_mae']['stress_MPa'] for r in rows], label='응력 MAE')
    axes[1, 0].set(title='검증 응력의 평균 절대오차', ylabel='MAE (MPa)')
    for axis in 'XYZ':
        axes[1, 1].plot(epochs, [r['validation_mae'][f'displacement_{axis}_mm'] for r in rows], label=axis)
    axes[1, 1].set(title='검증 변위 성분별 평균 절대오차', ylabel='MAE (mm)', yscale='log')
    for ax in axes.flat:
        ax.set_xlabel('완료한 에폭'); ax.grid(alpha=0.2); ax.legend(fontsize=9)
        if ax.get_yscale() == 'log':
            ax.yaxis.set_major_locator(LogLocator(base=10, subs=(1.0, 2.0, 5.0)))
            ax.yaxis.set_major_formatter(FuncFormatter(lambda value, position: f'{value:g}'))
            ax.yaxis.set_minor_locator(NullLocator())
    fig.suptitle('후크 Transolver 학습 | 학습 6개/검증 2개 | 검증 노드 4,096개씩', fontsize=14)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=140)
    plt.close(fig)
    return output_path

def plot_validation_case(education_dir, model, normalizer, case, output_path, field='stress'):
    """Use actual surface cells and whole-case inference; never interpolate dots."""
    import pyvista as pv
    prediction = predict_fields(model, normalizer, case.coords, case.globals)
    grid = pv.read(Path(education_dir) / 'data/vtu' / (case.case_id + '.vtu'))
    if len(grid.points) != len(case.coords) or not np.allclose(grid.points, case.coords):
        raise ValueError('Plot mesh coordinates must match prediction node order.')
    if field == 'stress':
        target = case.stress[:, 0]; predicted = prediction['stress'][:, 0]
        label, unit = 'von Mises 응력', 'MPa'
    elif field == 'displacement':
        target = np.linalg.norm(case.displacement, axis=-1)
        predicted = np.linalg.norm(prediction['displacement'], axis=-1)
        label, unit = '변위 벡터의 크기', 'mm'
    else:
        raise ValueError('Expected stress or displacement.')
    error = np.abs(predicted - target)
    high = max(float(target.max()), float(predicted.max()), 1e-12)
    low = min(0.0, float(predicted.min()), float(target.min()))
    for k, values in [('target', target), ('prediction', predicted), ('error', error)]:
        grid.point_data[k] = values
    surface = grid.extract_surface(algorithm='dataset_surface')
    plotter = pv.Plotter(shape=(1, 3), off_screen=True, window_size=(1500, 650))
    font = 'C:/Windows/Fonts/malgun.ttf'
    for col, (k, title, limits, palette) in enumerate([
        ('target', 'ANSYS 정답', (low, high), 'turbo'),
        ('prediction', '학습한 모델의 예측', (low, high), 'turbo'),
        ('error', '예측/정답 절대오차', (0, max(float(error.max()), 1e-12)), 'viridis')]):
        plotter.subplot(0, col)
        plotter.set_background('white')
        plotter.add_mesh(surface, scalars=k, clim=limits, cmap=palette,
                         show_edges=False, lighting=False,
                         scalar_bar_args={'title': ['ANSYS', 'Prediction', 'Error'][col] + f' ({unit})',
                                          'color': 'black'})
        plotter.add_text(title, font_file=font, font_size=15, color='black')
        plotter.view_xy(); plotter.camera.roll = 0
    plotter.link_views()
    output_path = Path(output_path); output_path.parent.mkdir(parents=True, exist_ok=True)
    plotter.screenshot(str(output_path)); plotter.close()
    return {'case_id': case.case_id, 'nodes': len(case.coords), 'field': field,
            'unit': unit, 'full_node_mae': float(error.mean()),
            'minimum_prediction': float(predicted.min()), 'image': str(output_path),
            'maximum_prediction': float(predicted.max()), 'maximum_target': float(target.max()),
            'point_context': 'all nodes of this validation case together',
            'interpolated_to_new_points': False}
