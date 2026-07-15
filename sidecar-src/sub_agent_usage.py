"""Sub-agent token usage capture via monkey-patch.

Patches code_puppy.tools.subagent_invocation._invoke_agent_impl so that
each sub-agent run records its own token usage with an agent_name tag.
"""

import logging
from typing import Any

logger = logging.getLogger("sidecar")

_original_invoke_agent_impl: Any = None


async def _patched_invoke_agent_impl(
    context: Any,
    agent_name: str,
    prompt: str,
    session_id: str | None = None,
    model_name: str | None = None,
    **extra_kwargs: Any,
) -> Any:
    """Wraps the original _invoke_agent_impl to capture token usage."""
    global _original_invoke_agent_impl

    result = await _original_invoke_agent_impl(
        context, agent_name, prompt, session_id, model_name, **extra_kwargs
    )

    # Attempt to capture usage from the result
    try:
        usage_obj = None
        if hasattr(result, "usage"):
            u = result.usage
            usage_obj = u() if callable(u) else u
        elif hasattr(result, "_usage"):
            usage_obj = result._usage

        if usage_obj is not None:
            from sidecar_src.shared import session_mgr

            effective_model = (
                getattr(result, "model_name", None) or model_name or "unknown"
            )
            db_session = session_id or f"subagent-{agent_name}"

            session_mgr.record_token_usage(
                session_name=db_session,
                model=effective_model,
                input_tokens=getattr(usage_obj, "input_tokens", 0),
                output_tokens=getattr(usage_obj, "output_tokens", 0),
                thinking_tokens=getattr(usage_obj, "thinking_tokens", 0),
                cache_read_tokens=getattr(usage_obj, "cache_read_tokens", 0),
                cache_write_tokens=getattr(usage_obj, "cache_write_tokens", 0),
                agent_name=agent_name,
            )
            logger.info(
                "Recorded sub-agent usage for %s: "
                "in=%s out=%s",
                agent_name,
                getattr(usage_obj, "input_tokens", "?"),
                getattr(usage_obj, "output_tokens", "?"),
            )
    except Exception as e:
        # Never let usage capture crash the sub-agent invocation
        logger.warning("Failed to capture sub-agent usage for %s: %s", agent_name, e)

    return result


def initialize_sub_agent_usage() -> None:
    """Enable sub-agent usage capture by monkey-patching _invoke_agent_impl.

    Must be called once at application startup, after tool_tracking init.
    Safe to call multiple times — subsequent calls are no-ops.
    """
    global _original_invoke_agent_impl

    if _original_invoke_agent_impl is not None:
        return  # Already initialized

    try:
        from code_puppy.tools import subagent_invocation

        _original_invoke_agent_impl = subagent_invocation._invoke_agent_impl
        subagent_invocation._invoke_agent_impl = _patched_invoke_agent_impl
        logger.info("Sub-agent usage capture enabled")
    except Exception as e:
        # Patching failure must not crash the sidecar
        logger.warning("Could not initialize sub-agent usage capture: %s", e)
