"""Shared state, helpers, and emitter wrappers for the sidecar.

Imported by sidecar_main.py and all router modules.
Rewritten as a re-export hub for MEDIUM-1 compliance.
All exports preserved for backward compatibility.
"""

# =============================================================================
# Code-puppy imports (patching + agent/model management)
# =============================================================================

from code_puppy.pydantic_patches import apply_all_patches
apply_all_patches()

from code_puppy.agents.agent_manager import (
    get_available_agents,
    get_current_agent,
    get_current_agent_name,
    set_current_agent,
)
from code_puppy.config import get_global_model_name, set_model_name, auto_save_session_if_enabled

# Frontend emitter integration — MUST import to auto-register callbacks!
import code_puppy.plugins.frontend_emitter.register_callbacks  # noqa: F401
from code_puppy.plugins.frontend_emitter.session_context import (
    current_emitter_session_id,
)

# =============================================================================
# Re-export from helpers.py (path utilities)
# =============================================================================

from helpers import (
    _agent_dir,
    _pupcode_ide_dir,
    _code_puppy_dir,
    _find_model_source,
    _themes_dir,
)

# =============================================================================
# Re-export from tool_tracking.py (emit_event with tool_call_id injection)
# =============================================================================

from tool_tracking import (
    emit_event,
)

# =============================================================================
# Re-export from app_lifecycle.py (AppState singleton + lifespan)
# =============================================================================

from app_lifecycle import (
    AppState,
    app_state,
    lifespan,
)

# =============================================================================
# Shared logger
# =============================================================================

import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sidecar")

# =============================================================================
# Session Manager (shared singleton)
# =============================================================================

from session_manager import SessionManager

session_mgr = SessionManager()
