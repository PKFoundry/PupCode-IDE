"""Session management and token usage endpoints."""

import re
from typing import Dict, Optional

from fastapi import APIRouter, Request

from shared import emit_event, get_current_agent, get_global_model_name, logger, session_mgr

router = APIRouter(prefix="/api/sessions")
usage_router = APIRouter(prefix="/api/usage")
_SESSION_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _is_valid_session_name(session_name: str) -> bool:
    return (
        isinstance(session_name, str)
        and bool(session_name.strip())
        and "\x00" not in session_name
        and all(ord(c) >= 32 for c in session_name)
        and _SESSION_NAME_RE.fullmatch(session_name.strip()) is not None
    )


# =============================================================================
# Session CRUD
# =============================================================================


@router.get("/list")
async def list_sessions(
    search: str = None,
    sort: str = "timestamp",
    order: str = "desc",
    page: int = 1,
    limit: int = 50,
):
    """List saved sessions with pagination, search, and sorting."""
    try:
        result = session_mgr.list_sessions(search, sort, order, page, limit)
        return result
    except Exception as e:
        logger.error(f"Error listing sessions: {e}", exc_info=True)
        return {"sessions": [], "total": 0, "page": page, "limit": limit, "error": str(e)}


@router.post("/load")
async def load_session(request: dict):
    """Load a session's full message history."""
    session_name = request.get("session_name")
    if not session_name:
        return {"error": "session_name is required"}
    if not _is_valid_session_name(session_name):
        return {"success": False, "error": "Invalid session_name"}
    session_name = session_name.strip()
    try:
        result = session_mgr.load_session(session_name)
        # Don't return raw history over REST — just metadata.
        # History is loaded into the agent via WebSocket.
        return {
            "success": True,
            "session_name": session_name,
            "message_count": result["message_count"],
            "total_tokens": result["total_tokens"],
            "custom_name": result["custom_name"],
            "description": result["description"],
            "tags": result["tags"],
        }
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"Error loading session: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.post("/{session_name}/load-history")
async def load_session_history(session_name: str):
    """Load session history, inject into agent, and return for display."""
    if not _is_valid_session_name(session_name):
        return {"success": False, "error": "Invalid session_name"}
    session_name = session_name.strip()
    try:
        result = session_mgr.load_session(session_name)
        history = result["history"]

        # Inject into current agent so AI can continue the conversation
        agent = get_current_agent()
        agent.set_message_history(history)

        # Serialize messages for the frontend chat panel using new structured format
        display_messages = session_mgr.serialise_messages_for_display(
            history if isinstance(history, list) else []
        )

        # Emit via WebSocket so the frontend knows
        emit_event("session_loaded", {
            "session_name": session_name,
            "message_count": result["message_count"],
            "total_tokens": result["total_tokens"],
            "custom_name": result["custom_name"],
        })

        return {
            "success": True,
            "session_name": session_name,
            "message_count": result["message_count"],
            "total_tokens": result["total_tokens"],
            "custom_name": result["custom_name"],
            "messages": display_messages,
        }
    except FileNotFoundError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"Error loading session history: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.put("/{session_name}/rename")
async def rename_session(session_name: str, request: dict):
    """Rename a session and update its metadata."""
    if not _is_valid_session_name(session_name):
        return {"success": False, "error": "Invalid session_name"}
    session_name = session_name.strip()
    try:
        result = session_mgr.rename_session(
            session_name,
            custom_name=request.get("custom_name", ""),
            description=request.get("description"),
            tags=request.get("tags"),
        )
        return result
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        logger.error(f"Error renaming session: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.delete("/{session_name}")
async def delete_session(session_name: str):
    """Delete a session (files + DB entry)."""
    if not _is_valid_session_name(session_name):
        return {"success": False, "error": "Invalid session_name"}
    session_name = session_name.strip()
    try:
        result = session_mgr.delete_session(session_name)
        return result
    except Exception as e:
        logger.error(f"Error deleting session: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.get("/{session_name}/preview")
async def get_session_preview(session_name: str, count: int = 3):
    """Get a preview of the last N messages in a session."""
    if not _is_valid_session_name(session_name):
        return {"error": "Invalid session_name"}
    session_name = session_name.strip()
    try:
        result = session_mgr.get_preview(session_name, count)
        return result
    except Exception as e:
        logger.error(f"Error getting session preview: {e}", exc_info=True)
        return {"error": str(e)}


# =============================================================================
# Token Usage Endpoints
# =============================================================================


@usage_router.get("/summary")
async def get_usage_summary(period: str = "all", model: Optional[str] = None):
    """Get aggregated usage stats."""
    try:
        return session_mgr.get_usage_summary(period=period, model=model)
    except Exception as e:
        logger.error(f"Error getting usage summary: {e}", exc_info=True)
        return {"error": str(e)}


@usage_router.get("/by_session")
async def get_usage_by_session(limit: int = 50, offset: int = 0):
    """Get per-session usage breakdown."""
    try:
        return session_mgr.get_usage_by_session(limit=limit, offset=offset)
    except Exception as e:
        logger.error(f"Error getting usage by session: {e}", exc_info=True)
        return {"error": str(e)}


@usage_router.get("/daily")
async def get_daily_usage(days: int = 30):
    """Get daily usage aggregates for chart."""
    try:
        return session_mgr.get_daily_usage(days=days)
    except Exception as e:
        logger.error(f"Error getting daily usage: {e}", exc_info=True)
        return {"error": str(e)}


@usage_router.get("/by_model")
async def get_usage_by_model(period: str = "all", limit: int = 3, offset: int = 0):
    """Get per-model usage aggregates with pagination."""
    try:
        return session_mgr.get_usage_by_model(period=period, limit=limit, offset=offset)
    except Exception as e:
        logger.error(f"Error getting usage by model: {e}", exc_info=True)
        return {"error": str(e)}


@usage_router.post("/clear")
async def clear_token_stats():
    """Clear all token usage data and reset session counters."""
    try:
        session_mgr.clear_token_stats()
        return {"success": True}
    except Exception as e:
        logger.error(f"Error clearing token stats: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
