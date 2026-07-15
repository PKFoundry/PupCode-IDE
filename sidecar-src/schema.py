"""Database schema constants, paths, and pickle whitelist for session storage."""

from pathlib import Path

# Default DB location: ~/.pupcode_ide/session_db.sqlite
_DEFAULT_DB_DIR = Path.home() / ".pupcode_ide"
_DEFAULT_DB_PATH = _DEFAULT_DB_DIR / "session_db.sqlite"

# Whitelist of modules/classes allowed during pickle deserialization
_PICKLE_WHITELIST_MODULES = {
    "builtins", "__builtin__",
    "collections", "collections.abc",
    "code_puppy", "code_puppy.messages", "code_puppy.session_manager",
    "pydantic_ai", "pydantic_ai.messages", "pydantic_ai.usage",
    "pydantic_core",
    "datetime", "enum", "typing",
}

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT UNIQUE NOT NULL,
    custom_name TEXT,
    description TEXT,
    tags TEXT,
    timestamp TEXT NOT NULL,
    message_count INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    model_used TEXT,
    file_path TEXT NOT NULL,
    auto_saved BOOLEAN DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    thinking_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0.0,
    agent_name TEXT DEFAULT NULL,
    timestamp TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_name) REFERENCES sessions(session_name)
);

CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_custom_name ON sessions(custom_name);
CREATE INDEX IF NOT EXISTS idx_sessions_tags ON sessions(tags);
CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage(session_name);
"""
