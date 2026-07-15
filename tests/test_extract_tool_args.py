"""Tests for _extract_tool_args (MEDIUM-5: eliminate duplicated inline patterns)."""

import json
import sys
from pathlib import Path
from unittest import mock

import pytest

# Add sidecar-src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from message_serialization import _extract_tool_args


class TestExtractToolArgs:
    """Tests for _extract_tool_args — the deduplicated arg extraction helper."""

    def test_args_as_dict_plain_value(self):
        """Plain dict from args_as_dict should be returned directly."""
        part = mock.MagicMock(spec=[])
        part.args_as_dict = {"file_path": "/foo/bar.py", "start_line": 10}

        args = _extract_tool_args(part)
        assert args == {"file_path": "/foo/bar.py", "start_line": 10}

    def test_args_as_dict_callable_returns_dict(self):
        """Callable args_as_dict should be invoked and return dict."""
        part = mock.MagicMock(spec=[])
        part.args_as_dict = mock.Mock(return_value={"key": "value"})

        args = _extract_tool_args(part)
        assert args == {"key": "value"}
        part.args_as_dict.assert_called_once()

    def test_args_as_json_str_parsed(self):
        """Valid JSON string from args_as_json_str should be parsed."""
        part = mock.MagicMock(spec=[])
        part.args_as_dict = None
        part.args_as_json_str = '{"command": "ls -la"}'

        args = _extract_tool_args(part)
        assert args == {"command": "ls -la"}

    def test_args_as_dict_priority_over_json_str(self):
        """args_as_dict takes priority when both are present."""
        part = mock.MagicMock(spec=[])
        part.args_as_dict = {"source": "dict"}
        part.args_as_json_str = '{"source": "json"}'

        args = _extract_tool_args(part)
        assert args == {"source": "dict"}

    def test_callable_args_as_dict_raises_falls_through(self):
        """If callable args_as_dict raises, fall through to next attr."""
        part = mock.MagicMock(spec=[])
        part.args_as_dict = mock.Mock(side_effect=RuntimeError("fail"))
        part.args_as_json_str = '{"fallback": true}'

        args = _extract_tool_args(part)
        assert args == {"fallback": True}



    def test_repr_parsing_last_resort(self):
        """Fall back to parsing repr when other methods fail."""
        part = mock.MagicMock(spec=[])
        part.args_as_dict = None
        part.args_as_json_str = "not-valid-json"
        type(part).__repr__ = lambda self: "ToolCallPart(id='456', args='{\"x\": 1}')"

        args = _extract_tool_args(part)
        assert args == {"x": 1}

    def test_returns_empty_dict_on_total_failure(self):
        """Return empty dict when nothing works — no crash."""
        part = mock.MagicMock(spec=[])
        part.args_as_dict = None
        part.args_as_json_str = None
        repr(part)  # default repr, no args= pattern

        args = _extract_tool_args(part)
        assert args == {}
