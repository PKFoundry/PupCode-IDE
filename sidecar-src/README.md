# Python Sidecar — PupCode IDE

Runs as a plain Python script via system Python (no PyInstaller bundling).

## Architecture

Imports `code-puppy` from site-packages and exposes:
- WebSocket endpoint (`/ws/chat`) for streaming conversation
- REST endpoints for models, agents, config, files, MCP servers

## Requirements

- Python 3.13+
- `code-puppy` installed in the same environment
- Dependencies listed in `requirements.txt`

## Files

- `sidecar_main.py` — FastAPI app, entry point
- `file_watcher.py` — Watchdog-based file change detection
- `requirements.txt` — Sidecar-only dependencies (code-puppy is a prerequisite)

## Running (Development)

```bash
cd sidecar-src
pip install -r requirements.txt
pip install code-puppy

# Set environment variables, then run:
set SIDECAR_PORT=8765
set SIDECAR_WORKING_DIR=C:\your\project
py -3.13 -Xutf8 sidecar_main.py
```

## Running (Production)

The Tauri app spawns this automatically:

```
<python> -Xutf8 <resources>/sidecar-src/sidecar_main.py
```

Environment variables are set by the Rust sidecar manager.
