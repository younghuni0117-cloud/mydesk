"""Launch installed Kit with cache/logs confined to this educational workspace."""
import argparse
import json
import os
from pathlib import Path
import subprocess
from datetime import datetime
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def configured_kit(education_root=ROOT):
    override = os.environ.get('EDUCATION_KIT_EXE')
    if override:
        return Path(override)
    config = education_root / 'config/kit_runtime.json'
    if config.is_file():
        path = Path(json.loads(config.read_text(encoding='utf-8'))['kit_executable'])
        return path if path.is_absolute() else education_root / path
    legacy = Path('F:/omniverse/kit-app-template/_build/windows-x86_64/release/kit/kit.exe')
    if legacy.is_file():
        return legacy
    return education_root.parent / 'omniverse_kit/_build/windows-x86_64/release/kit/kit.exe'


DEFAULT_KIT = configured_kit()


def command(kit_exe=DEFAULT_KIT, verify=False, api_url='http://127.0.0.1:8098', transolver=False, output_dir=None, expected_model_id=None):
    exe = Path(kit_exe).absolute()  # Preserve SDK symlink path for adjacent extension cache.
    if not exe.is_file():
        raise FileNotFoundError('Installed Kit executable not found; use --kit-exe')
    args = [str(exe), str(ROOT / 'omniverse/education_hook.kit'),
            '--portable-root', str(ROOT / 'runs/visualization/kit_runtime')]
    for folder in [exe.parent / 'exts', exe.parent / 'extscore', exe.parent.parent / 'extscache']:
        if folder.is_dir():
            args.extend(['--ext-folder', str(folder)])
    script = 'kit_transolver.py' if transolver else 'kit_hook.py'
    args.extend(['--exec', '"'+str(ROOT / 'omniverse'/script)+'"' + (' --verify' if verify else ''),
                 '--/education/apiUrl=' + api_url,
                 '--/log/file=' + str((Path(output_dir) if output_dir else ROOT/'runs/visualization')/'logs/kit.log')])
    if output_dir is not None:
        args.extend(['--/education/outputDir='+str(Path(output_dir).resolve())])
    if expected_model_id:
        args.extend(['--/education/expectedModelId='+expected_model_id])
    return args


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--kit-exe', type=Path, default=DEFAULT_KIT)
    parser.add_argument('--api-url', default='http://127.0.0.1:8098')
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--transolver', action='store_true', help='Use the chapter 7 thickness/load inference API')
    parser.add_argument('--output-dir', type=Path)
    parser.add_argument('--expected-model-id')
    args = parser.parse_args()
    if args.transolver and os.environ.get('COURSE_KIT_VERIFY') == '1':
        args.verify = True
    with urllib.request.urlopen(args.api_url + '/health', timeout=10) as response:
        health = json.load(response)
    if not health['ready']:
        raise RuntimeError('Start the educational prediction API first')
    if args.transolver and health.get('api_kind') != 'live_transolver':
        raise RuntimeError('Start serve_transolver.py from chapter 7')
    if args.expected_model_id and health['model_id'] != args.expected_model_id:
        raise RuntimeError('Server model differs from the Chapter 7 connection')
    run = args.output_dir or (ROOT/'runs/visualization'/('student_transolver_'+datetime.now().strftime('%Y%m%d_%H%M%S_%f')) if args.transolver else ROOT/'runs/visualization')
    run = run.resolve()
    if not run.is_relative_to((ROOT/'runs/visualization').resolve()):
        raise ValueError('Output directory must be within education/runs/visualization')
    (run / 'logs').mkdir(parents=True, exist_ok=True)
    (run / 'kit_runtime/optix').mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    # Kit provides its own Python; do not inherit Notebook module/DLL paths.
    env.pop('PYTHONHOME', None)
    env.pop('PYTHONPATH', None)
    env['PATH'] = os.pathsep.join(part for part in env.get('PATH','').split(os.pathsep)
                                if part and Path(part).name.lower() != 'windowsapps')
    env['OPTIX_CACHE_PATH'] = str(run / 'kit_runtime/optix')
    env['__GL_SHADER_DISK_CACHE_PATH'] = str(run / 'kit_runtime/shader_cache')
    startup = None
    if os.name == 'nt' and args.verify:
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
    with (run / 'logs/kit.stdout.log').open('w', encoding='utf-8') as out, \
         (run / 'logs/kit.stderr.log').open('w', encoding='utf-8') as err:
        process = subprocess.Popen(command(args.kit_exe, args.verify, args.api_url, args.transolver,
                                           run if args.transolver else None, args.expected_model_id),
                                   cwd=ROOT / 'omniverse', env=env, startupinfo=startup,
                                   stdout=out, stderr=err)
        print('Kit PID:', process.pid, flush=True)
        try:
            code = process.wait(timeout=600 if args.verify else None)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=20)
            raise
    if code:
        raise SystemExit(code)
    if args.verify:
        report_file = run/'kit_check.json' if args.transolver else ROOT/'reports/kit_visualization_check.json'
        report = json.loads(report_file.read_text(encoding='utf-8'))
        if not report['passed']:
            raise RuntimeError(report['error'])
        print('PASS: actual Kit, USD fields, input changes, source and connection state checks')
