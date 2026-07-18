"""File management endpoints."""

import os
from typing import Any, Dict, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from error_handling import (
    file_not_found_response,
    invalid_request_response,
    safe_error_response,
)
from path_utils import validate_workspace_path
from shared import app_state, logger

router = APIRouter(prefix="/api/files")


@router.get("/tree")
async def get_file_tree(path: Optional[str] = None):
    target = path or app_state.working_dir
    if not target or not os.path.isdir(target):
        return {"error": "Invalid path"}
    # Validate path is within workspace to prevent directory traversal
    try:
        validated_target = validate_workspace_path(target, app_state.working_dir)
    except ValueError as e:
        return JSONResponse(status_code=403, content=invalid_request_response(
            logger, context="path outside workspace"
        ))
    try:
        def build_tree(dir_path: str, depth: int = 0) -> list:
            result = []
            try:
                entries = sorted(os.listdir(dir_path))
            except PermissionError:
                return []
            for entry in entries:
                if entry.startswith(".") or entry in ("node_modules", "__pycache__", "dist", "build"):
                    continue
                full_path = os.path.join(dir_path, entry)
                is_dir = os.path.isdir(full_path)
                result.append(
                    {
                        "name": entry,
                        "path": full_path,
                        "is_directory": is_dir,
                        "children": build_tree(full_path, depth + 1) if is_dir and depth < 2 else None,
                    }
                )
            return result

        tree = build_tree(validated_target)
        return {"tree": tree, "path": validated_target}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="building file tree")


@router.get("/content")
async def get_file_content(file_path: str):
    try:
        validated_path = validate_workspace_path(file_path, app_state.working_dir)
    except ValueError:
        return JSONResponse(status_code=403, content=invalid_request_response(
            logger, context="path outside workspace"
        ))
    try:
        with open(validated_path, "r", encoding="utf-8") as f:
            return {"path": validated_path, "content": f.read()}
    except FileNotFoundError:
        return file_not_found_response(logger, context="file content not found")
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="reading file content")


@router.put("/content")
async def write_file_content(body: Dict[str, str]):
    file_path = body.get("path", "")
    content = body.get("content", "")
    try:
        validated_path = validate_workspace_path(file_path, app_state.working_dir)
    except ValueError:
        return JSONResponse(status_code=403, content=invalid_request_response(
            logger, context="path outside workspace"
        ))
    try:
        with open(validated_path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "path": validated_path}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="writing file content")


@router.post("/rename")
async def rename_file(body: Dict[str, str]):
    old_path = body.get("old_path", "")
    new_path = body.get("new_path", "")
    try:
        validated_old = validate_workspace_path(old_path, app_state.working_dir)
        validated_new = validate_workspace_path(new_path, app_state.working_dir)
    except ValueError:
        return JSONResponse(status_code=403, content=invalid_request_response(
            logger, context="path outside workspace"
        ))
    try:
        if not os.path.exists(validated_old):
            return file_not_found_response(logger, context="source file not found")
        os.rename(validated_old, validated_new)
        return {"success": True, "new_path": validated_new}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="renaming file")


@router.delete("/delete")
async def delete_file(body: Dict[str, str]):
    file_path = body.get("path", "")
    try:
        validated_path = validate_workspace_path(file_path, app_state.working_dir)
    except ValueError:
        return JSONResponse(status_code=403, content=invalid_request_response(
            logger, context="path outside workspace"
        ))
    try:
        if not os.path.exists(validated_path):
            return file_not_found_response(logger, context="file not found for deletion")
        if os.path.isfile(validated_path):
            os.remove(validated_path)
        else:
            import shutil
            shutil.rmtree(validated_path)
        return {"success": True}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="deleting file")


@router.post("/duplicate")
async def duplicate_file(body: Dict[str, str]):
    source_path = body.get("source_path", "")
    try:
        validated_source = validate_workspace_path(source_path, app_state.working_dir)
    except ValueError:
        return JSONResponse(status_code=403, content=invalid_request_response(
            logger, context="path outside workspace"
        ))
    try:
        if not validated_source or not os.path.exists(validated_source):
            return file_not_found_response(logger, context="source file not found for duplication")
        # Generate new name: file.txt -> file_copy.txt
        parent = os.path.dirname(validated_source)
        name, ext = os.path.splitext(os.path.basename(validated_source))
        new_name = f"{name}_copy{ext}"
        new_path = os.path.join(parent, new_name)
        # Handle collision: file_copy(1).txt, file_copy(2).txt, etc.
        counter = 1
        while os.path.exists(new_path):
            new_name = f"{name}_copy({counter}){ext}"
            new_path = os.path.join(parent, new_name)
            counter += 1
        import shutil
        shutil.copy2(validated_source, new_path)
        return {"success": True, "new_path": new_path}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="duplicating file")


@router.post("/new")
async def create_new_file(body: Dict[str, Any]):
    path = body.get("path", "")
    is_directory = body.get("is_directory", False)
    content = body.get("content", "")
    try:
        validated_path = validate_workspace_path(path, app_state.working_dir)
    except ValueError:
        return JSONResponse(status_code=403, content=invalid_request_response(
            logger, context="path outside workspace"
        ))
    try:
        if os.path.exists(validated_path):
            return {"success": False, "error": "Already exists"}
        if is_directory:
            os.makedirs(validated_path, exist_ok=True)
            return {"success": True, "path": validated_path}
        parent = os.path.dirname(validated_path)
        if parent and not os.path.exists(parent):
            os.makedirs(parent, exist_ok=True)
        with open(validated_path, "w", encoding="utf-8") as f:
            f.write(content)
        return {"success": True, "path": validated_path}
    except Exception as e:
        return safe_error_response(e, logger_obj=logger, context="creating new file")
