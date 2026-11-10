"""Carry Chapter 5's explicitly completed basic run B into Chapter 6."""
import json
from pathlib import Path

from .dataset import file_sha256


def _completed_basic_run(education_dir, training_dir):
    education_dir = Path(education_dir).resolve()
    training_dir = Path(training_dir).resolve()
    if not training_dir.is_relative_to(education_dir / 'runs/training'):
        raise ValueError('학습 폴더는 education/runs/training 안에 있어야 합니다.')
    manifest_path = training_dir / 'training_manifest.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest['status'] != 'completed' or manifest['test_scored']:
        raise ValueError('5장의 학습/검증이 완료된 실행만 연결할 수 있습니다.')
    for name, digest in manifest['artifact_sha256'].items():
        artifact = (training_dir / name).resolve()
        if not artifact.is_relative_to(training_dir) or file_sha256(artifact) != digest:
            raise ValueError('학습 기록 또는 모델이 변경되었습니다: ' + name)
    for name, digest in manifest['provenance']['source_code_sha256'].items():
        source = (education_dir / name).resolve()
        if not source.is_relative_to(education_dir) or file_sha256(source) != digest:
            raise ValueError('학습에 사용한 코드가 변경되었습니다: ' + name)
    dataset_manifest = education_dir / 'runs/dataset/dataset_manifest.json'
    if file_sha256(dataset_manifest) != manifest['provenance']['dataset_manifest_sha256']:
        raise ValueError('3장의 준비 자료와 학습 기록이 다릅니다.')
    summary = json.loads((training_dir / 'training_summary.json').read_text(encoding='utf-8'))
    config = manifest['provenance']['training_config']
    if (summary['status'] != 'completed' or summary['test_scored']
            or summary['model_kind'] != 'education_hook_transolver_v1'
            or summary['epochs_completed'] != 1000 or summary['points_per_case'] != 4096
            or config['max_epochs'] != 1000 or config['batch_size'] != 2
            or manifest['provenance']['controls_enabled']):
        raise ValueError('6장에는 5장의 기본 학습 B(배치 2/4,096개 노드/1,000에폭)를 연결하세요.')
    history = json.loads((training_dir / 'history.json').read_text(encoding='utf-8'))
    chosen = min((row for row in history if row['epoch'] > 0),
                 key=lambda row: row['validation']['total'])
    if chosen['epoch'] != summary['best_epoch']:
        raise ValueError('검증으로 선택한 에폭과 완료 요약이 다릅니다.')
    return training_dir, {
        'schema_version': 1, 'training_role': 'basic_B',
        'training_dir': training_dir.relative_to(education_dir).as_posix(),
        'training_manifest_sha256': file_sha256(manifest_path),
        'checkpoint_sha256': file_sha256(training_dir / 'best_model.pt'),
        'selected_epoch': summary['best_epoch'],
    }


def save_training_handoff(education_dir, training_dir):
    education_dir = Path(education_dir).resolve()
    _, record = _completed_basic_run(education_dir, training_dir)
    pointer = education_dir / 'runs/training/chapter5_handoff.json'
    temporary = pointer.with_suffix('.tmp')
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(pointer)
    return pointer


def resolve_training_handoff(education_dir):
    education_dir = Path(education_dir).resolve()
    pointer = education_dir / 'runs/training/chapter5_handoff.json'
    if not pointer.is_file():
        raise FileNotFoundError('5장 9.3절의 연결 정보 저장 셀을 먼저 실행하세요: ' + str(pointer))
    saved = json.loads(pointer.read_text(encoding='utf-8'))
    folder, current = _completed_basic_run(education_dir, education_dir / saved['training_dir'])
    if saved != current:
        raise ValueError('학습 연결 정보가 변경되었습니다. 5장 9.3절에서 다시 저장하세요.')
    return folder
