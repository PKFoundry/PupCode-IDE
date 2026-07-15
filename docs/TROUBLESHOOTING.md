# Troubleshooting

## Common Issues

### Application Won't Start

**Symptom:** The Tauri window doesn't open or crashes immediately.

| Check | Command / Action |
|-------|-----------------|
| Rust compiled successfully | `cargo build` — look for compilation errors |
| Frontend bundle exists | `npm run build` — look for Vite errors |
| Node modules installed | `npm install` — reinstall dependencies |

### "Failed to start sidecar" on Welcome Screen

**Symptom:** After selecting a directory, the Welcome Screen shows an error.

| Check | Command / Action |
|-------|-----------------|
| Python 3.13+ on PATH | `python3 --version` — must be 3.13 or higher |
| code-puppy installed | `python3 -c "import code_puppy"` — should succeed silently |
| Sidecar requirements | `pip install -r sidecar-src/requirements.txt` |
| Leftover processes | `pkill -f sidecar_main.py` (Unix) or kill via Task Manager (Windows) |
| Port conflict | A previous sidecar instance may still be holding the port; restart the app |

**Rust-side discovery paths:** The sidecar manager (`src/sidecar.rs`) searches multiple Python locations:
- **macOS:** Homebrew paths (`/opt/homebrew/bin/python3`, `/usr/local/bin/python3`), Xcode Python
- **Windows:** `%LOCALAPPDATA%/Programs/Python/*/python.exe`, `%PROGRAMFILES%/Python*/python.exe`
- **Linux:** `/usr/bin/python3`, `/usr/local/bin/python3`

If your Python is installed in a non-standard location, ensure it's first in your PATH.

### "Cannot connect to sidecar" Error

**Symptom:** The sidecar process starts but the frontend cannot communicate with it.

| Check | Action |
|-------|--------|
| Port allocation | Check Tauri console for the allocated port number |
| Health endpoint | `curl http://localhost:<port>/api/health` — should return OK |
| Firewall | Ensure localhost connections are not blocked |
| CORS mismatch | Sidecar accepts `tauri://localhost`, `http://localhost`, `http://127.0.0.1` |
| Auth token mismatch | The frontend retrieves the token via `get_sidecar_auth_token` IPC command — if this fails, all requests are rejected |

### Sidecar Starts but Chat Doesn't Stream

**Symptom:** Messages are sent but no response appears in the chat panel.

| Check | Action |
|-------|--------|
| WebSocket connection | Open browser devtools → Network → WS tab; verify `/ws/chat` connection is established |
| Model configured | Go to Settings → Models; ensure at least one model is active |
| API key set | Verify the active model's provider API key is configured (managed by code-puppy) |
| code-puppy patches | The sidecar applies `apply_all_patches()` at startup; check logs for import errors |
| Frontend store state | Check `useAppStore` in devtools — `messages` array should populate |

### File Explorer Not Updating

**Symptom:** File changes made outside the app don't appear in the file tree.

| Check | Action |
|-------|--------|
| File watcher started | Check sidecar logs for "File watcher started" message |
| watchdog installed | `pip show watchdog` — required for file monitoring |
| WebSocket connected | File changes are delivered via `/ws/files` — verify WS connection |
| Permission issues | On Unix, ensure the sidecar process has read access to the workspace |
| Reconnect | The file watcher auto-reconnects after 3 seconds on disconnect; try refreshing the tree |

### Voice Input Not Working

**Symptom:** Voice recording starts but no transcription appears.

| Check | Action |
|-------|--------|
| Voice config exists | Check `~/.pupcode_ide/voice.json` |
| API key is set | The key is masked on read — verify it was saved correctly |
| STT service reachable | `curl -v <base_url>` — verify the transcription service responds |
| Model available | Check that the configured STT model name is valid for the service |
| Microphone access | Grant microphone permission to the application in system settings |

### Sessions Disappear or Fail to Load

**Symptom:** Previously saved sessions don't appear in the sidebar or show errors.

| Check | Action |
|-------|--------|
| Autosave directory | Locate code-puppy's `AUTOSAVE_DIR` — verify `.pkl` files exist |
| Database sync | Session manager syncs disk → DB on each `list_sessions` call; try refreshing |
| Corrupt pickle | A session file may have an incompatible schema; check sidecar logs for `UnpicklingError` |
| Migration | New columns are added at startup; verify SQLite schema with `sqlite3 ~/.pupcode_ide/session_db.sqlite ".schema"` |

## Debugging Techniques

### Enable Verbose Logging

In the sidecar, edit `sidecar-src/shared.py`:

```python
logging.basicConfig(
    level=logging.DEBUG,  # Change from logging.INFO
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
```

Or set via environment:

```bash
export PYTHONLOGLEVEL=DEBUG
```

### Inspect Sidecar SQLite Database

```bash
sqlite3 ~/.pupcode_ide/session_db.sqlite

# View all sessions
SELECT session_name, custom_name, message_count, total_tokens FROM sessions;

# View token usage
SELECT * FROM token_usage ORDER BY timestamp DESC LIMIT 10;

# Check schema
.schema
```

### Check Rust Sidecar Logs

Run the Tauri dev server with verbose output:

```bash
RUST_LOG=debug npm run tauri dev
```

### Inspect Frontend Store State

With React DevTools installed:
1. Open devtools → Components tab
2. Navigate to the Zustand store context
3. Expand `useAppStore` to inspect all state properties

Alternatively, use the console:

```javascript
// In browser devtools console
window.__ZUSTAND_DEVTOOLS__?.useAppStore?.getState()
```

Or within the app, add a temporary console log in any component:

```typescript
import useAppStore from './store/useAppStore';
console.log(useAppStore.getState());
```

### Network Inspection

Open browser devtools → Network tab:
- Filter by `Fetch/XHR` to see all HTTP requests to the sidecar
- Filter by `WS` to see WebSocket frames
- Check request headers for `X-Auth-Token` presence
- Check response status codes (401 = auth failure, 403 = path denied, 500 = server error)

## Platform-Specific Issues

### macOS

| Issue | Fix |
|-------|-----|
| Gatekeeper blocks the app | `xattr -dr com.apple.quarantine /Applications/PupCode\ IDE.app` |
| Apple Silicon / Intel mismatch | Ensure the correct Rust target is installed: `rustup target add aarch64-apple-darwin` or `x86_64-apple-darwin` |
| Xcode CLI tools missing | `xcode-select --install` |

### Windows

| Issue | Fix |
|-------|-----|
| MSVC build tools missing | Install Visual Studio Build Tools with C++ workload |
| Python not on PATH | Add Python to PATH or set `PYTHON` environment variable |
| Antivirus blocks sidecar | Add exception for the app directory and `~/.pupcode_ide/` |
| Process tree not killed | Windows Job Objects should handle cleanup; if not, manually kill orphaned Python processes |

### Linux

| Issue | Fix |
|-------|-----|
| Missing GTK/WebKit | Install: `sudo apt install libgtk-3-dev libwebkit2gtk-4.1-dev` |
| Python 3.13 unavailable | Use deadsnakes PPA or compile from source |
| Wayland display issues | Try running with `GDK_BACKEND=x11` as a workaround |
| Missing SSL dev headers | `sudo apt install libssl-dev pkg-config` |
