"""Read result records explicitly saved in the current chapter 8 Kit run."""

import json

from pathlib import Path, PureWindowsPath

from .dataset import file_sha256





def read_saved_results(kit_dir, model_id):

    folder = Path(kit_dir)

    records = []

    for path in sorted(folder.glob('result_*/result.json')):

        row = json.loads(path.read_text(encoding='utf-8'))

        if not row['live'] or row['model_id'] != model_id:

            raise ValueError('저장 결과의 모델과 현재 응답 여부를 확인하세요.')

        for key, value in row['paths'].items():

            artifact = path.parent/PureWindowsPath(value).name

            if file_sha256(artifact) != row['sha256'][key]:

                raise ValueError('저장한 화면/USD가 변경되었습니다: '+str(artifact))

        row['record_path'] = str(path)

        records.append(row)

    if not records:

        raise FileNotFoundError('Omniverse에서 예측을 받은 뒤 Save result를 누르세요. 이번 실행의 저장 폴더: '+str(folder))

    return records





def pick_result(records, thickness, force, mode='AI'):

    matches = [r for r in records if abs(r['prediction']['thickness_mm']-thickness)<1e-5

               and abs(r['prediction']['force_N']-force)<1e-3 and r['display']['mode']==mode]

    if not matches:

        raise ValueError(f'두께 {thickness:g} mm, 하중 {force:g} N의 {mode} 결과를 화면에서 저장하세요.')

    return matches[-1]

def prepare_view_directory(education_dir, model_id, resume_folder=''):
    """Create a fresh run or validate an explicitly selected saved run."""
    from datetime import datetime
    base = (Path(education_dir) / 'runs/visualization').resolve()
    if not isinstance(resume_folder, str):
        raise TypeError('RESUME_VIEW_FOLDER에는 폴더 이름을 문자열로 입력하세요.')
    if not resume_folder:
        target = base / ('student_transolver_' + datetime.now().strftime('%Y%m%d_%H%M%S_%f'))
        target.mkdir(parents=True, exist_ok=False)
        return target
    if (resume_folder in ('.', '..') or '/' in resume_folder or '\\' in resume_folder
            or ':' in resume_folder or not resume_folder.startswith('student_transolver_')):
        raise ValueError('runs/visualization 아래의 student_transolver_... 폴더 이름만 입력하세요.')
    target = (base / resume_folder).resolve()
    if target.parent != base:
        raise ValueError('선택한 실습 폴더가 runs/visualization 밖을 가리킵니다.')
    if not target.is_dir():
        raise FileNotFoundError('기존 실습 폴더를 찾을 수 없습니다: ' + str(target))
    read_saved_results(target / 'kit', model_id)
    return target
