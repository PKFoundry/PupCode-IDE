"""Agent management endpoints."""

import json
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter

from error_handling import (
    file_not_found_response,
    safe_error_response,
)
from shared import (
    _agent_dir,
    logger,
)

router = APIRouter(prefix="/api/agents")


@router.get("")
async def list_agents():
    from code_puppy.agents.agent_manager import get_available_agents, get_current_agent_name

    try:
        agents = get_available_agents()
        current_name = get_current_agent_name()
        agent_list = [
            {
                "name": name,
                "display_name": display_name,
                "description": "",
                "is_active": name == current_name,
            }
            for name, display_name in agents.items()
        ]
        return {"agents": agent_list, "active_agent": current_name}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="listing agents")


@router.post("/switch")
async def switch_agent(body: Dict[str, str]):
    from code_puppy.agents.agent_manager import set_current_agent

    agent_name = body.get("name", "")
    try:
        success = set_current_agent(agent_name)
        logger.info("Switched to agent: %s", agent_name)
        return {"success": success, "active_agent": agent_name}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"switching to agent {agent_name}")


@router.get("/{name}")
async def get_agent(name: str):
    """Get details for a specific agent."""
    try:
        from code_puppy.agents.agent_manager import (
            discover_json_agents,
            get_available_agents,
            get_current_agent,
        )

        agents = get_available_agents()
        if name not in agents:
            return {"error": f"Agent '{name}' not found", "available": list(agents.keys())}

        # Look up JSON agent file from both user and project directories
        json_agents = discover_json_agents()
        if name in json_agents:
            json_path = json_agents[name]
            with open(json_path, "r", encoding="utf-8") as f:
                agent_data = json.load(f)
            return {
                "name": name,
                "display_name": agents[name],
                "description": agent_data.get("description", ""),
                "system_prompt": agent_data.get("system_prompt", ""),
                "tools": agent_data.get("tools", []),
                "raw_config": agent_data,
                "json_path": json_path,
            }

        # Built-in agent — return what we can
        agent = get_current_agent()
        return {
            "name": name,
            "display_name": agents[name],
            "description": getattr(agent, "description", ""),
            "system_prompt": getattr(agent, "system_prompt", ""),
            "tools": getattr(agent, "available_tools", []),
        }
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"getting agent details for {name}")


@router.post("/create")
async def create_agent(body: Dict[str, Any]):
    """Create a new JSON agent."""
    try:
        agent_name = body.get("name", "").strip()
        description = body.get("description", "")
        system_prompt = body.get("system_prompt", "")
        tools = body.get("tools", [])

        if not agent_name:
            return {"success": False, "error": "Agent name is required"}

        # Build the JSON agent file
        agent_dir = _agent_dir()
        agent_dir.mkdir(parents=True, exist_ok=True)

        agent_data = {
            "name": agent_name,
            "description": description,
            "system_prompt": system_prompt,
            "tools": tools,
        }

        agent_file = agent_dir / f"{agent_name}.json"
        with open(agent_file, "w", encoding="utf-8") as f:
            json.dump(agent_data, f, indent=2)

        logger.info("Created JSON agent: %s", agent_name)
        return {"success": True, "name": agent_name, "path": str(agent_file)}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"creating agent {agent_name}")


@router.put("/{name}")
async def update_agent(name: str, body: Dict[str, Any]):
    """Update an existing JSON agent."""
    try:
        from code_puppy.agents.agent_manager import discover_json_agents

        json_agents = discover_json_agents()
        if name not in json_agents:
            return {"success": False, "error": f"Agent '{name}' not found"}

        agent_file = Path(json_agents[name])
        with open(agent_file, "r", encoding="utf-8") as f:
            agent_data = json.load(f)

        # Update fields
        for key in ("description", "system_prompt", "tools"):
            if key in body:
                agent_data[key] = body[key]

        with open(agent_file, "w", encoding="utf-8") as f:
            json.dump(agent_data, f, indent=2)

        logger.info("Updated JSON agent: %s", name)
        return {"success": True, "name": name}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"updating agent {name}")


@router.delete("/{name}")
async def delete_agent(name: str):
    """Delete a JSON agent."""
    try:
        from code_puppy.agents.agent_manager import discover_json_agents

        json_agents = discover_json_agents()
        if name not in json_agents:
            return {"success": False, "error": f"Agent '{name}' not found"}

        agent_file = Path(json_agents[name])
        agent_file.unlink()
        logger.info("Deleted JSON agent: %s", name)
        return {"success": True, "name": name}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context=f"deleting agent {name}")
