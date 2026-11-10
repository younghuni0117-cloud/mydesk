"""Independent teaching utilities for the educational two-variable hook."""

from pathlib import Path
import os
import sys

# Optional workspace-local dependencies; do not alter the user's global Python.
_local_dependencies = Path(__file__).resolve().parents[1] / ".runtime_dependencies"
if _local_dependencies.is_dir() and str(_local_dependencies) not in sys.path:
    sys.path.insert(0, str(_local_dependencies))

# Set before importing PhysicsNeMo: its filesystem module reads this at import.
os.environ.setdefault("LOCAL_CACHE", str(Path(__file__).resolve().parents[1] / "runs" / ".physicsnemo_cache"))

# Optional notebook widgets and Windows log redirection are not used by lessons.
# Match only these known notices; retain all other warnings and errors.
import logging as _logging
import warnings as _warnings

_warnings.filterwarnings(
    "ignore",
    message=r"^IProgress not found\. Please update jupyter and ipywidgets\.",
    category=Warning,
    module=r"^tqdm\.(auto|autonotebook)$",
)


class _OptionalRedirectNoticeFilter(_logging.Filter):
    def filter(self, record):
        return not (
            record.levelno == _logging.WARNING
            and record.getMessage()
            == "NOTE: Redirects are currently not supported in Windows or MacOs."
        )


_redirect_logger = _logging.getLogger("torch.distributed.elastic.multiprocessing.redirects")
if not any(isinstance(f, _OptionalRedirectNoticeFilter) for f in _redirect_logger.filters):
    _redirect_logger.addFilter(_OptionalRedirectNoticeFilter())
