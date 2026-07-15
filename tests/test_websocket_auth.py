"""Tests for CRITICAL-2: WebSocket auth fix — require_ws_auth replaces inline checks."""

import ast
import asyncio
import os
import sys
from pathlib import Path
from unittest import mock

import pytest

# Add sidecar-src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))


class TestWebsocketAuthFix:
    """Verify CRITICAL-2 fix: websocket.py uses require_ws_auth, no inline auth."""

    def test_websocket_uses_require_ws_auth(self):
        """websocket.py must import and use require_ws_auth."""
        ws_path = Path(__file__).parent.parent / "sidecar-src" / "routers" / "websocket.py"
        source = ws_path.read_text()

        assert "require_ws_auth" in source
        assert "from auth_middleware import require_ws_auth" in source

    def test_no_inline_auth_imports(self):
        """websocket.py must NOT import _get_expected_token or _secure_compare."""
        ws_path = Path(__file__).parent.parent / "sidecar-src" / "routers" / "websocket.py"
        source = ws_path.read_text()
        tree = ast.parse(source)

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module == "auth_middleware":
                    for alias in node.names:
                        assert alias.name not in (
                            "_get_expected_token",
                            "_secure_compare",
                        ), f"Should not import {alias.name} — use require_ws_auth instead"

    def test_no_inline_auth_calls(self):
        """websocket.py must NOT call _get_expected_token or _secure_compare inline."""
        ws_path = Path(__file__).parent.parent / "sidecar-src" / "routers" / "websocket.py"
        source = ws_path.read_text()

        assert "_get_expected_token" not in source, "Inline _get_expected_token call must be removed"
        assert "_secure_compare" not in source, "Inline _secure_compare call must be removed"

    def test_require_ws_auth_raises_on_bad_token(self, monkeypatch):
        """require_ws_auth should reject unauthorized connections."""
        from auth_middleware import require_ws_auth

        monkeypatch.setenv("SIDECAR_AUTH_TOKEN", "valid-token")

        ws = mock.AsyncMock()
        ws.query_params = {"auth_token": "bad-token"}

        with pytest.raises(Exception):
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(require_ws_auth(ws))
            finally:
                loop.close()

        ws.close.assert_called()

    def test_require_ws_auth_passes_with_valid_token(self, monkeypatch):
        """require_ws_auth should accept valid tokens."""
        from auth_middleware import require_ws_auth

        monkeypatch.setenv("SIDECAR_AUTH_TOKEN", "valid-token")

        ws = mock.AsyncMock()
        ws.query_params = {"auth_token": "valid-token"}

        loop = asyncio.new_event_loop()
        result = loop.run_until_complete(require_ws_auth(ws))
        loop.close()

        assert result == "valid-token"
        ws.close.assert_not_called()

    def test_require_ws_auth_rejects_all_when_env_empty(self, monkeypatch):
        """CRITICAL-2: Empty SIDECAR_AUTH_TOKEN must reject ALL connections.

        The old code had: if expected and not _secure_compare(token, expected):
        When expected was empty (env not set), the check was SKIPPED entirely.
        require_ws_auth compares '' with the provided token, which always fails
        (empty string != anything), closing the connection.
        """
        from auth_middleware import require_ws_auth, _secure_compare

        # _secure_compare('', 'anything') should return False
        assert _secure_compare("", "anything") is False
        assert _secure_compare("", "") is True  # Only empty matches empty

        monkeypatch.delenv("SIDECAR_AUTH_TOKEN", raising=False)

        ws = mock.AsyncMock()
        ws.query_params = {"auth_token": "some-random-token"}

        with pytest.raises(Exception):
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(require_ws_auth(ws))
            finally:
                loop.close()

        ws.close.assert_called()
