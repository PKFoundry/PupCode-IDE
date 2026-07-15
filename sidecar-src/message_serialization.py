"""Message serialization: restricted pickle, tool arg extraction, display formatting."""

from __future__ import annotations

import json
import logging
import pickle
import re
from io import BytesIO
from typing import Any, Dict, List, Optional

from schema import _PICKLE_WHITELIST_MODULES

logger = logging.getLogger(__name__)


# =============================================================================
# Restricted unpickler for session files
# =============================================================================


class RestrictedUnpickler(pickle.Unpickler):
    """Restricted pickle Unpickler that only allows whitelisted modules.

    Prevents arbitrary code execution during deserialization by blocking
    modules not in the whitelist. This mitigates CRITICAL-3 from the audit.
    """

    def find_class(self, module: str, name: str):
        if any(
            module == allowed or module.startswith(allowed + ".")
            for allowed in _PICKLE_WHITELIST_MODULES
        ):
            return super().find_class(module, name)
        raise pickle.UnpicklingError(
            f"RestrictedUnpickler: module '{module}' is blocked for security"
        )


def safe_pickle_loads(data: bytes) -> Any:
    """Load pickled data with restricted unpickler.

    Strips the legacy CPSESSION header if present.
    Raises UnpicklingError if disallowed modules are encountered.
    """
    if data.startswith(b"CPSESSION\x01"):
        data = data[len(b"CPSESSION\x01") + 32:]
    return RestrictedUnpickler(BytesIO(data)).load()


def safe_pickle_dumps(obj: Any) -> bytes:
    """Serialize object using pickle (for backward compatibility)."""
    return pickle.dumps(obj)


# =============================================================================
# Tool argument extraction (MEDIUM-5: eliminate duplicated inline patterns)
# =============================================================================


def _extract_tool_args(part) -> dict:
    """Extract args dict from a ToolCallPart.

    Handles args_as_dict / args_as_json_str attributes which can be
    bound methods (callable) or plain values. Falls back to parsing
    repr as a last resort.
    """
    args: dict = {}
    for attr_name in ("args_as_dict", "args_as_json_str"):
        val = getattr(part, attr_name, None)
        if val is None:
            continue
        if callable(val):
            try:
                val = val()
            except Exception:
                continue
        if isinstance(val, dict):
            args = val
            break
        elif isinstance(val, str):
            try:
                args = json.loads(val)
                break
            except (json.JSONDecodeError, TypeError):
                continue
    # Last resort: parse from repr
    if not args:
        repr_str = repr(part)
        m = re.search(r"args='([^']*)'", repr_str)
        if m:
            try:
                args = json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
    return args


# =============================================================================
# Display formatting helpers
# =============================================================================


def _format_tool_preview(tool_name: str, args: dict) -> str:
    """Format tool call args into a clean, readable preview."""
    if tool_name == "read_file":
        path = args.get("file_path", args.get("path", "unknown"))
        start = args.get("start_line", args.get("start", 1))
        num = args.get("num_lines", "")
        if num:
            return f"read_file `{path}` (lines {start}-{start + int(num) - 1})"
        return f"read_file `{path}` (from line {start})"
    elif tool_name in ("create_file", "write_file_content", "replace_in_file", "delete_file"):
        return f"{tool_name} `{args.get('file_path', args.get('path', 'unknown'))}`"
    elif tool_name == "agent_run_shell_command":
        cmd = str(args.get("command", ""))[:60]
        return f"shell `{cmd}`"
    elif tool_name == "grep":
        search = args.get("search_string", "")
        directory = args.get("directory", ".")
        return f'grep "{search}" in {directory}'
    else:
        return tool_name


def _summarize_tool_result(tool_name: str, content: Any, file_path: str | None = None) -> str:
    """Summarize tool result for chat display. Returns: tool_name → file_path (summary)."""
    # Extract actual text from pydantic models (e.g. ReadFileOutput)
    if hasattr(content, "model_dump"):
        content = content.model_dump()
    if isinstance(content, dict):
        text = content.get("content", content.get("text", str(content)))
    else:
        text = str(content) if not isinstance(content, str) else content
    if not text or not text.strip():
        return "<no output>"
    if tool_name == "read_file":
        lines = text.strip().split("\n")
        path_info = f" ({file_path})" if file_path else ""
        return f"{len(lines)} lines{path_info}"
    elif tool_name in ("create_file", "write_file_content", "replace_in_file"):
        path_info = f" ({file_path})" if file_path else ""
        return f"written{path_info}"
    elif tool_name == "delete_file":
        path_info = f" ({file_path})" if file_path else ""
        return f"deleted{path_info}"
    elif tool_name == "agent_run_shell_command":
        first = text.strip().split("\n")[0][:100] if text.strip() else "<no output>"
        return first
    else:
        first = text.strip().split("\n")[0][:100]
        return first + ("..." if len(text) > 100 else "")


# =============================================================================
# Message serialization for display / preview
# =============================================================================


