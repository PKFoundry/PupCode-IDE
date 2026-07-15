"""Authentication middleware for the sidecar API.

Extracts auth token from X-Auth-Token header (HTTP) or auth_token query param (WebSocket).
Compares against SIDECAR_AUTH_TOKEN env var.
/api/health is exempt from authentication (needed by Rust health check).
"""

import os
from typing import Optional

from fastapi import Depends, HTTPException, Request, WebSocket, status
from starlette.status import WS_1008_POLICY_VIOLATION

# Environment variable set by the Rust sidecar manager
_AUTH_TOKEN_ENV = "SIDECAR_AUTH_TOKEN"

# Paths exempt from authentication (must match exactly)
_AUTH_EXEMPT_PATHS = {"/api/health"}


def _get_expected_token() -> str:
    """Get the expected auth token from environment."""
    token = os.environ.get(_AUTH_TOKEN_ENV, "")
    if not token:
        # If no token is set, deny all authenticated requests
        # (health endpoint still works since it's exempt)
        return ""
    return token


async def require_auth(request: Request) -> str:
    """FastAPI dependency that validates auth for HTTP requests.

    Extracts the token from the X-Auth-Token header.
    /api/health is exempt from authentication.

    Raises HTTPException(401) if auth is missing or invalid.
    """
    if request.url.path in _AUTH_EXEMPT_PATHS:
        return _get_expected_token()

    token = request.headers.get("X-Auth-Token", "")
    expected = _get_expected_token()

    if not token or not _secure_compare(token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token


async def require_ws_auth(websocket: WebSocket) -> str:
    """FastAPI dependency that validates auth for WebSocket connections.

    Extracts the token from the auth_token query parameter.
    Closes the connection with code 1008 (Policy Violation) if invalid.
    """
    token = websocket.query_params.get("auth_token", "")
    expected = _get_expected_token()

    if not token or not _secure_compare(token, expected):
        await websocket.close(code=WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    return token


def _secure_compare(a: str, b: str) -> bool:
    """Constant-time string comparison to prevent timing attacks."""
    # Use hmac.compare_digest for constant-time comparison
    import hmac
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))
