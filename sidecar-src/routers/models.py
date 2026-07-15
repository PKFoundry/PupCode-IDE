"""Model management endpoints."""

import json
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter

from shared import (
    _code_puppy_dir,
    _find_model_source,
    emit_event,
    logger,
    session_mgr,
)

router = APIRouter(prefix="/api/models")


@router.get("")
async def list_models():
    try:
        from code_puppy.model_factory import ModelFactory
        from code_puppy.config import get_global_model_name

        configs = ModelFactory.load_config()
        current = get_global_model_name()
        model_list = [
            {
                "name": name,
                "provider": cfg.get("type", cfg.get("provider", "unknown")),
                "display_name": cfg.get("description", cfg.get("name", name)),
                "is_active": name == current,
            }
            for name, cfg in configs.items()
        ]
        return {"models": model_list, "active_model": current}
    except Exception as e:
        logger.error(f"Error listing models: {e}", exc_info=True)
        return {"models": [], "active_model": None, "error": str(e)}


@router.post("/switch")
async def switch_model(body: Dict[str, str]):
    from code_puppy.config import set_model_name

    model_name = body.get("name", "")
    try:
        set_model_name(model_name)
        logger.info(f"Switched to model: {model_name}")
        return {"success": True, "active_model": model_name}
    except Exception as e:
        logger.error(f"Error switching model: {e}")
        return {"success": False, "error": str(e)}


@router.post("/add")
async def add_model(body: Dict[str, Any]):
    """Add a new model configuration."""
    try:
        from code_puppy.model_factory import ModelFactory
        from code_puppy.config import EXTRA_MODELS_FILE

        configs = ModelFactory.load_config()
        model_name = body.get("name", "").strip()

        if not model_name:
            return {"success": False, "error": "Model name is required"}

        if model_name in configs:
            return {"success": False, "error": f"Model '{model_name}' already exists"}

        # Build model config entry
        model_config = {
            "type": body.get("type", "openai"),
            "name": model_name,
        }

        if "endpoint" in body:
            model_config["endpoint"] = body["endpoint"]
        if "api_key" in body:
            model_config["api_key_env"] = body["api_key"]
        if "description" in body:
            model_config["description"] = body["description"]
        if "context_length" in body:
            model_config["context_length"] = body["context_length"]
        if "timeout" in body:
            model_config["timeout"] = body["timeout"]

        configs[model_name] = model_config

        # New models always go to extra_models.json
        extra_path = Path(EXTRA_MODELS_FILE)
        extra_config = {}
        if extra_path.exists():
            try:
                with open(extra_path, "r", encoding="utf-8") as f:
                    extra_config = json.load(f)
            except (json.JSONDecodeError, Exception):
                extra_config = {}
        extra_config[model_name] = model_config
        extra_path.parent.mkdir(parents=True, exist_ok=True)
        with open(extra_path, "w", encoding="utf-8") as f:
            json.dump(extra_config, f, indent=4)

        logger.info(f"Added model: {model_name}")
        return {"success": True, "name": model_name}
    except Exception as e:
        logger.error(f"Error adding model: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.delete("/{name}")
async def delete_model(name: str):
    """Remove a model configuration."""
    try:
        from code_puppy.model_factory import ModelFactory

        configs = ModelFactory.load_config()
        if name not in configs:
            return {"success": False, "error": f"Model '{name}' not found"}

        del configs[name]

        # Find which file the model came from and remove it from there
        source_path = _find_model_source(name)
        if source_path.exists():
            try:
                with open(source_path, "r", encoding="utf-8") as f:
                    source_config = json.load(f)
                source_config.pop(name, None)
                with open(source_path, "w", encoding="utf-8") as f:
                    json.dump(source_config, f, indent=4)
                logger.info(f"Removed model {name} from {source_path.name}")
            except (json.JSONDecodeError, Exception):
                pass

        logger.info(f"Deleted model: {name}")
        return {"success": True, "name": name}
    except Exception as e:
        logger.error(f"Error deleting model: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.get("/{name}")
async def get_model(name: str):
    """Get full model configuration."""
    try:
        from code_puppy.model_factory import ModelFactory

        configs = ModelFactory.load_config()
        if name not in configs:
            return {"success": False, "error": f"Model '{name}' not found"}

        # Find which file this model came from
        source_path = _find_model_source(name)
        source_file = source_path.name if source_path.exists() else "bundled"

        return {
            "success": True,
            "name": name,
            "config": configs[name],
            "source_file": source_file,
        }
    except Exception as e:
        logger.error(f"Error getting model: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@router.put("/{name}")
async def update_model(name: str, body: Dict[str, Any]):
    """Update a model configuration."""
    try:
        from code_puppy.model_factory import ModelFactory

        configs = ModelFactory.load_config()
        if name not in configs:
            return {"success": False, "error": f"Model '{name}' not found"}

        # If raw JSON provided, replace entire config
        if "raw_config" in body:
            configs[name] = body["raw_config"]
        else:
            # Update individual fields
            config = configs[name]
            for key in ("type", "endpoint", "api_key_env", "description", "context_length", "timeout"):
                if key in body:
                    config[key] = body[key]
            if "name" in body and body["name"]:
                new_name = body["name"]
                config["name"] = new_name
                configs[new_name] = config
                del configs[name]
                name = new_name

        # Find which file the model came from and write back to it
        source_path = _find_model_source(name)
        source_config = {}
        if source_path.exists():
            try:
                with open(source_path, "r", encoding="utf-8") as f:
                    source_config = json.load(f)
            except (json.JSONDecodeError, Exception):
                source_config = {}
        source_config[name] = configs[name]
        source_path.parent.mkdir(parents=True, exist_ok=True)
        with open(source_path, "w", encoding="utf-8") as f:
            json.dump(source_config, f, indent=4)

        logger.info(f"Updated model {name} in {source_path.name}")
        return {"success": True, "name": name}
    except Exception as e:
        logger.error(f"Error updating model: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
