"""Tool call ID tracking: inject tool_call_id into tool_call_start/complete events.

Moves monkey-patching from import-time to explicit initialize_tool_tracking() call.
"""

import logging
import uuid
from typing import Any, Dict

logger = logging.getLogger("sidecar")

# Tracking state
_pending_tool_calls: Dict[str, list] = {}  # tool_name -> stack of tool_call_ids
_pending_counter = 0

# Reference to the original emit_event, set during initialization
_original_emit_event = None


def _emit_event_impl(event_type: str, data: Any = None, session_id: Any = None) -> None:
    """Core implementation: wrapper that injects tool_call_id and delegates to original."""
    global _pending_counter

    if _original_emit_event is None:
        # Not yet initialized — this shouldn't happen in normal operation
        logger.warning("emit_event called before initialize_tool_tracking()")
        return

    if data is None:
        data = {}

    if event_type == "tool_call_start":
        _pending_counter += 1
        tool_name = data.get("tool_name", "unknown")
        tool_call_id = f"tc-{_pending_counter}-{uuid.uuid4().hex[:8]}"
        _pending_tool_calls.setdefault(tool_name, []).append(tool_call_id)
        data = {**data, "tool_call_id": tool_call_id}
        logger.debug(f"tool_call_start: {tool_name} -> {tool_call_id}")

    elif event_type == "tool_call_complete":
        tool_name = data.get("tool_name", "unknown")
        stack = _pending_tool_calls.get(tool_name)
        if stack:
            tool_call_id = stack.pop()
            data = {**data, "tool_call_id": tool_call_id}
            logger.debug(f"tool_call_complete: {tool_name} -> {tool_call_id}")
            if not stack:
                del _pending_tool_calls[tool_name]
        else:
            logger.warning(f"tool_call_complete: no matching start for {tool_name}")

    _original_emit_event(event_type, data, session_id=session_id)


def emit_event(event_type: str, data: Any = None, session_id: Any = None) -> None:
    """Public emit_event with tool_call_id injection.

    Routers call this directly. Delegates to _emit_event_impl which handles
    the tool_call_id bookkeeping.
    """
    _emit_event_impl(event_type, data, session_id=session_id)


def initialize_tool_tracking() -> None:
    """Initialize tool call ID tracking by monkey-patching the emitter module.

    Must be called once at application startup. This patches the code_puppy
    emitter module so ALL callers (including register_callbacks) use our
    wrapper with tool_call_id injection.
    """
    global _original_emit_event

    import code_puppy.plugins.frontend_emitter.emitter as _emitter_module
    import code_puppy.plugins.frontend_emitter.register_callbacks as _rc_module

    from code_puppy.plugins.frontend_emitter.emitter import emit_event as _orig

    _original_emit_event = _orig

    # Monkey-patch the emitter module so ALL callers (including register_callbacks)
    # use our wrapper with tool_call_id injection.
    _emitter_module.emit_event = _emit_event_impl

    # Also patch register_callbacks which has its own local import of emit_event
    _rc_module.emit_event = _emit_event_impl

    logger.info("Tool call ID tracking enabled")

    # Initialize sub-agent usage capture (related monkey-patch)
    try:
        from sub_agent_usage import initialize_sub_agent_usage
        initialize_sub_agent_usage()
    except Exception as e:
        logger.warning("Failed to initialize sub-agent usage capture: %s", e)
