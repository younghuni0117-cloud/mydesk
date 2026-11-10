"""Run the revised chapter 1 Kit check without starting an inference API."""
import argparse
import os
from pathlib import Path
import subprocess

from launch_kit import configured_kit

ROOT = Path(__file__).resolve().parents[1]


def command(kit_exe, verify=False):
    exe = Path(kit_exe).absolute()
    if not exe.is_file():
        raise FileNotFoundError('Kit executable not found: ' + str(exe))
    run = ROOT / 'runs/environment/kit_basic_revised'
    script = ROOT / 'omniverse/environment_basic_revised.py'
    args = [str(exe), str(ROOT / 'omniverse/environment_basic_revised.kit'),
            '--portable-root', str(run / 'runtime')]
    for folder in [exe.parent / 'exts', exe.parent / 'extscore', exe.parent.parent / 'extscache']:
        if folder.is_dir():
            args.extend(['--ext-folder', str(folder)])
    args.extend(['--exec', '"' + str(script) + '"' + (' --verify' if verify else ''),
                 '--/log/file=' + str(run / 'kit.log')])
    if verify:
        args.extend(['--no-window', '--/app/asyncRendering=false',
                     '--/app/renderer/resolution/width=800',
                     '--/app/renderer/resolution/height=600'])
    return args


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--kit-exe', type=Path, default=configured_kit())
    parser.add_argument('--verify', action='store_true', help='Capture the check scene and exit.')
    options = parser.parse_args()
    args = command(options.kit_exe, options.verify)
    run = ROOT / 'runs/environment/kit_basic_revised'
    run.mkdir(parents=True, exist_ok=True)
    report = ROOT / 'reports/kit_basic_startup_revised.json'
    report.parent.mkdir(parents=True, exist_ok=True)
    # Remove only this launcher's own stale report before starting a new check.
    if report.is_file():
        report.unlink()
    env = os.environ.copy()
    # Kit supplies its own Python; do not inherit a Notebook module search path.
    env.pop('PYTHONHOME', None)
    env.pop('PYTHONPATH', None)
    # Windows App Execution Aliases are not needed by Kit. USD's DLL search
    # may fail on an inaccessible WindowsApps entry in a restricted desktop.
    env['PATH'] = os.pathsep.join(entry for entry in env.get('PATH', '').split(os.pathsep)
                               if entry and Path(entry).name.lower() != 'windowsapps')
    env['EDUCATION_KIT_CHECK_EXE'] = str(options.kit_exe.absolute())
    env['OPTIX_CACHE_PATH'] = str(run / 'runtime/optix')
    env['__GL_SHADER_DISK_CACHE_PATH'] = str(run / 'runtime/shader_cache')
    for folder in ['optix', 'shader_cache']:
        (run / 'runtime' / folder).mkdir(parents=True, exist_ok=True)
    startup = None
    if os.name == 'nt' and options.verify:
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
    with (run / 'stdout.log').open('w', encoding='utf-8') as out, \
         (run / 'stderr.log').open('w', encoding='utf-8') as err:
        process = subprocess.Popen(args, cwd=ROOT / 'omniverse', env=env, startupinfo=startup,
                                   stdout=out, stderr=err)
        print('Kit PID:', process.pid, flush=True)
        try:
            # The first RTX shader compilation can take several minutes.
            return_code = process.wait(timeout=600 if options.verify else None)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=20)
            raise
    if return_code:
        raise RuntimeError(f'Kit exited with code {return_code}. Inspect {run}')
    if not report.is_file():
        raise RuntimeError('Kit check report missing. Inspect ' + str(run))
    print('Basic Kit report:', report)


if __name__ == '__main__':
    main()
