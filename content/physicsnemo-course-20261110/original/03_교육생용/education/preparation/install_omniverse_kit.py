"""Prepare the course's Kit 110.2 runtime using NVIDIA's official build tools.

Run from the Ansys Python Manager console. Downloads/builds are explicit CLI actions;
importing this module does not install anything or launch a graphical application.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = 'https://github.com/NVIDIA-Omniverse/kit-app-template.git'
REVISION = '483e364a4176f102f2d3c3aaf9f301a103d61d69'
SDK_VERSION = '110.2.0'
APP_NAME = 'education_hook.kit'
MARKER = '.education-kit-installer.json'


def run(args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)


def configure_project(destination, education_root=ROOT):
    """Configure the dedicated installer checkout for the existing course app."""
    sdk = destination / 'tools/deps/kit-sdk.packman.xml'
    if f'version="{SDK_VERSION}+feature.' not in sdk.read_text(encoding='utf-8'):
        raise RuntimeError('Unexpected Kit SDK version; no build was started.')
    app = (education_root / 'omniverse' / APP_NAME).read_text(encoding='utf-8')
    # Only the build-time copy accesses the registry to precache extensions.
    if 'app.extensions.registryEnabled = false' not in app:
        raise RuntimeError('Expected the course app to disable its runtime registry.')
    apps = destination / 'source/apps'
    apps.mkdir(parents=True, exist_ok=True)
    (apps / APP_NAME).write_text(
        app.replace('app.extensions.registryEnabled = false',
                    'app.extensions.registryEnabled = true'), encoding='utf-8')
    premake = destination / 'premake5.lua'
    text = premake.read_text(encoding='utf-8')
    declaration = f'define_app("{APP_NAME}")'
    if declaration not in text:
        premake.write_text(text + '\n' + declaration + '\n', encoding='utf-8')
    config = destination / 'repo.toml'
    text = config.read_text(encoding='utf-8')
    pattern = r'(\[repo_precache_exts\]\s*# Apps to run and precache\s*)apps\s*=\s*\[[^\]]*\]'
    text, matches = re.subn(pattern, lambda match: match[1] +
                          'apps = ["${root}/source/apps/' + APP_NAME + '"]', text)
    if matches != 1:
        raise RuntimeError('Unexpected NVIDIA repo configuration; build was not started.')
    config.write_text(text, encoding='utf-8')


def register_runtime(executable, education_root=ROOT, provenance=None):
    executable = Path(os.path.abspath(executable))  # Keep the SDK's symlink location.
    if executable.name.lower() != 'kit.exe' or not executable.is_file():
        raise FileNotFoundError('Specify an existing kit.exe executable.')
    config = education_root / 'config/kit_runtime.json'
    config.parent.mkdir(parents=True, exist_ok=True)
    record = {'kit_executable': str(executable),
              'configured_at_utc': datetime.now(timezone.utc).isoformat(),
              'installation_scope': 'Kit path recorded; module 8 runtime verification pending',
              **(provenance or {'method': 'register-existing', 'sdk_version_verified': False})}
    config.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Kit path registered:', config, flush=True)
    return record


def install(destination, education_root=ROOT):
    if os.name != 'nt':
        raise RuntimeError('This installer targets Windows x86-64.')
    git = shutil.which('git')
    if not git:
        raise RuntimeError('Install Git for Windows, then reopen the Manager console.')
    destination = Path(destination).resolve()
    # Preserve unrelated checkouts and user files. Only installer-owned folders resume.
    marker = destination / MARKER
    expected = {'repository': REPOSITORY, 'revision': REVISION, 'sdk_version': SDK_VERSION}
    if destination.exists() and any(destination.iterdir()):
        if not marker.is_file() or json.loads(marker.read_text(encoding='utf-8')) != expected:
            raise FileExistsError('Choose a new/empty folder; existing contents were preserved.')
    destination.mkdir(parents=True, exist_ok=True)
    marker.write_text(json.dumps(expected, indent=2) + '\n', encoding='utf-8')
    if not (destination / '.git').exists():
        run([git, 'init', str(destination)])
        run([git, '-C', str(destination), 'remote', 'add', 'origin', REPOSITORY])
    head = subprocess.run([git, '-C', str(destination), 'rev-parse', 'HEAD'],
                          capture_output=True, text=True)
    if head.returncode != 0:
        run([git, '-C', str(destination), 'fetch', '--depth', '1', 'origin', REVISION])
        run([git, '-C', str(destination), 'checkout', '--detach', 'FETCH_HEAD'])
    else:
        if head.stdout.strip() != REVISION:
            raise RuntimeError('Installer checkout revision changed; choose a new folder.')
    configure_project(destination, education_root)
    print('Downloading Kit and precaching course extensions with NVIDIA repo.bat build.', flush=True)
    print('Respond to any NVIDIA terms or download prompts shown by the official tooling.', flush=True)
    run(['cmd.exe', '/d', '/c', 'repo.bat', 'build'], cwd=destination)
    executable = destination / '_build/windows-x86_64/release/kit/kit.exe'
    cache = executable.parent.parent / 'extscache'
    if not cache.is_dir() or not any(cache.iterdir()):
        raise RuntimeError('Extension precache is missing; inspect the NVIDIA build output.')
    return register_runtime(executable, education_root,
        {'method': 'official-kit-app-template-build', **expected,
         'course_app_sha256': hashlib.sha256((education_root / 'omniverse' / APP_NAME).read_bytes()).hexdigest(),
         'build_completed': True, 'kit_scene_launched': False})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    choice = parser.add_mutually_exclusive_group(required=True)
    choice.add_argument('--install-dir', type=Path, help='New/empty short path, for example X:\\ovedu')
    choice.add_argument('--register-existing', type=Path, help='Existing compatible Kit SDK kit.exe')
    args = parser.parse_args()
    if args.register_existing:
        register_runtime(args.register_existing)
    else:
        install(args.install_dir)


if __name__ == '__main__':
    main()
