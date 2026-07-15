"""Path validation utilities for workspace confinement.

Prevents path traversal attacks by ensuring all file operations
stay within the designated workspace root directory.
"""

from pathlib import Path
from typing import Optional


def validate_workspace_path(
    requested_path: str, workspace_root: Optional[str]
) -> str:
    """Validate that a requested path is within the workspace root.

    Args:
        requested_path: The file/directory path to validate.
        workspace_root: The workspace root directory (app_state.working_dir).

    Returns:
        The resolved absolute path string.

    Raises:
        ValueError: If the path escapes the workspace root.
    """
    if not workspace_root:
        raise ValueError("No workspace root configured")
    if not requested_path:
        raise ValueError("No path provided")

    workspace = Path(workspace_root).resolve()
    # Join relative paths against workspace root; absolute paths override naturally
    target = (Path(workspace_root) / requested_path).resolve()

    try:
        target.relative_to(workspace)
    except ValueError:
        raise ValueError(
            f"Path '{requested_path}' is outside workspace '{workspace}'. Access denied."
        )

    return str(target)
