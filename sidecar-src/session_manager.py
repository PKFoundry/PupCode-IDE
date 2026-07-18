"""Session management for the Tauri sidecar.

Provides CRUD operations over code-puppy's autosave directory,
backed by a local SQLite database for custom metadata (names, tags, descriptions).
"""

from __future__ import annotations

import json
import re
import logging
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from code_puppy.config import AUTOSAVE_DIR

# Import from split modules
from schema import _DEFAULT_DB_PATH, _SCHEMA_SQL
from message_serialization import (
    RestrictedUnpickler,
    _PICKLE_WHITELIST_MODULES,
    _extract_tool_args,
    _format_tool_preview,
    _serialise_message,
    _summarize_tool_result,
    safe_pickle_dumps,
    safe_pickle_loads,
    serialise_messages_for_display,
)
from token_usage import (
    MODEL_PRICING,
    TokenUsageMixin,
    calculate_cost,
)

logger = logging.getLogger(__name__)
_SESSION_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")

class SessionManager(TokenUsageMixin):
    """Manages session metadata and provides CRUD over code-puppy autosaves."""

    # Model pricing re-exported for backward compat (also inherited from TokenUsageMixin)
    MODEL_PRICING = MODEL_PRICING

    def __init__(
        self,
        autosave_dir: Path | None = None,
        db_path: Path | None = None,
    ) -> None:
        self.autosave_dir = autosave_dir or Path(AUTOSAVE_DIR)
        self.db_path = db_path or _DEFAULT_DB_PATH
        self.db = self._init_db()

    # ------------------------------------------------------------------
    # DB bootstrap
    # ------------------------------------------------------------------

    def _init_db(self) -> sqlite3.Connection:
        """Create the database and schema if they don't exist."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self.db_path), timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(_SCHEMA_SQL)

        # Migrate existing sessions table if new columns missing
        existing_cols = [r[1] for r in conn.execute("PRAGMA table_info(sessions)").fetchall()]
        if "input_tokens" not in existing_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN input_tokens INTEGER DEFAULT 0")
        if "output_tokens" not in existing_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN output_tokens INTEGER DEFAULT 0")
        if "cache_read_tokens" not in existing_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN cache_read_tokens INTEGER DEFAULT 0")
        if "cache_write_tokens" not in existing_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN cache_write_tokens INTEGER DEFAULT 0")
        if "model_used" not in existing_cols:
            conn.execute("ALTER TABLE sessions ADD COLUMN model_used TEXT")

        # Migrate existing token_usage table if new columns missing
        usage_cols = [r[1] for r in conn.execute("PRAGMA table_info(token_usage)").fetchall()]
        if "cache_read_tokens" not in usage_cols:
            conn.execute("ALTER TABLE token_usage ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0")
        if "cache_write_tokens" not in usage_cols:
            conn.execute("ALTER TABLE token_usage ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0")
        if "agent_name" not in usage_cols:
            conn.execute("ALTER TABLE token_usage ADD COLUMN agent_name TEXT DEFAULT NULL")

        conn.commit()
        return conn

    @staticmethod
    def _read_meta(meta_path: Path) -> dict:
        """Read *_meta.json; return {} on any failure."""
        try:
            return json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _safe_session_path(self, session_name: str, suffix: str) -> Path:
        """Build a session file path and ensure it stays within autosave_dir.

        Args:
            session_name: Client-supplied session identifier.
            suffix: File extension including dot, e.g. ".pkl" or "_meta.json".

        Returns:
            A resolved Path guaranteed to reside inside self.autosave_dir.

        Raises:
            ValueError: If session_name is empty, contains null/control chars,
                         or the resolved path escapes autosave_dir.
        """
        if not isinstance(session_name, str):
            raise ValueError("session_name must be a string")
        session_name = session_name.strip()
        if not session_name:
            raise ValueError("session_name is empty")
        if "\x00" in session_name or any(ord(c) < 32 for c in session_name):
            raise ValueError("session_name contains invalid characters")

        if not _SESSION_NAME_RE.fullmatch(session_name):
            raise ValueError(
                "session_name may only contain letters, numbers, dot, underscore, and hyphen"
            )

        base_dir = self.autosave_dir.resolve(strict=False)
        candidate = (self.autosave_dir / f"{session_name}{suffix}").resolve(strict=False)

        try:
            candidate.relative_to(base_dir)
        except ValueError:
            raise ValueError(
                f"session_name '{session_name}' would escape autosave directory"
            ) from None

        return candidate

    def _safe_read_session_file(self, session_name: str, suffix: str) -> bytes:
        """Read a session file after path validation.

        Args:
            session_name: Client-supplied session identifier.
            suffix: File extension including dot, e.g. ".pkl" or "_meta.json".

        Returns:
            File contents as bytes.

        Raises:
            ValueError: If session_name fails validation.
            FileNotFoundError: If the file does not exist.
        """
        file_path = self._safe_session_path(session_name, suffix)
        if not file_path.exists():
            raise FileNotFoundError(f"Session file not found: {file_path}")
        return file_path.read_bytes()

    def _safe_read_session_meta(self, session_name: str) -> dict:
        """Read *{_meta.json} after path validation.

        Args:
            session_name: Client-supplied session identifier.

        Returns:
            Parsed JSON dict ({} on any failure).
        """
        try:
            meta_path = self._safe_session_path(session_name, "_meta.json")
        except ValueError:
            return {}
        return self._read_meta(meta_path)

    # ------------------------------------------------------------------
    # Sync: scan disk → upsert into DB
    # ------------------------------------------------------------------

    def _sync_disk_sessions(self) -> None:
        """Scan AUTOSAVE_DIR for .pkl files and upsert missing rows."""
        if not self.autosave_dir.exists():
            return

        for pkl in self.autosave_dir.glob("*.pkl"):
            session_name = pkl.stem
            meta_path = self.autosave_dir / f"{session_name}_meta.json"
            meta = self._read_meta(meta_path)

            existing = self.db.execute(
                "SELECT session_name FROM sessions WHERE session_name=?",
                (session_name,),
            ).fetchone()

            if existing is None:
                self.db.execute(
                    """INSERT INTO sessions
                       (session_name, timestamp, message_count, total_tokens,
                        file_path, auto_saved)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (
                        session_name,
                        meta.get("timestamp", datetime.now().isoformat()),
                        meta.get("message_count", 0),
                        meta.get("total_tokens", 0),
                        str(pkl),
                        bool(meta.get("auto_saved", False)),
                    ),
                )
            else:
                # Refresh on-disk metadata (message_count, tokens may grow)
                self.db.execute(
                    """UPDATE sessions
                       SET message_count=?, total_tokens=?, timestamp=?,
                           updated_at=CURRENT_TIMESTAMP
                       WHERE session_name=?""",
                    (
                        meta.get("message_count", 0),
                        meta.get("total_tokens", 0),
                        meta.get("timestamp", ""),
                        session_name,
                    ),
                )

        self.db.commit()

    # Pre-defined, safe ORDER BY fragments (no user interpolation)
    _SORT_TEMPLATES = {
        "timestamp": "ORDER BY timestamp",
        "custom_name": "ORDER BY custom_name",
        "message_count": "ORDER BY message_count",
        "total_tokens": "ORDER BY total_tokens",
    }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_sessions(
        self,
        search: str | None = None,
        sort: str = "timestamp",
        order: str = "desc",
        page: int = 1,
        limit: int = 50,
    ) -> dict:
        """Return paginated, searchable session list merged from DB + disk."""
        self._sync_disk_sessions()

        # Build WHERE clause from static fragments only
        where_sql = ""
        params: list[Any] = []

        if search:
            where_sql = " WHERE (custom_name LIKE ? OR description LIKE ? OR tags LIKE ? OR session_name LIKE ?)"
            like = f"%{search}%"
            params = [like, like, like, like]

        # Choose ORDER BY from a whitelist — never interpolate user input
        order_fragment = self._SORT_TEMPLATES.get(sort)
        if order_fragment is None:
            order_fragment = self._SORT_TEMPLATES["timestamp"]
        # Append direction via explicit conditional, not string concatenation
        if order.lower() == "asc":
            order_clause = order_fragment + " ASC"
        else:
            order_clause = order_fragment + " DESC"

        # Count total
        count_sql = f"SELECT COUNT(*) FROM sessions{where_sql}"
        count_row = self.db.execute(count_sql, params).fetchone()
        total = count_row[0] if count_row else 0

        # Paginated query — ORDER BY is from our whitelist
        query_sql = (
            "SELECT session_name, custom_name, description, tags, "
            "timestamp, message_count, total_tokens, file_path, auto_saved "
            f"FROM sessions{where_sql} "
            f"{order_clause} "
            "LIMIT ? OFFSET ?"
        )
        rows = self.db.execute(query_sql, params + [limit, (page - 1) * limit]).fetchall()

        sessions: list[dict] = []
        for row in rows:
            d = {
                "session_name": row[0],
                "custom_name": row[1],
                "description": row[2],
                "tags": [t.strip() for t in (row[3] or "").split(",") if t.strip()],
                "timestamp": row[4],
                "message_count": row[5],
                "total_tokens": row[6],
                "file_path": row[7],
                "auto_saved": bool(row[8]),
            }
            sessions.append(d)

        return {
            "sessions": sessions,
            "total": total,
            "page": page,
            "limit": limit,
        }

    def load_session(self, session_name: str) -> dict:
        """Load a session's pickle history and metadata.

        Returns a dict with keys: history, message_count, total_tokens,
        custom_name, description, tags.
        """
        try:
            # _safe_read_session_file validates path containment
            raw = self._safe_read_session_file(session_name, ".pkl")
        except ValueError:
            raise ValueError("Invalid session name") from None

        # Load session history using restricted unpickler
        history = safe_pickle_loads(raw)

        # Metadata from DB
        row = self.db.execute(
            "SELECT custom_name, description, tags FROM sessions WHERE session_name=?",
            (session_name,),
        ).fetchone()

        custom_name = row[0] if row else None
        description = row[1] if row else None
        tags_raw = row[2] if row else None
        tags = [t.strip() for t in (tags_raw or "").split(",") if t.strip()] if tags_raw else []

        # On-disk meta via safe helper
        meta = self._safe_read_session_meta(session_name)

        return {
            "history": history,
            "message_count": meta.get("message_count", len(history) if isinstance(history, list) else 0),
            "total_tokens": meta.get("total_tokens", 0),
            "custom_name": custom_name,
            "description": description,
            "tags": tags,
        }

    def rename_session(
        self,
        session_name: str,
        custom_name: str,
        description: str | None = None,
        tags: str | None = None,
    ) -> dict:
        """Update custom metadata for a session."""
        row = self.db.execute(
            "SELECT session_name FROM sessions WHERE session_name=?",
            (session_name,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Session not found in database: {session_name}")

        self.db.execute(
            """UPDATE sessions
               SET custom_name=?, description=?, tags=?, updated_at=CURRENT_TIMESTAMP
               WHERE session_name=?""",
            (custom_name, description, tags, session_name),
        )
        self.db.commit()

        return {
            "success": True,
            "session_name": session_name,
            "custom_name": custom_name,
        }

    def delete_session(self, session_name: str) -> dict:
        """Delete session files (.pkl + _meta.json) and DB entry."""
        try:
            pkl_path = self._safe_session_path(session_name, ".pkl")
        except ValueError:
            raise ValueError("Invalid session name") from None

        try:
            meta_path = self._safe_session_path(session_name, "_meta.json")
        except ValueError:
            raise ValueError("Invalid session name") from None

        deleted_files = []
        for p in (pkl_path, meta_path):
            if p.exists():
                p.unlink()
                deleted_files.append(str(p))

        self.db.execute(
            "DELETE FROM sessions WHERE session_name=?", (session_name,)
        )
        self.db.commit()

        return {
            "success": True,
            "session_name": session_name,
            "deleted_files": deleted_files,
        }

    def get_preview(self, session_name: str, count: int = 3) -> dict:
        """Load pickle, extract last N messages, return as preview."""
        try:
            # _safe_read_session_file validates path containment
            raw = self._safe_read_session_file(session_name, ".pkl")
        except ValueError:
            return {"success": False, "error": "Invalid session name"}
        except FileNotFoundError:
            return {"success": False, "error": "Session file not found"}

        # Load history with restricted unpickler
        try:
            history = safe_pickle_loads(raw)
        except Exception:
            return {"success": False, "error": "Failed to load session data"}

        # Get DB metadata
        row = self.db.execute(
            "SELECT custom_name, message_count, total_tokens FROM sessions WHERE session_name=?",
            (session_name,),
        ).fetchone()
        custom_name = row[0] if row else None
        message_count = row[1] if row else len(history)

        # Build tool_call_id → args lookup from ALL messages (MEDIUM-5: use shared helper)
        tool_calls_map: dict = {}
        if isinstance(history, list):
            for msg in history:
                for part in getattr(msg, "parts", []):
                    if type(part).__name__ == "ToolCallPart":
                        tcid = getattr(part, "tool_call_id", None)
                        if tcid:
                            tool_calls_map[tcid] = _extract_tool_args(part)

        # Serialise last N messages
        preview_msgs = [
            _serialise_message(msg, tool_calls_map)
            for msg in (history[-count:] if isinstance(history, list) else [])
        ]

        return {
            "session_name": session_name,
            "custom_name": custom_name,
            "preview_messages": preview_msgs,
            "message_count": message_count,
        }

    # Re-export display serialization methods for backward compat (called as instance methods)
    def serialise_messages_for_display(self, history: list) -> list:
        """Delegated to message_serialization.serialise_messages_for_display."""
        return serialise_messages_for_display(history)


# =============================================================================
# Backward-compatibility re-exports
# =============================================================================

# Schema module re-exports
__all__ = [
    "SessionManager",
    "RestrictedUnpickler",
    "_PICKLE_WHITELIST_MODULES",
    "safe_pickle_loads",
    "safe_pickle_dumps",
    "MODEL_PRICING",
    "calculate_cost",
    "_format_tool_preview",
    "_summarize_tool_result",
    "serialise_messages_for_display",
    "_serialise_message",
    "_extract_tool_args",
]
