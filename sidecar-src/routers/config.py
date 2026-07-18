"""Configuration, workspace, voice, themes, MCP servers, slash commands, and agents-rules endpoints."""

import json
import os
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import JSONResponse

from error_handling import (
    access_denied_response,
    file_not_found_response,
    invalid_request_response,
    safe_error_response,
)
from shared import (
    _agent_dir,
    _code_puppy_dir,
    _themes_dir,
    app_state,
    emit_event,
    get_current_agent,
    get_current_agent_name,
    get_global_model_name,
    logger,
    set_current_agent,
    set_model_name,
)
from voice_config import read_voice_config, read_voice_config_raw, validate_voice_config, write_voice_config


# =============================================================================
# Config & Workspace
# =============================================================================

config_router = APIRouter(prefix="/api/config")


@config_router.get("")
async def get_config():
    return {
        "working_dir": app_state.working_dir,
        "active_model": get_global_model_name(),
        "active_agent": get_current_agent_name(),
    }


@config_router.put("")
async def update_config(body: Dict[str, Any]):
    """Update config — working_dir, model."""
    updates: Dict[str, Any] = {}
    if "working_dir" in body:
        new_dir = body["working_dir"]
        try:
            # Resolve to canonical path BEFORE checking existence
            resolved = os.path.realpath(os.path.abspath(new_dir))
            if not os.path.isdir(resolved):
                return {"success": False, "error": "Directory does not exist"}
            old_dir = app_state.working_dir
            app_state.working_dir = resolved
            os.chdir(resolved)
            updates["working_dir"] = resolved
            # Restart file watcher with new directory
            app_state._start_file_watcher()
            logger.info("Workspace changed: %s -> %s", old_dir, resolved)
        except Exception as e:
            return safe_error_response(
                e, logger_obj=logger, context="changing workspace directory"
            )
    if "model" in body:
        set_model_name(body["model"])
        updates["model"] = body["model"]
    return {"success": True, "updates": updates}


workspace_router = APIRouter(prefix="/api/workspace")


@workspace_router.get("")
async def get_workspace():
    """Get current workspace info."""
    wd = app_state.working_dir or ""
    return {
        "working_dir": app_state.working_dir,
        "exists": os.path.isdir(wd),
        "is_git_repo": os.path.isdir(os.path.join(wd, ".git")),
    }


# =============================================================================
# Voice Configuration
# =============================================================================

voice_router = APIRouter(prefix="/api/voice/config")


@voice_router.get("")
async def get_voice_config():
    """Get current voice input configuration."""
    return read_voice_config()


@voice_router.put("")
async def save_voice_config(config: dict):
    """Save voice input configuration."""
    try:
        saved = write_voice_config(config)
        return {"success": True, "config": saved}
    except OSError as e:
        return safe_error_response(e, logger_obj=logger, context="saving voice config")


@voice_router.post("/validate")
async def validate_config_endpoint(config: dict):
    """Validate voice configuration without saving."""
    errors = validate_voice_config(config)
    return {"valid": len(errors) == 0, "errors": errors}


@voice_router.post("/transcribe")
async def transcribe_audio(file: UploadFile):
    """Proxy audio file to the configured STT endpoint."""
    import httpx
    from starlette.responses import JSONResponse as StarletteJSONResponse

    # Use raw config with REAL API key for internal STT auth
    config = read_voice_config_raw()
    if not config.get("base_url"):
        return JSONResponse(status_code=400, content={"error": "STT endpoint not configured"})

    try:
        # Read the audio file
        audio_data = await file.read()

        # Forward to STT endpoint
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{config['base_url'].rstrip('/')}/audio/transcriptions",
                headers={"Authorization": f"Bearer {config['api_key']}"},
                files={"file": (file.filename or "recording.webm", audio_data, "audio/webm")},
                data={
                    "model": config.get("model", "Systran/faster-whisper-small"),
                    "language": config.get("language", "en"),
                },
            )

        if resp.status_code != 200:
            return JSONResponse(
                status_code=resp.status_code,
                content={"error": "STT service returned an error"},
            )

        result = resp.json()
        return {"text": result.get("text", "")}

    except httpx.ConnectError:
        return JSONResponse(status_code=502, content={"error": "Cannot connect to STT endpoint"})
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="transcribing audio")


# =============================================================================
# Theme Endpoints
# =============================================================================

themes_router = APIRouter(prefix="/api/themes")


@themes_router.get("/list")
async def list_themes():
    """List all saved theme files."""
    try:
        themes = []
        for f in sorted(_themes_dir().glob("*.json")):
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
                themes.append({
                    "name": data.get("name", f.stem),
                    "file": f.name,
                    "author": data.get("author", ""),
                    "createdAt": data.get("createdAt", ""),
                })
            except Exception:
                continue
        return {"themes": themes}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="listing themes", extra={"themes": []})