def serialise_messages_for_display(history: list) -> list:
    """Serialise full message history into display-ready messages.

    Produces properly structured messages matching the live streaming format:
    - User messages: { type: 'user', content }
    - Assistant text: { type: 'assistant', content }
    - Tool calls: { type: 'tool_call', tool_name, tool_args, tool_status, tool_result_summary }

    Pairs ToolCallPart with ToolReturnPart using tool_call_id.
    """
    if not isinstance(history, list):
        return []

    # Build tool_call_id -> return content map from all messages
    tool_returns: Dict[str, dict] = {}
    for msg in history:
        if isinstance(msg, dict):
            continue
        for part in getattr(msg, "parts", []):
            if type(part).__name__ == "ToolReturnPart":
                tcid = getattr(part, "tool_call_id", None)
                if tcid:
                    content = getattr(part, "content", "")
                    tool_name = getattr(part, "tool_name", "")
                    tool_returns[tcid] = {
                        "content": content,
                        "tool_name": tool_name,
                        "is_error": getattr(part, "is_error", False),
                    }

    display_messages: list[dict] = []
    msg_idx = 0

    for msg in history:
        if isinstance(msg, dict):
            # Already a dict (e.g. system message), skip or render plainly
            role = msg.get("role", "unknown")
            content = str(msg.get("content", ""))
            if content.strip() and role == "user":
                display_messages.append({
                    "type": "user",
                    "content": content.strip(),
                })
            msg_idx += 1
            continue

        parts = getattr(msg, "parts", [])
        kind = getattr(msg, "kind", None)

        for part in parts:
            pt = type(part).__name__

            if pt == "UserPromptPart":
                content = getattr(part, "content", "")
                if content and content.strip():
                    display_messages.append({
                        "type": "user",
                        "content": str(content).strip(),
                    })

            elif pt == "TextPart":
                content = getattr(part, "content", "")
                if content and content.strip():
                    display_messages.append({
                        "type": "assistant",
                        "content": str(content).strip(),
                    })

            elif pt == "ThinkingPart":
                # Skip thinking parts for display
                pass

            elif pt == "ToolCallPart":
                tool_name = getattr(part, "tool_name", "unknown")
                tcid = getattr(part, "tool_call_id", None)

                # Extract args using the shared helper (MEDIUM-5 fix)
                args = _extract_tool_args(part)

                # Look up the corresponding tool return
                return_info = tool_returns.get(tcid) if tcid else None
                is_error = return_info["is_error"] if return_info else False
                result_content = return_info["content"] if return_info else ""
                file_path = args.get("file_path", args.get("path"))
                result_summary = _summarize_tool_result(tool_name, result_content, file_path)

                display_messages.append({
                    "type": "tool_call",
                    "tool_name": tool_name,
                    "tool_args": args,
                    "tool_status": "error" if is_error else "success",
                    "tool_result_summary": result_summary,
                    "content": "",  # compat with frontend
                })

            elif pt == "ToolReturnPart":
                # Already handled via ToolCallPart pairing, skip
                pass

            elif pt == "SystemPromptPart":
                # Skip system prompts
                pass

        msg_idx += 1

    return display_messages


def _serialise_message(msg: Any, tool_calls_map: dict | None = None, max_length: int = 2000) -> dict:
    """Serialise a pydantic-ai message for JSON preview.

    Handles ModelRequest (kind=request) and ModelResponse (kind=response)
    with their various part types: UserPromptPart, TextPart, ThinkingPart,
    ToolCallPart, ToolReturnPart, SystemPromptPart.
    """
    if isinstance(msg, dict):
        return {
            "role": msg.get("role", "unknown"),
            "content": str(msg.get("content", ""))[:500],
        }

    kind = getattr(msg, "kind", None)
    parts = getattr(msg, "parts", [])

    # Map kind to human-readable role
    if kind == "request":
        # Could be user message or tool return
        if parts:
            first_part = type(parts[0]).__name__
            if first_part == "UserPromptPart":
                role = "user"
            else:
                role = "tool"
        else:
            role = "system"
    elif kind == "response":
        role = "assistant"
    else:
        role = "unknown"

    texts: list[str] = []
    for part in parts:
        pt = type(part).__name__
        if pt == "UserPromptPart":
            content = getattr(part, "content", "")
            if content:
                texts.append(str(content))
        elif pt == "TextPart":
            content = getattr(part, "content", "")
            if content:
                texts.append(str(content))
        elif pt == "ThinkingPart":
            content = getattr(part, "content", "")
            if content:
                texts.append(f"[thinking] {content}")
        elif pt == "ToolCallPart":
            tool_name = getattr(part, "tool_name", "unknown")
            # Use shared arg extraction helper (MEDIUM-5 fix)
            args = _extract_tool_args(part)
            preview = _format_tool_preview(tool_name, args)
            texts.append(f"\u25c8 {preview}")
        elif pt == "ToolReturnPart":
            content = getattr(part, "content", "")
            tool_name = getattr(part, "tool_name", "")
            # Look up the matching tool call to get file_path
            tcid = getattr(part, "tool_call_id", None)
            file_path = None
            if tcid and tool_calls_map:
                call_args = tool_calls_map.get(tcid, {})
                file_path = call_args.get("file_path", call_args.get("path"))
            summary = _summarize_tool_result(tool_name, content, file_path)
            texts.append(f"  {tool_name} \u2192 {summary}")
        elif pt == "SystemPromptPart":
            content = getattr(part, "content", "")
            if content:
                texts.append(f"[system] {str(content)[:200]}")
        else:
            # Fallback: try .content, then .text, then str()
            content = getattr(part, "content", None) or getattr(part, "text", None)
            if content:
                texts.append(str(content)[:200])

    content = "\n".join(texts) if texts else ""
    return {
        "role": role,
        "content": content[:max_length] if max_length else content,
    }
