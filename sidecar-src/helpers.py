"""Path helpers and model source finder."""

import json
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def _code_puppy_dir() -> Path:
    """Return the global code_puppy config directory (~/.code_puppy)."""
    return Path.home() / ".code_puppy"


def _pupcode_ide_dir() -> Path:
    """Return the global pupcode_ide config directory."""
    return Path.home() / ".pupcode_ide"


def _agent_dir() -> Path:
    """Return the JSON agents directory."""
    d = _code_puppy_dir() / "agents"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _themes_dir() -> Path:
    """Return the themes directory."""
    d = _pupcode_ide_dir() / "themes"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _find_model_source(name: str) -> Path:
    """Find which config file a model came from. Returns the file path to write back to."""
    from code_puppy.config import (
        EXTRA_MODELS_FILE,
        CHATGPT_MODELS_FILE,
        CLAUDE_MODELS_FILE,
        GEMINI_MODELS_FILE,
        COPILOT_MODELS_FILE,
    )

    source_files = [
        EXTRA_MODELS_FILE,
        CHATGPT_MODELS_FILE,
        CLAUDE_MODELS_FILE,
        GEMINI_MODELS_FILE,
        COPILOT_MODELS_FILE,
    ]

    for source_path in source_files:
        path = Path(source_path)
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    configs = json.load(f)
                if name in configs:
                    # Validate the resolved path is within allowed config directories
                    try:
                        resolved = path.resolve(strict=False)
                        allowed = [_code_puppy_dir().resolve(), _pupcode_ide_dir().resolve()]
                        if any(resolved.is_relative_to(a) for a in allowed):
                            return path
                    except (ValueError, OSError):
                        pass
                    logger.warning(
                        f"Model source path {path} is outside allowed directories; "
                        f"falling back to {EXTRA_MODELS_FILE}"
                    )
                    continue
            except (json.JSONDecodeError, OSError):
                continue

    return Path(EXTRA_MODELS_FILE)
