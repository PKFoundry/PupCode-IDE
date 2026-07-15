"""
PupCode IDE — Python Sidecar

Runs as a plain Python script via system Python (no PyInstaller).
Imports code-puppy from site-packages and exposes:
- WebSocket endpoint (/ws/chat) for streaming conversation
- REST endpoints for models, agents, config, files, sessions

Requirements: Python 3.13+, code-puppy installed in the same environment.
"""

import os
import sys
from typing import Any, Dict

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Fix Windows console encoding for emoji/unicode output from code-puppy
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# =============================================================================
# Shared State (loaded once, shared with all routers)
# =============================================================================

from shared import app_state, lifespan, session_mgr, logger

# =============================================================================
# FastAPI App
# =============================================================================

app = FastAPI(title="Code Puppy Sidecar", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[],
    allow_origin_regex=r"(https|tauri)?://(?:localhost|127\.0\.0\.1)(?::\d+)?",
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Auth-Token"],
)


# =============================================================================
# Authentication Middleware (HTTP)
# =============================================================================

from auth_middleware import (
    _AUTH_EXEMPT_PATHS,
    _get_expected_token,
    _secure_compare,
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    """HTTP middleware: validate X-Auth-Token header on all non-exempt routes."""

    if request.method == "OPTIONS":
        return await call_next(request)
    if request.url.path in _AUTH_EXEMPT_PATHS:
        return await call_next(request)

    token = request.headers.get("X-Auth-Token", "")
    expected = _get_expected_token()
    if not token or not _secure_compare(token, expected):
        return JSONResponse(
            status_code=401,
            content={"detail": "Authentication required"},
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await call_next(request)


# =============================================================================
# Health (exempt from auth)
# =============================================================================


@app.get("/api/health")
async def health():
    return {"status": "ok", "working_dir": app_state.working_dir, "python_version": sys.version}


# =============================================================================
# Mount Routers
# =============================================================================

from routers.models import router as models_router
from routers.agents import router as agents_router
from routers.files import router as files_router
from routers.sessions import router as sessions_router, usage_router
from routers.config import (
    config_router,
    workspace_router,
    voice_router,
    themes_router,
    mcp_router,
    commands_router,
    rules_router,
)
app.include_router(models_router)         # /api/models/*
app.include_router(agents_router)         # /api/agents/*
app.include_router(files_router)          # /api/files/*
app.include_router(sessions_router)       # /api/sessions/*
app.include_router(usage_router)          # /api/usage/*
app.include_router(config_router)         # /api/config/*
app.include_router(workspace_router)      # /api/workspace/*
app.include_router(voice_router)          # /api/voice/config/*
app.include_router(themes_router)         # /api/themes/*
app.include_router(mcp_router)            # /api/mcp/servers/*
app.include_router(commands_router)       # /api/commands/*
app.include_router(rules_router)          # /api/agents-rules/*

# =============================================================================
# WebSocket Routes (manual registration — not via include_router)
# =============================================================================

from routers.websocket import chat_websocket, files_websocket

app.websocket("/ws/chat")(chat_websocket)
app.websocket("/ws/files")(files_websocket)

# =============================================================================
# Entry Point
# =============================================================================


def main():
    port = int(os.environ.get("SIDECAR_PORT", "8765"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
