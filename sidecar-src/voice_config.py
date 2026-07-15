"""Voice input configuration management.

Reads/writes ~/.pupcode_ide/voice.json for STT endpoint settings.
"""

import json
from pathlib import Path

from loguru import logger

_DEFAULT_DB_DIR = Path.home() / ".pupcode_ide"
_VOICE_CONFIG_PATH = _DEFAULT_DB_DIR / "voice.json"

_DEFAULT_CONFIG = {
    "enabled": False,
    "base_url": "",
    "model": "Systran/faster-whisper-small",
    "api_key": "",
    "language": "en",
    "chunk_duration_seconds": 30,
}


def read_voice_config() -> dict:
    """Read voice config from disk. Returns default if file doesn't exist.

    Masks the api_key field — shows '****' + last 4 chars.
    Never echoes the full key back to the frontend.
    """
    try:
        with open(_VOICE_CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
        # Merge with defaults for any missing keys
        merged = {**_DEFAULT_CONFIG, **config}
        # Mask API key before returning
        api_key = merged.get("api_key", "")
        if api_key:
            merged["api_key"] = _mask_api_key(api_key)
        return merged
    except FileNotFoundError:
        return dict(_DEFAULT_CONFIG)
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to read voice config: {e}")
        return dict(_DEFAULT_CONFIG)


def read_voice_config_raw() -> dict:
    """Read voice config from disk with REAL (unmasked) API key.

    For INTERNAL sidecar use ONLY (e.g., transcribe_audio STT auth).
    NEVER return this to the frontend.
    """
    try:
        with open(_VOICE_CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
        # Merge with defaults for any missing keys
        merged = {**_DEFAULT_CONFIG, **config}
        # Keep real API key — do NOT mask
        return merged
    except FileNotFoundError:
        return dict(_DEFAULT_CONFIG)
    except (json.JSONDecodeError, OSError) as e:
        logger.error(f"Failed to read voice config: {e}")
        return dict(_DEFAULT_CONFIG)


def _mask_api_key(api_key: str) -> str:
    """Mask API key showing only last 4 characters."""
    if len(api_key) <= 4:
        return "****"
    return "****" + api_key[-4:]


def write_voice_config(config: dict) -> dict:
    """Write voice config to disk. Returns the saved config."""
    try:
        _VOICE_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_VOICE_CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
        logger.info("Voice config saved")
        return config
    except OSError as e:
        logger.error(f"Failed to write voice config: {e}")
        raise


def validate_voice_config(config: dict) -> list[str]:
    """Validate voice config. Returns list of error messages (empty if valid)."""
    errors: list[str] = []
    if not config.get("base_url"):
        errors.append("Base URL is required")
    if not config.get("model"):
        errors.append("Model name is required")
    if not config.get("api_key"):
        errors.append("API key is required")
    return errors
