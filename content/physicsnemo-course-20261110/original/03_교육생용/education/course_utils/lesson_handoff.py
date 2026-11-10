"""Carry one explicitly completed Chapter 6 evaluation into Chapter 7."""
import json
from pathlib import Path
from .dataset import file_sha256


def save_evaluation_handoff(education_dir, evaluation_dir):
    education_dir = Path(education_dir).resolve()
    evaluation_dir = Path(evaluation_dir).resolve()
    report_path = evaluation_dir/'evaluation_report.json'
    report = json.loads(report_path.read_text(encoding='utf-8'))
    if report['status'] != 'completed' or report['test_used_to_update_model']:
        raise ValueError('6장의 완료된 시험 평가만 연결할 수 있습니다.')
    audit = json.loads((evaluation_dir/'reload_check.json').read_text(encoding='utf-8'))
    if not audit['passed'] or audit['model_sha256'] != report['context']['checkpoint_sha256']:
        raise ValueError('6장의 새 프로세스 점검을 먼저 완료하세요.')
    pointer = education_dir/'runs/evaluation/chapter6_handoff.json'
    record = dict(evaluation_dir=evaluation_dir.relative_to(education_dir).as_posix(),
                  evaluation_report_sha256=file_sha256(report_path),
                  model_sha256=report['context']['checkpoint_sha256'])
    temporary = pointer.with_suffix('.tmp')
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    temporary.replace(pointer)
    return pointer


def resolve_evaluation_handoff(education_dir):
    education_dir = Path(education_dir).resolve()
    pointer = education_dir/'runs/evaluation/chapter6_handoff.json'
    if not pointer.is_file():
        raise FileNotFoundError('6장 마지막의 연결 정보 저장 셀을 먼저 실행하세요: '+str(pointer))
    record = json.loads(pointer.read_text(encoding='utf-8'))
    folder = (education_dir/record['evaluation_dir']).resolve()
    if not folder.is_relative_to(education_dir/'runs/evaluation'):
        raise ValueError('평가 연결 경로가 교육용 평가 폴더 안에 있어야 합니다.')
    path = folder/'evaluation_report.json'
    report = json.loads(path.read_text(encoding='utf-8'))
    if (file_sha256(path) != record['evaluation_report_sha256']
            or report['context']['checkpoint_sha256'] != record['model_sha256']
            or report['status'] != 'completed' or report['test_used_to_update_model']):
        raise ValueError('평가 연결 정보가 변경되었습니다. 6장 마지막 셀에서 다시 저장하세요.')
    return folder
