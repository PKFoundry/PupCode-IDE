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
    SessionManager,
    _PICKLE_WHITELIST_MODULES,
    safe_pickle_loads,
)


@pytest.fixture()
def tmp_autosave(tmp_path: Path) -> Path:
    """Create a temporary autosave directory with a valid session file."""
    autosave = tmp_path / "autosave"
    autosave.mkdir()
    pkl = autosave / "valid_session.pkl"
    pkl.write_bytes(pickle.dumps({"messages": [{"role": "user", "content": "hi"}]}))
    meta = autosave / "valid_session_meta.json"
    meta.write_text('{"timestamp": "2024-01-01", "message_count": 1}')
    return autosave


@pytest.fixture()
def sm(tmp_autosave: Path, tmp_path: Path) -> SessionManager:
    """Create a SessionManager backed by a temp autosave and temp DB."""
    return SessionManager(
        autosave_dir=tmp_autosave,
        db_path=tmp_path / "test_sessions.db",
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


class TestSafeSessionPath:
    """Tests for _safe_session_path — path traversal prevention."""

    # ------------------------------------------------------------------
    # Core _safe_session_path validation
    # ------------------------------------------------------------------

    def test_valid_name_returns_resolved_path(self, sm: SessionManager):
        """A normal session name should produce a resolved path inside autosave."""
        result = sm._safe_session_path("mysession", ".pkl")
        assert result.suffix == ".pkl"
        assert str(sm.autosave_dir) in str(result)
        # The path should be fully resolved
        assert result.is_absolute()

    def test_meta_suffix_works_correctly(self, sm: SessionManager):
        """The _meta.json suffix should produce the correct path."""
        result = sm._safe_session_path("mysession", "_meta.json")
        assert str(result).endswith("_meta.json")

    def test_parent_traversal_rejected(self, sm: SessionManager):
        """../ sequences must be rejected with ValueError."""
        with pytest.raises(ValueError):
            sm._safe_session_path("../etc/passwd", ".pkl")

    def test_deep_parent_traversal_rejected(self, sm: SessionManager):
        """Deeply nested ../ must still be rejected."""
        with pytest.raises(ValueError):
            sm._safe_session_path("../../../../etc/shadow", ".pkl")

    def test_absolute_path_injection_rejected(self, sm: SessionManager):
        """An absolute path in session_name must be rejected."""
        abs_path = "/etc/passwd"
        with pytest.raises(ValueError):
            sm._safe_session_path(abs_path, ".pkl")

    def test_null_byte_rejected(self, sm: SessionManager):
        """A null byte in session_name must be rejected."""
        with pytest.raises(ValueError, match="invalid characters"):
            sm._safe_session_path("session\x00name", ".pkl")

    def test_empty_string_rejected(self, sm: SessionManager):
        """An empty session_name must be rejected."""
        with pytest.raises(ValueError, match="empty"):
            sm._safe_session_path("", ".pkl")

    def test_control_character_rejected(self, sm: SessionManager):
        """Control characters (e.g. newline) must be rejected."""
        with pytest.raises(ValueError, match="invalid characters"):
            sm._safe_session_path("session\nname", ".pkl")

    def test_tab_character_rejected(self, sm: SessionManager):
        """Tab characters must be rejected."""
        with pytest.raises(ValueError, match="invalid characters"):
            sm._safe_session_path("session\tname", ".pkl")

    def test_symlink_escape_rejected(self, tmp_path: Path):
        """If autosave_dir contains a symlink pointing outward, resolved paths
        escaping the physical directory must be rejected."""
        real_dir = tmp_path / "real_autosave"
        real_dir.mkdir()
        outside = tmp_path / "outside"
        outside.mkdir()
        outside_file = outside / "secret.pkl"
        outside_file.touch()

        # Create a symlink inside real_dir pointing to the outside dir
        link = real_dir / "escape_link"
        link.symlink_to(outside)

        sm = SessionManager(
            autosave_dir=link,
            db_path=tmp_path / "sym_test.db",
        )
        # session_name that walks up from the symlink target
        with pytest.raises(ValueError):
            sm._safe_session_path("../../../outside/secret", ".pkl")

    # ------------------------------------------------------------------
    # Integration: public methods use _safe_session_path
    # ------------------------------------------------------------------

    def test_delete_session_safe_on_traversal(self, sm: SessionManager):
        """delete_session must raise ValueError on traversal attempt."""
        with pytest.raises(ValueError):
            sm.delete_session("../evil")

    def test_delete_session_safe_on_abs_path(self, sm: SessionManager):
        """delete_session must raise ValueError on absolute path."""
        with pytest.raises(ValueError):
            sm.delete_session("/etc/passwd")

    def test_get_preview_safe_on_traversal(self, sm: SessionManager):
        """get_preview must return error dict on traversal attempt."""
        result = sm.get_preview("../evil")
        assert "error" in result
        assert "Invalid session name" in result["error"]

    def test_get_preview_safe_on_abs_path(self, sm: SessionManager):
        """get_preview must return error dict on absolute path."""
        result = sm.get_preview("/etc/passwd")
        assert "error" in result
        assert "Invalid session name" in result["error"]

    def test_get_preview_safe_on_null_byte(self, sm: SessionManager):
        """get_preview must return error dict on null byte in name."""
        result = sm.get_preview("session\x00name")
        assert "error" in result

    def test_load_session_safe_on_traversal(self, sm: SessionManager):
        """load_session must raise ValueError on traversal attempt."""
        with pytest.raises(ValueError):
            sm.load_session("../evil")

    def test_load_session_safe_on_abs_path(self, sm: SessionManager):
        """load_session must raise ValueError on absolute path."""
        with pytest.raises(ValueError):
            sm.load_session("/etc/passwd")

    def test_load_session_safe_on_empty_name(self, sm: SessionManager):
        """load_session must raise ValueError on empty name."""
        with pytest.raises(ValueError):
            sm.load_session("")

    def test_load_session_valid_name_works(self, sm: SessionManager):
        """A valid session name should load successfully."""
        result = sm.load_session("valid_session")
        assert "history" in result
        assert result["history"]["messages"] == [{"role": "user", "content": "hi"}]

    def test_delete_session_valid_name_works(self, sm: SessionManager, tmp_autosave: Path):
        """A valid session name should delete successfully."""
        sm.db.execute(
            "INSERT INTO sessions (session_name, timestamp, file_path) "
            "VALUES (?, ?, ?)",
            ("valid_session", "2024-01-01T00:00:00", str(tmp_autosave / "valid_session.pkl")),
        )
        sm.db.commit()
        result = sm.delete_session("valid_session")
        assert result["success"] is True
        assert not (tmp_autosave / "valid_session.pkl").exists()

    def test_get_preview_valid_name_works(self, sm: SessionManager):
        """A valid session name should return a preview (even if not in DB)."""
        result = sm.get_preview("valid_session")
        # May or may not have preview_messages depending on pickle content,
        # but should NOT have an error key
        assert "error" not in result
