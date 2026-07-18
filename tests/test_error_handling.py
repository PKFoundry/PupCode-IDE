"""Tests for error_handling — verify no exception detail leakage."""

import logging
import sys
from pathlib import Path

import pytest

# Add sidecar-src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from error_handling import (
    _sanitize_context,
    access_denied_response,
    file_not_found_response,
    invalid_request_response,
    safe_error_response,
)


@pytest.fixture()
def test_logger() -> logging.Logger:
    """Create a test logger that captures output."""
    logger = logging.getLogger("test_error_handling")
    logger.setLevel(logging.DEBUG)
    # Remove any existing handlers to keep output clean
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setLevel(logging.DEBUG)
    logger.addHandler(handler)
    return logger


class TestSanitizeContext:
    """Verify _sanitize_context strips ALL C0 control characters (0x00-0x1F, 0x7F)."""

    def test_strips_newlines(self):
        assert _sanitize_context("hello\nworld") == "hello world"

    def test_strips_carriage_returns(self):
        assert _sanitize_context("hello\rworld") == "hello world"

    def test_strips_tabs(self):
        assert _sanitize_context("hello\tworld") == "hello world"

    def test_strips_escape_char(self):
        """ESC (0x1B) enables ANSI injection — must be stripped."""
        result = _sanitize_context("hello\x1b[31mworld")
        assert "\x1b" not in result
        assert result == "hello [31mworld"

    def test_strips_bel_char(self):
        """BEL (0x07) rings terminals — must be stripped."""
        assert _sanitize_context("hello\x07world") == "hello world"

    def test_strips_sub_char(self):
        """SUB (0x1A) acts as EOF on Unix — must be stripped."""
        assert _sanitize_context("hello\x1aworld") == "hello world"

    def test_strips_null_char(self):
        """NUL (0x00) must be stripped."""
        assert _sanitize_context("hello\x00world") == "hello world"

    def test_strips_del_char(self):
        """DEL (0x7F) must be stripped."""
        assert _sanitize_context("hello\x7fworld") == "hello world"

    def test_preserves_normal_text(self):
        assert _sanitize_context("normal text") == "normal text"

    def test_strips_multiple_control_chars(self):
        result = _sanitize_context("a\nb\rc\td\x1b\x07")
        assert "\n" not in result
        assert "\r" not in result
        assert "\t" not in result
        assert "\x1b" not in result
        assert "\x07" not in result


