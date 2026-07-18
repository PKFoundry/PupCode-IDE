"""Safe error response utilities.

Ensures internal exception details, stack traces, and implementation
artifacts never leak into API responses while preserving useful context
in server-side logs.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

_CONTROL_CHARS = re.compile(r'[\x00-\x1f\x7f]')


def redact_error(exc: Exception) -> str:
    """Return a generic error string with no implementation detail.

    Public API — used by both REST routers and WebSocket handlers.
    Maps common exception types to user-friendly, non-leaking messages.
    """
    # Map common exception types to user-friendly messages.
    # NOTE: More specific subclasses must come BEFORE their parent classes.
    # e.g. JSONDecodeError must come before ValueError, OSError before Exception.
    _MAPPING: list[tuple[type[Exception], str]] = [
        (json.JSONDecodeError, "The provided JSON was malformed"),
        (FileNotFoundError, "The requested resource was not found"),
        (IsADirectoryError, "Expected a file but found a directory"),
        (NotADirectoryError, "Expected a directory but found a file"),
        (PermissionError, "Access denied due to insufficient permissions"),
        (TimeoutError, "The operation timed out"),
        (ConnectionError, "Unable to connect to the required service"),
        (ValueError, "One or more input values were invalid"),
        (KeyError, "A required field was missing"),
        (OSError, "An operating system operation failed"),
    ]
    for exc_type, msg in _MAPPING:
        if isinstance(exc, exc_type):
            return msg
    return "An unexpected error occurred"


def _sanitize_context(context: str) -> str:
    """Strip all C0 control characters (U+0000..U+001F, U+007F) to prevent log injection."""
    return _CONTROL_CHARS.sub(' ', context)


def safe_error_response(
    exc: Exception,
    *,
    logger_obj: logging.Logger,
    context: str = "Unknown error",
    status_code: int = 500,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Log full exception internally; return sanitized response externally.

    Args:
        exc: The caught exception.
        logger_obj: Logger instance for server-side logging.
        context: Brief description of the operation that failed.
        status_code: HTTP-like status code for classification.
        extra: Additional safe fields to include in the response.

    Returns:
        A dict safe for serialization to the client.
    """
    ctx = _sanitize_context(context)
    logger_obj.error(
        "%s: %s: %s",
        ctx,
        exc.__class__.__name__,
        str(exc),
        exc_info=True,
    )
    result: dict[str, Any] = {
        "success": False,
        "error": redact_error(exc),
        "status_code": status_code,
    }
    if extra:
        result.update(extra)
    return result


def file_not_found_response(
    logger_obj: logging.Logger,
    *,
    context: str = "Resource not found",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a 404-style error response for missing resources.

    Args:
        logger_obj: Logger instance for server-side logging.
        context: Brief description of the missing resource.
        extra: Additional safe fields to include in the response.

    Returns:
        A dict safe for serialization to the client.
    """
    ctx = _sanitize_context(context)
    logger_obj.info("%s", ctx)
    result: dict[str, Any] = {
        "success": False,
        "error": "The requested resource was not found",
        "status_code": 404,
    }
    if extra:
        result.update(extra)
    return result


def invalid_request_response(
    logger_obj: logging.Logger,
    *,
    context: str = "Invalid request",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a 400-style error response for bad input.

    Args:
        logger_obj: Logger instance for server-side logging.
        context: Brief description of the validation failure.
        extra: Additional safe fields to include in the response.

    Returns:
        A dict safe for serialization to the client.
    """
    ctx = _sanitize_context(context)
    logger_obj.warning("Invalid request: %s", ctx)
    result: dict[str, Any] = {
        "success": False,
        "error": "One or more input values were invalid",
        "status_code": 400,
    }
    if extra:
        result.update(extra)
    return result


def access_denied_response(
    logger_obj: logging.Logger,
    *,
    context: str = "Access denied",
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a 403-style error response for forbidden access.

    Args:
        logger_obj: Logger instance for server-side logging.
        context: Brief description of the denied action.
        extra: Additional safe fields to include in the response.

    Returns:
        A dict safe for serialization to the client.
    """
    ctx = _sanitize_context(context)
    logger_obj.warning("Access denied: %s", ctx)
    result: dict[str, Any] = {
        "success": False,
        "error": "Access denied",
        "status_code": 403,
    }
    if extra:
        result.update(extra)
    return result
