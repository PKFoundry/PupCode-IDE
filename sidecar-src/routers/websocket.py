"""WebSocket handlers for chat and file events.

These handlers are imported by sidecar_main.py and registered manually
using app.websocket() because WebSocket routes cannot use include_router().
"""

import asyncio
import base64
import json
import uuid
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect

# Import auth utilities
from auth_middleware import require_ws_auth

# Import from shared module
from shared import (
    app_state,
    auto_save_session_if_enabled,
    current_emitter_session_id,
    emit_event,
    get_current_agent,
    get_global_model_name,
    logger,
    session_mgr,
)


# =============================================================================
# Heartbeat
# =============================================================================


async def _heartbeat(session_id: str) -> None:
    """Emit heartbeat events every 10s while agent is running.

    This keeps the frontend alive during long tool executions
    (read_file, create_file, shell commands) where no stream
    events are emitted for 10-30+ seconds.
    """
    try:
        while True:
            await asyncio.sleep(10)
            emit_event("heartbeat", {})
    except asyncio.CancelledError:
        pass


# =============================================================================
# Chat WebSocket Handler
# =============================================================================


async def chat_websocket(websocket: WebSocket):
    """Main chat WebSocket connection handler."""
    from code_puppy.plugins.frontend_emitter.session_context import current_emitter_session_id

    # Authenticate before accepting
    await require_ws_auth(websocket)

    await websocket.accept()
    session_id = None

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "data": {"error": "Invalid JSON"}}))
                continue

            msg_type = message.get("type", "")

            if msg_type == "subscribe":
                session_id = message.get("session_id", str(uuid.uuid4()))
                app_state._active_sessions[session_id] = websocket
                await websocket.send_text(json.dumps({"type": "subscribed", "data": {"session_id": session_id}}))

            elif msg_type == "user_message":
                content = message.get("content", "")
                session_id = message.get("session_id", str(uuid.uuid4()))
                attachments = message.get("attachments")
                app_state._active_sessions[session_id] = websocket
                await _handle_user_message(websocket, content, session_id, attachments)

            elif msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        if session_id:
            app_state._active_sessions.pop(session_id, None)
        logger.info(f"Client disconnected (session: {session_id})")
    except RuntimeError as e:
        # Starlette raises RuntimeError when client closes before receive_text()
        if session_id:
            app_state._active_sessions.pop(session_id, None)
        logger.info(f"Client disconnected (session: {session_id}): {e}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        if session_id:
            app_state._active_sessions.pop(session_id, None)


# =============================================================================
# File WebSocket Handler
# =============================================================================


async def files_websocket(websocket: WebSocket):
    """Persistent WebSocket for file change events."""
    # Authenticate before accepting
    await require_ws_auth(websocket)

    await websocket.accept()
    session_id = str(uuid.uuid4())

    try:
        app_state._file_ws_clients[session_id] = websocket
        logger.info(f"File WS client connected: {session_id}")
        await websocket.send_text(
            json.dumps({"type": "connected", "data": {"session_id": session_id}})
        )

        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue

            if message.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        app_state._file_ws_clients.pop(session_id, None)
        logger.info(f"File WS client disconnected: {session_id}")
    except Exception as e:
        logger.error(f"File WS error: {e}", exc_info=True)
        app_state._file_ws_clients.pop(session_id, None)


# =============================================================================
# Internal: Process User Message
# =============================================================================


async def _handle_user_message(
    websocket: WebSocket, content: str, session_id: str, attachments: Optional[list] = None
) -> None:
    """Process a user message through the code-puppy agent."""
    from code_puppy.plugins.frontend_emitter.session_context import current_emitter_session_id
    from code_puppy.config import auto_save_session_if_enabled

    token = None
    hb_task: Optional[asyncio.Task] = None
    try:
        token = current_emitter_session_id.set(session_id)
        agent = get_current_agent()

        # Start heartbeat — proves backend is alive during long tool execs
        hb_task = asyncio.create_task(_heartbeat(session_id))

        # Convert base64 attachments to BinaryContent
        images = []
        if attachments:
            try:
                from pydantic_ai import BinaryContent
                for att in attachments:
                    raw = base64.b64decode(att["data"])
                    images.append(BinaryContent(data=raw, media_type=att["mimeType"]))
                logger.info(f"Attached {len(images)} image(s) to message")
            except ImportError:
                logger.warning("pydantic_ai.BinaryContent not available, ignoring attachments")
            except Exception as e:
                logger.warning(f"Failed to process attachments: {e}")

        try:
            if images:
                result = await agent.run_with_mcp(content, attachments=images)
            else:
                result = await agent.run_with_mcp(content)

            # Sync message history back to the agent.
            # pydantic-ai does NOT modify agent._message_history in-place;
            # it tracks messages internally and returns them in the result.
            if hasattr(result, "all_messages"):
                agent._message_history = list(result.all_messages())

            # Extract actual text from AgentRunResult
            if hasattr(result, "output"):
                response_text = result.output if result.output else ""
            elif hasattr(result, "data"):
                response_text = str(result.data) if result.data else ""
            else:
                response_text = str(result) if result else ""

            # Capture token usage from result.usage()
            try:
                usage_obj = result.usage()
                model_name = get_global_model_name()
                session_mgr.record_token_usage(
                    session_name=session_id,
                    model=model_name,
                    input_tokens=getattr(usage_obj, "input_tokens", 0),
                    output_tokens=getattr(usage_obj, "output_tokens", 0),
                    thinking_tokens=getattr(usage_obj, "thinking_tokens", 0),
                    cache_read_tokens=getattr(usage_obj, "cache_read_tokens", 0),
                    cache_write_tokens=getattr(usage_obj, "cache_write_tokens", 0),
                    agent_name=None,
                )
                logger.info(f"Recorded usage for {session_id}: in={usage_obj.input_tokens} out={usage_obj.output_tokens} cache_r={getattr(usage_obj, 'cache_read_tokens', 0)} cache_w={getattr(usage_obj, 'cache_write_tokens', 0)}")
            except Exception as e:
                logger.warning(f"Could not capture token usage: {e}")

            try:
                emit_event("message_complete", {"content": response_text})
            except Exception:
                logger.debug("Client disconnected before message_complete")
            auto_save_session_if_enabled()
        except Exception as e:
            logger.error(f"Agent run error: {e}", exc_info=True)
            try:
                emit_event("error", {"error": str(e)})
            except Exception:
                logger.debug("Client disconnected before error event")

    except Exception as e:
        logger.error(f"Error handling message: {e}", exc_info=True)
    finally:
        if hb_task and not hb_task.done():
            hb_task.cancel()
        if token is not None:
            try:
                current_emitter_session_id.reset(token)
            except Exception:
                pass