class TestSafeErrorResponse:
    """Verify safe_error_response redacts implementation details."""

    def test_no_exception_message_in_response(self, test_logger):
        """The exception message should NOT appear in the response."""
        secret = "Database connection refused: host=db-internal.local port=5432"
        exc = ConnectionRefusedError(secret)
        result = safe_error_response(exc, logger_obj=test_logger, context="DB fail")
        assert secret not in result["error"]
        assert result["success"] is False

    def test_no_exception_class_name_in_response(self, test_logger):
        """Internal class names shouldn't leak."""
        exc = AttributeError("'NoneType' object has no attribute '_secret_field'")
        result = safe_error_response(exc, logger_obj=test_logger)
        assert "_secret_field" not in result["error"]
        assert "NoneType" not in result["error"]

    def test_file_not_found_returns_specific_message(self, test_logger):
        """FileNotFoundError gets a user-friendly mapping."""
        exc = FileNotFoundError("/internal/path/to/file.pkl")
        result = safe_error_response(exc, logger_obj=test_logger)
        assert "not found" in result["error"].lower()
        assert "/internal/" not in result["error"]

    def test_value_error_returns_specific_message(self, test_logger):
        """ValueError gets a user-friendly mapping."""
        exc = ValueError("some internal validation detail")
        result = safe_error_response(exc, logger_obj=test_logger)
        assert "invalid" in result["error"].lower()
        assert "internal validation detail" not in result["error"]

    def test_generic_unknown_exception(self, test_logger):
        """Unknown exceptions get a safe fallback message."""
        exc = Exception("internal_only_debug_info: stack trace here")
        result = safe_error_response(exc, logger_obj=test_logger)
        assert "unexpected" in result["error"].lower()
        assert "internal_only" not in result["error"]

    def test_status_code_passthrough(self, test_logger):
        """Custom status codes are respected."""
        exc = ValueError("bad")
        result = safe_error_response(
            exc, logger_obj=test_logger, context="test", status_code=502
        )
        assert result["status_code"] == 502

    def test_extra_fields_included(self, test_logger):
        """Extra fields are merged into the response."""
        exc = Exception("detail")
        result = safe_error_response(
            exc,
            logger_obj=test_logger,
            context="test",
            extra={"retry_after": 5, "request_id": "abc-123"},
        )
        assert result["retry_after"] == 5
        assert result["request_id"] == "abc-123"

    def test_json_decode_error_mapping(self, test_logger):
        """JSONDecodeError gets a friendly message."""
        import json
        exc = json.JSONDecodeError("Expecting value", "doc", 0)
        result = safe_error_response(exc, logger_obj=test_logger)
        assert "malformed" in result["error"].lower()

    def test_connection_error_mapping(self, test_logger):
        """ConnectionError gets a friendly message."""
        exc = ConnectionError("refused")
        result = safe_error_response(exc, logger_obj=test_logger)
        assert "connect" in result["error"].lower()

    def test_permission_error_mapping(self, test_logger):
        """PermissionError gets a friendly message."""
        exc = PermissionError("operation not permitted")
        result = safe_error_response(exc, logger_obj=test_logger)
        assert "denied" in result["error"].lower()


class TestFileNotFoundResponse:
    """Verify file_not_found_response returns consistent 404."""

    def test_basic_response(self, test_logger):
        result = file_not_found_response(test_logger, context="Missing session")
        assert result["success"] is False
        assert result["status_code"] == 404
        assert "not found" in result["error"].lower()

    def test_context_not_in_response_body(self, test_logger):
        """Context should go to logs, not response body."""
        result = file_not_found_response(test_logger, context="theme.json missing")
        assert "theme.json" not in result["error"]

    def test_accepts_extra_fields(self, test_logger):
        result = file_not_found_response(
            test_logger, context="test", extra={"resource_type": "session"}
        )
        assert result["resource_type"] == "session"


class TestInvalidRequestResponse:
    """Verify invalid_request_response returns consistent 400."""

    def test_basic_response(self, test_logger):
        result = invalid_request_response(test_logger, context="Bad JSON")
        assert result["success"] is False
        assert result["status_code"] == 400
        assert "invalid" in result["error"].lower()

    def test_no_stack_trace_keywords(self, test_logger):
        result = invalid_request_response(test_logger)
        err_lower = result["error"].lower()
        assert "traceback" not in err_lower
        assert "exception" not in err_lower

    def test_accepts_extra_fields(self, test_logger):
        result = invalid_request_response(
            test_logger, context="test", extra={"field": "name"}
        )
        assert result["field"] == "name"


class TestAccessDeniedResponse:
    """Verify access_denied_response returns consistent 403."""

    def test_basic_response(self, test_logger):
        result = access_denied_response(test_logger, context="Path traversal blocked")
        assert result["success"] is False
        assert result["status_code"] == 403
        assert result["error"] == "Access denied"

    def test_context_not_leaked_to_response(self, test_logger):
        """Sensitive context details stay in logs only."""
        secret_context = "user tried to read /etc/passwd"
        result = access_denied_response(test_logger, context=secret_context)
        assert "/etc/passwd" not in str(result)
        assert "user tried" not in str(result)

    def test_accepts_extra_fields(self, test_logger):
        result = access_denied_response(
            test_logger, context="test", extra={"path": "sanitized"}
        )
        assert result["path"] == "sanitized"
