"""
File watcher for PupCode IDE sidecar.

Watches the working directory for file changes and emits events
to the frontend via the emitter system.
"""

import logging
import os
import threading
import time
from pathlib import Path
from typing import Optional, Set, Dict

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

logger = logging.getLogger("sidecar.file_watcher")


# Files/dirs to ignore
IGNORED_DIRS = {".git", "node_modules", "__pycache__", ".vscode", ".idea", "dist", "build"}
IGNORED_EXTS = {".pyc", ".pyo", ".pyd", ".so", ".dll", ".dylib", ".o", ".class"}


class FileChangeHandler(FileSystemEventHandler):
    """Handles file system events and emits them to the frontend."""

    def __init__(self, ignored_dirs: Optional[Set[str]] = None):
        super().__init__()
        self.ignored_dirs = ignored_dirs or IGNORED_DIRS
        self._last_event: Dict[str, float] = {}
        self._debounce_seconds = 1.0  # Wait 1 second before re-emitting for same file
        self._lock = threading.Lock()

    def _should_ignore(self, path: str) -> bool:
        """Check if a path should be ignored."""
        p = Path(path)

        # Check if any parent dir is ignored
        for part in p.parts:
            if part in self.ignored_dirs:
                return True

        # Check extension
        if p.suffix and p.suffix in IGNORED_EXTS:
            return True

        # Check hidden files (but not hidden dirs like .gitignore)
        if p.name.startswith(".") and not p.is_dir():
            return True

        return False

    def _emit_event(self, event_type: str, path: str):
        """Emit a file change event with rate limiting."""
        from code_puppy.plugins.frontend_emitter.emitter import emit_event

        # Rate limit: only emit if enough time has passed since last event for this file
        now = time.time()
        with self._lock:
            last_time = self._last_event.get(path, 0)
            if now - last_time < self._debounce_seconds:
                return
            self._last_event[path] = now
            # Clean up old entries (older than 60 seconds)
            self._last_event = {
                k: v for k, v in self._last_event.items() if now - v < 60
            }

        emit_event("file_changed", {
            "event_type": event_type,  # 'modified', 'created', 'deleted', 'moved'
            "path": path,
        })

    def on_modified(self, event):
        if event.is_directory or self._should_ignore(event.src_path):
            return
        logger.debug(f"File modified: {event.src_path}")
        self._emit_event("modified", event.src_path)

    def on_created(self, event):
        if event.is_directory or self._should_ignore(event.src_path):
            return
        logger.debug(f"File created: {event.src_path}")
        self._emit_event("created", event.src_path)

    def on_deleted(self, event):
        if event.is_directory or self._should_ignore(event.src_path):
            return
        logger.debug(f"File deleted: {event.src_path}")
        self._emit_event("deleted", event.src_path)

    def on_moved(self, event):
        if event.is_directory or self._should_ignore(event.src_path):
            return
        logger.debug(f"File moved: {event.src_path} -> {event.dest_path}")
        self._emit_event("moved", event.src_path)


class FileWatcher:
    """File watcher that monitors a directory for changes."""

    def __init__(
        self,
        watch_dir: str,
        ignored_dirs: Optional[Set[str]] = None,
    ):
        self.watch_dir = watch_dir
        self.ignored_dirs = ignored_dirs or IGNORED_DIRS
        self._observer: Optional[Observer] = None
        self._handler = FileChangeHandler(ignored_dirs=self.ignored_dirs)

    def start(self):
        """Start watching the directory."""
        if not os.path.isdir(self.watch_dir):
            logger.error(f"Watch directory does not exist: {self.watch_dir}")
            return

        self._observer = Observer()
        self._observer.schedule(
            self._handler, self.watch_dir, recursive=True
        )
        self._observer.start()
        logger.info(f"File watcher started for: {self.watch_dir}")

    def stop(self):
        """Stop watching the directory."""
        if self._observer:
            self._observer.stop()
            self._observer.join()
            logger.info("File watcher stopped")


# Legacy compatibility: main.py imports `from file_watcher import file_watcher`
# and calls file_watcher.start(dir) / file_watcher.stop()
class _LegacyFileWatcher:
    """Legacy compatibility wrapper for main.py."""
    def __init__(self):
        self._watcher: Optional[FileWatcher] = None

    def start(self, watch_dir: str) -> bool:
        # Stop existing watcher first
        if self._watcher:
            self._watcher.stop()
        try:
            self._watcher = FileWatcher(watch_dir=watch_dir, ignored_dirs=IGNORED_DIRS)
            self._watcher.start()
            return True
        except Exception as e:
            logger.error(f"Failed to start file watcher: {e}")
            return False

    def stop(self):
        if self._watcher:
            self._watcher.stop()
            self._watcher = None


file_watcher = _LegacyFileWatcher()
