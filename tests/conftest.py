"""Pytest configuration for the Code Puppy Desktop test suite.

Auto-mocks heavy dependencies (fastapi, loguru, code_puppy, pydantic_ai)
so individual tests can run without the full virtual environment.
"""

import sys
from pathlib import Path
from unittest import mock

# Add sidecar-src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

# --- Auto-mock missing heavy dependencies ---

_MISSING_MODULES = [
    "fastapi",
    "starlette",
    "starlette.status",
    "loguru",
    "code_puppy",
    "code_puppy.config",
    "code_puppy.agents",
    "code_puppy.tools",
    "code_puppy.messages",
    "pydantic_ai",
    "pydantic_ai.messages",
    "pydantic_ai._messages",
    "pydantic_core",
]

for _mod in _MISSING_MODULES:
    try:
        __import__(_mod)
    except ImportError:
        sys.modules[_mod] = mock.MagicMock()

# Give code_puppy.config meaningful mock attributes
if "code_puppy" in sys.modules and isinstance(sys.modules["code_puppy"], mock.MagicMock):
    _cp_config = mock.MagicMock()
    _cp_config.AUTOSAVE_DIR = Path.home() / ".local" / "share" / "code_puppy" / "autosave"
    sys.modules["code_puppy.config"] = _cp_config

# Give starlette.status meaningful mock attributes
if "starlette" in sys.modules and isinstance(sys.modules["starlette"], mock.MagicMock):
    _st_status = mock.MagicMock()
    _st_status.WS_1008_POLICY_VIOLATION = 1008
    sys.modules["starlette.status"] = _st_status


def pytest_configure(config):
    """Register custom pytest markers."""
    config.addinivalue_line("markers", "slow: marks tests as slow")
    config.addinivalue_line("markers", "integration: marks tests as integration tests")
