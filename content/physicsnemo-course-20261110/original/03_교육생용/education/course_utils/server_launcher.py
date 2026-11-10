"""Generate a double-clickable Windows launcher for the current notebook Python."""
from pathlib import Path


def _batch_argument(value):
    value = str(value)
    if any(char in value for char in ['"', '\r', '\n', '\0']):
        raise ValueError('Invalid batch argument')
    # Quote every argument for CMD, escape percent expansion in batch files,
    # and disable delayed expansion so ! in a user's path remains literal.
    return '"'+value.replace('%','%%')+'"'


def create_server_launcher(path, command, working_dir):
    if not command:
        raise ValueError('A Python server command is required')
    path = Path(path)
    lines = [
        '@echo off', 'chcp 65001 >nul', 'setlocal DisableDelayedExpansion',
        'title Hook Transolver Inference Server', 'set "PYTHONUTF8=1"',
        'cd /d '+_batch_argument(Path(working_dir).resolve()),
        'echo Starting Hook Transolver server. Keep this window open.',
        ' '.join(_batch_argument(arg) for arg in command),
        'set "_COURSE_SERVER_EXIT=%ERRORLEVEL%"', 'echo.',
        'echo Server stopped. Exit code: %_COURSE_SERVER_EXIT%',
        'if defined COURSE_LAUNCHER_NO_PAUSE exit /b %_COURSE_SERVER_EXIT%',
        'pause', 'exit /b %_COURSE_SERVER_EXIT%',
    ]
    path.write_bytes(('\r\n'.join(lines)+'\r\n').encode('utf-8'))
    return path


def create_kit_launcher(path, command, working_dir):
    """Use this notebook's Python to launch Kit with its own Python runtime."""
    if not command:
        raise ValueError('A Kit launcher command is required')
    path = Path(path)
    lines = ['@echo off', 'chcp 65001 >nul', 'setlocal DisableDelayedExpansion',
             'title Hook AI - Omniverse', 'set "PYTHONUTF8=1"',
             'cd /d '+_batch_argument(Path(working_dir).resolve()),
             'echo Starting Omniverse. Keep the inference server running.',
             ' '.join(_batch_argument(arg) for arg in command),
             'set "_COURSE_KIT_EXIT=%ERRORLEVEL%"', 'echo.',
             'echo Omniverse stopped. Exit code: %_COURSE_KIT_EXIT%',
             'if defined COURSE_LAUNCHER_NO_PAUSE exit /b %_COURSE_KIT_EXIT%',
             'pause', 'exit /b %_COURSE_KIT_EXIT%']
    path.write_bytes(('\r\n'.join(lines)+'\r\n').encode('utf-8'))
    return path
