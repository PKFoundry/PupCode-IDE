"""Tests for path validation security."""

import sys
from pathlib import Path

import pytest

# Add sidecar-src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from path_utils import validate_workspace_path


class TestValidateWorkspacePath:
    """Tests for workspace path validation."""

    def test_accepts_valid_workspace_path(self, tmp_path):
        """Paths within workspace should be accepted and resolved."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        target = workspace / "src" / "app.py"
        
        validated = validate_workspace_path(str(target), str(workspace))
        assert validated == str(target.resolve())

    def test_accepts_relative_workspace_path(self, tmp_path):
        """Relative paths within workspace should be accepted."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        workspace.joinpath("src").mkdir()
        
        validated = validate_workspace_path("src/app.py", str(workspace))
        assert validated == str((workspace / "src" / "app.py").resolve())

    def test_rejects_parent_traversal(self, tmp_path):
        """Path with ../ escaping workspace should be rejected."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        
        with pytest.raises(ValueError, match="outside workspace"):
            validate_workspace_path("../etc/passwd", str(workspace))

    def test_rejects_absolute_system_path(self, tmp_path):
        """Absolute system path outside workspace should be rejected."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        
        with pytest.raises(ValueError, match="outside workspace"):
            validate_workspace_path("/etc/passwd", str(workspace))

    def test_rejects_deep_traversal(self, tmp_path):
        """Multiple ../ traversals should be caught."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        
        with pytest.raises(ValueError, match="outside workspace"):
            validate_workspace_path("../../../../etc/passwd", str(workspace))

    def test_rejects_symlink_escape(self, tmp_path):
        """Symlinks pointing outside workspace should be caught."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        outside = tmp_path / "secret"
        outside.mkdir()
        outside.joinpath("secret.txt").write_text("secret")
        
        # Create symlink inside workspace pointing outside
        (workspace / "link").symlink_to(outside / "secret.txt")
        
        with pytest.raises(ValueError, match="outside workspace"):
            validate_workspace_path(str(workspace / "link"), str(workspace))

    def test_rejects_none_workspace(self):
        """Validation should fail when workspace root is None."""
        with pytest.raises(ValueError, match="No workspace root"):
            validate_workspace_path("file.txt", None)

    @pytest.mark.skipif(sys.platform != "win32", reason="Backslash separator is Windows-only")
    def test_normalizes_path_separators(self, tmp_path):
        """Both forward and backslash separators should work (Windows only)."""
        workspace = tmp_path / "workspace"
        workspace.mkdir()
        (workspace / "src").mkdir()

        # Backslash separator (Windows only)
        validated = validate_workspace_path("src\\app.py", str(workspace))
        assert validated == str((workspace / "src" / "app.py").resolve())
