"""Carry the explicitly completed Chapter 7 connection into Chapter 8."""
import json
from pathlib import Path
from .dataset import file_sha256
from .lesson_handoff import resolve_evaluation_handoff


def save_server_handoff(education_dir, server_dir):
    root, folder = Path(education_dir).resolve(), Path(server_dir).resolve()
    if not folder.is_relative_to(root/'runs/inference_server'):
        raise ValueError('서버 준비 폴더를 확인하세요.')
    connection = json.loads((folder/'inference_connection.json').read_text(encoding='utf-8'))
    check = json.loads((folder/'inference_api_check.json').read_text(encoding='utf-8'))
    evaluation = resolve_evaluation_handoff(root)
    expected = json.loads((evaluation/'evaluation_report.json').read_text(encoding='utf-8'))['context']
    if not check['passed'] or connection['model_sha256'] != expected['checkpoint_sha256']:
        raise ValueError('6장과 같은 모델로 7장 확인을 완료하세요.')
    relative = {}
    for key in ['training_dir', 'surface_dir', 'server_launcher']:
        path = Path(connection[key]).resolve()
        if not path.is_relative_to(root) or not path.exists():
            raise ValueError('교육 자료 안의 경로가 필요합니다: '+key)
        relative[key] = path.relative_to(root).as_posix()
    record = dict(server_dir=folder.relative_to(root).as_posix(), paths=relative,
                  connection_sha256=file_sha256(folder/'inference_connection.json'),
                  check_sha256=file_sha256(folder/'inference_api_check.json'),
                  model_sha256=expected['checkpoint_sha256'])
    pointer = root/'runs/inference_server/chapter7_handoff.json'
    temporary = pointer.with_suffix('.tmp')
    temporary.write_text(json.dumps(record, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    temporary.replace(pointer)
    return pointer


def resolve_server_handoff(education_dir):
    root = Path(education_dir).resolve()
    pointer = root/'runs/inference_server/chapter7_handoff.json'
    if not pointer.is_file():
        raise FileNotFoundError('7장 마지막 연결 정보 저장 셀을 실행하세요: '+str(pointer))
    record = json.loads(pointer.read_text(encoding='utf-8'))
    folder = (root/record['server_dir']).resolve()
    if not folder.is_relative_to(root/'runs/inference_server'):
        raise ValueError('서버 연결 경로를 확인하세요.')
    for name, key in [('inference_connection.json', 'connection_sha256'),
                      ('inference_api_check.json', 'check_sha256')]:
        if file_sha256(folder/name) != record[key]:
            raise ValueError('연결 기록이 변경되었습니다. 7장 마지막 셀에서 다시 저장하세요.')
    connection = json.loads((folder/'inference_connection.json').read_text(encoding='utf-8'))
    evaluation = resolve_evaluation_handoff(root)
    expected = json.loads((evaluation/'evaluation_report.json').read_text(encoding='utf-8'))['context']
    if connection['model_sha256'] != record['model_sha256'] or record['model_sha256'] != expected['checkpoint_sha256']:
        raise ValueError('6/7장의 모델이 다릅니다. 7장부터 다시 준비하세요.')
    for key, relative in record['paths'].items():
        path = (root/relative).resolve()
        if not path.is_relative_to(root) or not path.exists():
            raise ValueError('연결 자료가 없습니다: '+key)
        connection[key] = str(path)
    return folder/'inference_connection.json', connection
