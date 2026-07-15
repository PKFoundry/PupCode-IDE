"""Tests for session manager security — restricted pickle unpickler."""

import pickle
import sys
from io import BytesIO
from pathlib import Path

import pytest

# Add sidecar-src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from session_manager import (
    RestrictedUnpickler,
    _PICKLE_WHITELIST_MODULES,
    safe_pickle_loads,
)


class TestRestrictedUnpickler:
    """Tests for the restricted pickle unpickler."""

    def test_allows_simple_types(self):
        """Simple Python types should deserialize fine."""
        data = pickle.dumps({"key": "value", "list": [1, 2, 3]})
        result = safe_pickle_loads(data)
        assert result == {"key": "value", "list": [1, 2, 3]}

    def test_find_class_blocks_non_whitelisted(self):
        """find_class should raise for non-whitelisted modules."""
        unpickler = RestrictedUnpickler(BytesIO(b""))
        with pytest.raises(pickle.UnpicklingError, match="blocked"):
            unpickler.find_class("os", "system")

    def test_find_class_blocks_subprocess(self):
        """find_class should block subprocess."""
        unpickler = RestrictedUnpickler(BytesIO(b""))
        with pytest.raises(pickle.UnpicklingError, match="blocked"):
            unpickler.find_class("subprocess", "Popen")

    def test_whitelist_contains_required_modules(self):
        """The whitelist should include essential modules."""
        assert "builtins" in _PICKLE_WHITELIST_MODULES
        assert "code_puppy" in _PICKLE_WHITELIST_MODULES
        assert "pydantic_ai" in _PICKLE_WHITELIST_MODULES
        assert "os" not in _PICKLE_WHITELIST_MODULES
        assert "subprocess" not in _PICKLE_WHITELIST_MODULES

    def test_safe_load_handles_cp_session_header(self):
        """Legacy CPSESSION header should be stripped."""
        inner = pickle.dumps({"test": "data"})
        with_header = b"CPSESSION\x01" + b"\x00" * 32 + inner
        
        result = safe_pickle_loads(with_header)
        assert result == {"test": "data"}