@themes_router.get("/{filename}")
async def get_theme(filename: str):
    """Get a specific theme by filename."""
    try:
        theme_path = (_themes_dir() / filename).resolve()
        themes_dir = _themes_dir().resolve()

        # Containment check using relative_to() instead of string prefix
        try:
            theme_path.relative_to(themes_dir)
        except ValueError:
            return access_denied_response(
                logger, context=f"path traversal attempt in theme access: {filename}"
            )

        if not theme_path.exists() or not theme_path.name.endswith(".json"):
            return file_not_found_response(logger, context=f"theme file {filename}")

        data = json.loads(theme_path.read_text(encoding="utf-8"))
        return data
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"loading theme {filename}")


@themes_router.post("/save")
async def save_theme(request: Request):
    """Save a custom theme to disk."""
    try:
        body = await request.json()
        name = body.get("name", "")
        colors = body.get("colors", {})
        author = body.get("author", "")
        # Use basename() to strip any directory components
        safe_basename = Path(name).name
        safe_name = safe_basename.strip().replace(" ", "-").lower()
        filename = f"{safe_name}.json"
        theme_path = (_themes_dir() / filename).resolve()
        themes_dir = _themes_dir().resolve()

        # Containment check using relative_to()
        try:
            theme_path.relative_to(themes_dir)
        except ValueError:
            return access_denied_response(
                logger, context=f"path traversal attempt in theme save: {name}"
            )

        data = {
            "$schema": "code-puppy-theme-v1",
            "name": name.strip(),
            "author": author,
            "createdAt": __import__("datetime").datetime.now().isoformat(),
            "colors": colors,
        }
        theme_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return {"success": True, "file": filename}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="saving theme")


@themes_router.delete("/{filename}")
async def delete_theme(filename: str):
    """Delete a custom theme file."""
    try:
        theme_path = (_themes_dir() / filename).resolve()
        themes_dir = _themes_dir().resolve()

        # Containment check using relative_to() instead of string prefix
        try:
            theme_path.relative_to(themes_dir)
        except ValueError:
            return access_denied_response(
                logger, context=f"path traversal attempt in theme deletion: {filename}"
            )

        if not theme_path.exists() or not theme_path.name.endswith(".json"):
            return file_not_found_response(logger, context=f"theme file {filename}")

        theme_path.unlink()
        return {"success": True}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"deleting theme {filename}")


# =============================================================================
# MCP Server Management
# =============================================================================

mcp_router = APIRouter(prefix="/api/mcp/servers")


@mcp_router.get("")
async def list_mcp_servers():
    """List all MCP servers and their status."""
    try:
        mcp_config_path = _code_puppy_dir() / "mcp.json"
        servers = []

        if mcp_config_path.exists():
            with open(mcp_config_path, "r", encoding="utf-8") as f:
                mcp_data = json.load(f)
            for server_name, server_cfg in mcp_data.get("servers", {}).items():
                servers.append({
                    "name": server_name,
                    "command": server_cfg.get("command", ""),
                    "args": server_cfg.get("args", []),
                    "env": server_cfg.get("env", {}),
                    "status": "configured",
                })

        # Also check for MCP config in code_puppy's config directory
        global_mcp_path = Path.home() / ".config" / "code_puppy" / "mcp.json"
        if global_mcp_path.exists() and not mcp_config_path.exists():
            with open(global_mcp_path, "r", encoding="utf-8") as f:
                mcp_data = json.load(f)
            for server_name, server_cfg in mcp_data.get("servers", {}).items():
                servers.append({
                    "name": server_name,
                    "command": server_cfg.get("command", ""),
                    "args": server_cfg.get("args", []),
                    "env": server_cfg.get("env", {}),
                    "status": "configured",
                })

        return {"servers": servers}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="listing MCP servers", extra={"servers": []})


@mcp_router.post("/add")
async def add_mcp_server(body: Dict[str, Any]):
    """Add a new MCP server configuration."""
    try:
        name = body.get("name", "").strip()
        command = body.get("command", "")
        args = body.get("args", [])
        env = body.get("env", {})

        if not name or not command:
            return {"success": False, "error": "Name and command are required"}

        mcp_dir = _code_puppy_dir()
        mcp_dir.mkdir(parents=True, exist_ok=True)
        mcp_config_path = mcp_dir / "mcp.json"

        # Load existing or create new
        if mcp_config_path.exists():
            with open(mcp_config_path, "r", encoding="utf-8") as f:
                mcp_data = json.load(f)
        else:
            mcp_data = {"servers": {}}

        mcp_data["servers"][name] = {
            "command": command,
            "args": args,
            "env": env if env else {},
        }

        with open(mcp_config_path, "w", encoding="utf-8") as f:
            json.dump(mcp_data, f, indent=2)

        logger.info("Added MCP server: %s", name)
        return {"success": True, "name": name}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"adding MCP server {name}")


