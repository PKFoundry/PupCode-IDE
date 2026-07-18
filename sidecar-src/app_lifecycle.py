"""Application lifecycle: AppState, lifespan, file watcher, emitter forwarding.

Contains the main AppState singleton and the lifespan context manager.
Calls initialize_tool_tracking() during app startup (MEDIUM-1).
"""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

# Import tool_tracking for initialization
from tool_tracking import initialize_tool_tracking

logger = logging.getLogger("sidecar")


class AppState:
    """Global sidecar state."""

    def __init__(self) -> None:
        self.working_dir: Optional[str] = None
        self._emitter_queue: Optional[asyncio.Queue] = None
        self._active_sessions: Dict[str, WebSocket] = {}
        self._emitter_task: Optional[asyncio.Task] = None
        self._file_ws_clients: Dict[str, WebSocket] = {}  # session_id -> ws

    async def initialize(self, working_dir: Optional[str] = None) -> None:
        """Initialize the sidecar state including tool tracking."""
        self.working_dir = working_dir
        if working_dir:
            os.chdir(working_dir)
            logger.info(f"Working directory: {working_dir}")
            self._start_file_watcher()
        else:
            logger.info("No working directory set yet — file watcher will start when workspace is selected")

        # Initialize tool call ID tracking (monkey-patches code_puppy emitter)
        initialize_tool_tracking()

        # Subscribe to emitter events and start forwarding task
        from code_puppy.plugins.frontend_emitter.emitter import subscribe
        self._emitter_queue = subscribe()
        self._emitter_task = asyncio.create_task(self._forward_emitter_events())
        logger.info("Emitter subscriber active")

    def _start_file_watcher(self) -> None:
        """Start the file watcher for the working directory."""
        if not self.working_dir:
            logger.warning("Cannot start file watcher: no working directory set")
            return
        try:
            from file_watcher import file_watcher

            if file_watcher.start(self.working_dir):
                logger.info("File watcher started for: %s", self.working_dir)
            else:
                logger.warning("Failed to start file watcher for: %s", self.working_dir)
        except ImportError:
            logger.warning("watchdog not installed, file watching disabled")
        except Exception as e:
            logger.warning("File watcher failed to start: %s", e)

    async def shutdown(self) -> None:
        """Shut down file watcher, emitter forwarding, and connections."""
        # Stop file watcher
        try:
            from file_watcher import file_watcher
            file_watcher.stop()
        except Exception:
            pass

        if self._emitter_task:
            self._emitter_task.cancel()
            try:
                await self._emitter_task
            except asyncio.CancelledError:
                pass
        if self._emitter_queue:
            from code_puppy.plugins.frontend_emitter.emitter import unsubscribe
            unsubscribe(self._emitter_queue)
        logger.info("Sidecar shut down")

    async def _forward_emitter_events(self) -> None:
        """Forward emitter events to connected WebSocket clients."""
        if not self._emitter_queue:
            return
        while True:
            try:
                event = await self._emitter_queue.get()
                event_type_before = event.get("type", "?")
                event = self._normalize_event(event)
                if event is None:
                    continue  # suppressed duplicate event (e.g. ToolCallPart from stream_event)
                event_type_after = event.get("type", "?")
                if event_type_before != event_type_after:
                    logger.debug(f"Normalized event: {event_type_before} -> {event_type_after}")
                disconnected: Set[str] = set()

                # Forward to chat sessions (session-specific)
                for sid, ws in self._active_sessions.items():
                    event_sid = event.get("session_id")
                    if event_sid is not None and event_sid != sid:
                        continue
                    try:
                        await ws.send_text(json.dumps(event))
                    except Exception:
                        disconnected.add(sid)

                for sid in disconnected:
                    self._active_sessions.pop(sid, None)

                # Forward file_changed events to ALL file WS clients
                if event.get("type") == "file_changed":
                    file_disconnected: Set[str] = set()
                    for fsid, fws in self._file_ws_clients.items():
                        try:
                            await fws.send_text(json.dumps(event))
                        except Exception:
                            file_disconnected.add(fsid)
                    for fsid in file_disconnected:
                        self._file_ws_clients.pop(fsid, None)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Forward error: %s", e, exc_info=True)

    def _normalize_event(self, event: Dict[str, Any]) -> Dict[str, Any]:
        """Normalize emitter events for the frontend."""
        event_type = event.get("type", "")
        data = event.get("data", {})

        if event_type == "stream_event":
            inner = data.get("event_data", {})

            # Delta tokens (text / thinking)
            if isinstance(inner, dict) and "delta" in inner:
                delta = inner["delta"]
                delta_type = inner.get("delta_type", "")
                content = delta.get("content_delta", "") if isinstance(delta, dict) else ""
                if content:
                    new_type = "thinking_token" if "Thinking" in delta_type else "token"
                    return {**event, "type": new_type, "data": {"content": content}}

            # Part start (initial content chunk)
            if isinstance(inner, dict) and "part" in inner:
                part = inner["part"]
                part_type = inner.get("part_type", "")
                logger.debug(f"stream_event part: type={part_type}, part_keys={list(part.keys()) if isinstance(part, dict) else 'not-a-dict'}")

                # Skip ToolCallPart and ToolReturnPart — handled by pydantic_patches
                if isinstance(part, dict):
                    part_type_name = part.get("type", "")
                    if part_type_name in ("ToolCallPart", "ToolReturnPart"):
                        logger.debug(f"Skipping {part_type_name} in stream_event (handled by pydantic_patches)")
                        return None  # suppress duplicate event

                # Regular text content
                content = part.get("content", "") if isinstance(part, dict) else ""
                if content and "Thinking" not in str(part_type):
                    return {**event, "type": "token", "data": {"content": content}}

        return event


# Singleton instance
app_state = AppState()


# =============================================================================
# App Lifespan
# =============================================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan context manager for startup/shutdown."""
    working_dir = os.environ.get("SIDECAR_WORKING_DIR")
    await app_state.initialize(working_dir)
    yield
    await app_state.shutdown()
