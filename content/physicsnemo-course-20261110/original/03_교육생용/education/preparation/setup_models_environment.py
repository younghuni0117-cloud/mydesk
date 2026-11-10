"""Create an isolated chapter 4 kernel without replacing the hook environment.

Run with Python 3.12 on Windows from the chapter 1 Console.
"""
from pathlib import Path
import argparse
import os
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', type=Path, help='Optional environment directory')
    parser.add_argument('--skip-kernel-registration', action='store_true',
                        help='For installation verification without registering a user kernel')
    args = parser.parse_args()
    if sys.platform != 'win32' or sys.version_info[:2] != (3, 12):
        raise SystemExit('이 설치 예제는 Windows / Python 3.12 기준입니다.')
    education_dir = Path(__file__).resolve().parents[1]
    env_dir = (args.environment or education_dir / '.venv-models').resolve()
    python = env_dir / 'Scripts/python.exe'
    command_env = os.environ.copy()
    command_env['PIP_CACHE_DIR'] = str(env_dir / 'pip-cache')
    command_env['PIP_DISABLE_PIP_VERSION_CHECK'] = '1'
    def run(*command):
        subprocess.run([str(x) for x in command], check=True, env=command_env)
    def pip(*arguments):
        # Keep package downloads inside the environment's writable directory.
        run(python, '-I', '-m', 'pip', '--cache-dir', env_dir / 'pip-cache', *arguments)
    if not python.exists():
        run(sys.executable, '-I', '-m', 'venv', env_dir)
    pip('install', '--no-deps', 'torch==2.10.0+cu128',
        'torchvision==0.25.0+cu128', '--index-url', 'https://download.pytorch.org/whl/cu128',
        '--disable-pip-version-check', '--timeout', '30', '--retries', '2')
    pip('install', '--only-binary=:all:', '--no-deps',
        'torch-scatter==2.1.2+pt210cu128', '--no-index',
        '-f', 'https://data.pyg.org/whl/torch-2.10.0+cu128.html')
    pip('install', '-r', education_dir / 'requirements-models-gnn.txt',
        '--index-url', 'https://pypi.org/simple', '--disable-pip-version-check',
        '--timeout', '30', '--retries', '2')
    pip('check')
    run(python, '-I', education_dir / 'preparation/check_gnn_environment.py')
    # Register only after successful checks, using this copy's own interpreter.
    if not args.skip_kernel_registration:
        run(python, '-I', '-m', 'ipykernel', 'install', '--user', '--name', 'cae-models-rev07',
            '--display-name', 'CAE 4장 모델 실습')
        print('준비 완료: 4장 Notebook에서 CAE 4장 모델 실습 커널을 선택하세요.')
    else:
        print('설치 및 계산 점검 완료. 검증 옵션에 따라 커널 등록은 생략했습니다.')


if __name__ == '__main__':
    main()