@mcp_router.post("/{name}/start")
async def start_mcp_server(name: str):
    """Start an MCP server (delegates to code_puppy)."""
    try:
        agent = get_current_agent()
        if hasattr(agent, "mcp_manager"):
            await agent.mcp_manager.start_server(name)
            return {"success": True, "name": name, "status": "started"}
        else:
            return {"success": False, "error": "Current agent does not support MCP"}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"starting MCP server {name}")


@mcp_router.post("/{name}/stop")
async def stop_mcp_server(name: str):
    """Stop an MCP server."""
    try:
        agent = get_current_agent()
        if hasattr(agent, "mcp_manager"):
            await agent.mcp_manager.stop_server(name)
            return {"success": True, "name": name, "status": "stopped"}
        else:
            return {"success": False, "error": "Current agent does not support MCP"}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"stopping MCP server {name}")


@mcp_router.delete("/{name}")
async def delete_mcp_server(name: str):
    """Remove an MCP server configuration."""
    try:
        mcp_config_path = _code_puppy_dir() / "mcp.json"
        if not mcp_config_path.exists():
            return {"success": False, "error": "MCP config not found"}

        with open(mcp_config_path, "r", encoding="utf-8") as f:
            mcp_data = json.load(f)

        if name not in mcp_data.get("servers", {}):
            return {"success": False, "error": f"MCP server '{name}' not found"}

        del mcp_data["servers"][name]

        with open(mcp_config_path, "w", encoding="utf-8") as f:
            json.dump(mcp_data, f, indent=2)

        logger.info("Deleted MCP server: %s", name)
        return {"success": True, "name": name}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"deleting MCP server {name}")


# =============================================================================
# Slash Commands
# =============================================================================

commands_router = APIRouter(prefix="/api/commands")


@commands_router.get("")
async def list_commands():
    """List available slash commands."""
    try:
        commands = [
            {"name": "/model", "description": "Switch active model", "category": "model"},
            {"name": "/agent", "description": "Switch active agent", "category": "agent"},
            {"name": "/truncate", "description": "Clear conversation history", "category": "chat"},
            {"name": "/add_model", "description": "Add a new model from models.dev", "category": "model"},
            {"name": "/pin_model", "description": "Pin model for sub-agents", "category": "model"},
            {"name": "/mcp", "description": "Manage MCP servers", "category": "mcp"},
            {"name": "/dbos", "description": "Toggle durable execution", "category": "system"},
            {"name": "/clear", "description": "Clear the chat", "category": "chat"},
            {"name": "/help", "description": "Show available commands", "category": "system"},
        ]

        # Also check for custom commands
        custom_dir = Path(".claude") / "commands"
        if custom_dir.exists():
            for cmd_file in custom_dir.iterdir():
                if cmd_file.is_file() and cmd_file.suffix:
                    commands.append({
                        "name": f"/{cmd_file.stem}",
                        "description": f"Custom command: {cmd_file.name}",
                        "category": "custom",
                    })

        return {"commands": commands}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="listing slash commands", extra={"commands": []})


@commands_router.post("/execute")
async def execute_command(body: Dict[str, str]):
    """Execute a slash command."""
    command = body.get("command", "").strip()
    args = body.get("args", "")

    try:
        from code_puppy.agents.agent_manager import get_current_agent as _get_current_agent

        if command in ("/truncate", "/clear"):
            # Clear conversation history
            _get_current_agent().reset()
            return {"success": True, "command": command, "output": "Conversation cleared"}

        elif command == "/model":
            if args:
                set_model_name(args)
                return {"success": True, "command": command, "output": f"Switched to model: {args}"}
            return {"success": False, "error": "Usage: /model <model_name>"}

        elif command == "/agent":
            if args:
                set_current_agent(args)
                return {"success": True, "command": command, "output": f"Switched to agent: {args}"}
            return {"success": False, "error": "Usage: /agent <agent_name>"}

        elif command == "/help":
            return {"success": True, "command": command, "output": "Available commands: /model, /agent, /truncate, /clear, /mcp, /dbos, /add_model, /pin_model"}

        else:
            # Forward unknown commands to the agent as a regular message
            return {"success": True, "command": command, "output": f"Forwarding '{command}' to agent"}

    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"executing command {command}")


# =============================================================================
# AGENTS.md Rules
# =============================================================================

rules_router = APIRouter(prefix="/api/agents-rules")


@rules_router.get("")
async def get_agents_rules():
    """Read AGENTS.md rules files."""
    try:
        rules = []

        # Global AGENTS.md
        global_path = Path.home() / ".code_puppy" / "AGENTS.md"
        if global_path.exists():
            rules.append({
                "path": str(global_path),
                "scope": "global",
                "content": global_path.read_text(encoding="utf-8"),
            })

        # Project AGENTS.md
        project_path = Path("AGENTS.md")
        if project_path.exists():
            rules.append({
                "path": str(project_path),
                "scope": "project",
                "content": project_path.read_text(encoding="utf-8"),
            })

        return {"rules": rules}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="reading AGENTS.md", extra={"rules": []})
