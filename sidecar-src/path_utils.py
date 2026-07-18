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


def validate_path_within_base(
    requested_path: str | Path,
    base_dir: str | Path,
    *,
    require_exists: bool = False,
) -> Path:
    """Validate that a requested path resolves within a base directory.

    Uses ``Path.resolve()`` + ``Path.relative_to()`` as the canonical
    containment check.  Works for both relative and absolute inputs,
    and neutralises symlinks because ``resolve()`` follows them.

    Relative paths are resolved against *base_dir*, not against CWD.

    Args:
        requested_path: The path to validate (may be relative).
        base_dir: The trusted base directory.
        require_exists: If True, raise ValueError when the resolved path
            does not exist on disk.

    Returns:
        A fully resolved ``Path`` guaranteed to reside under *base_dir*.

    Raises:
        ValueError: If the resolved path escapes *base_dir*,
            or if *require_exists* is True and the path is missing.
    """
    base = Path(base_dir).resolve(strict=False)
    # Join relative paths against base_dir; absolute paths override naturally
    candidate = Path(requested_path)
    if not candidate.is_absolute():
        candidate = base / candidate
    target = candidate.resolve(strict=False)

    try:
        target.relative_to(base)
    except ValueError:
        raise ValueError(
            f"Path '{requested_path}' is outside '{base_dir}'. Access denied."
        ) from None

    if require_exists and not target.exists():
        raise ValueError(f"Path does not exist: {requested_path}")

    return target
