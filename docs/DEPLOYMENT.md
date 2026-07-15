# Deployment Guide

## Distribution Formats

PupCode IDE produces platform-native installers through Tauri's bundling system. Run:

```bash
npm run tauri build
```

Output location: `src-tauri/target/release/bundle/`

| Platform | Format | File Pattern |
|----------|--------|-------------|
| macOS | DMG | `*.dmg` |
| macOS | App bundle | `*.app` |
| Windows | NSIS installer | `*.exe` |
| Windows | MSI | `*.msi` |
| Linux | AppImage | `*.AppImage` |
| Linux | Debian package | `*.deb` |
| Linux | RPM | `*.rpm` |

## First Launch Behavior

When the user launches PupCode IDE for the first time:

1. The **Welcome Screen** prompts for a workspace directory selection.
2. After directory selection, the Rust sidecar manager:
   - Searches the system for Python 3.13+ (PATH, known install locations)
   - Verifies `code-puppy` is installed in the discovered Python environment
   - Allocates a free TCP port
   - Generates a random auth token
   - Spawns the Python sidecar process with environment variables:
     - `SIDECAR_AUTH_TOKEN=<random-token>`
     - `SIDECAR_PORT=<allocated-port>`
     - `SIDECAR_WORKING_DIR=<selected-directory>`
3. The frontend connects to the sidecar via HTTP and verifies the connection with a health check.
4. The sidecar initializes: applies code-puppy patches, starts the file watcher, subscribes to emitter events.
5. The main application UI loads.

## Runtime Data Locations

| Data | Path | Created When |
|------|------|-------------|
| Session database | `~/.pupcode_ide/session_db.sqlite` | First sidecar initialization |
| Session autosaves | code-puppy's `AUTOSAVE_DIR` | After first chat message |
| Voice config | `~/.pupcode_ide/voice.json` | After saving voice settings |
| Custom themes | `~/.pupcode_ide/themes/` | After creating a custom theme |
| Custom agents | `~/.code_puppy/agents/*.json` | After creating a custom agent |
| Model configs | `~/.code_puppy/extra_models.json` | After adding a custom model |

## Service Lifecycle

### Normal Shutdown

1. User closes the Tauri window
2. Rust sidecar manager sends termination signal to the Python process
3. Python `lifespan` shutdown handler:
   - Stops the file watcher
   - Cancels the emitter forwarding task
   - Unsubscribes from the code-puppy emitter
   - Logs shutdown
4. Rust waits for process exit and cleans up

### Abnormal Termination

If the sidecar process exits unexpectedly:

- The Rust sidecar manager detects the exit and sets the port to null
- The frontend detects the disconnection (WebSocket `onclose`) and shows a disconnect indicator
- The file watcher reconnection logic attempts to reconnect after 3 seconds
- If the sidecar cannot be reached, the user sees connection errors in the chat panel

### Process Cleanup

Platform-specific process tree handling:

- **Windows**: Job Objects ensure child processes are terminated with the parent
- **macOS/Linux**: Standard process signals; child processes inherit the parent's process group

## Python Discovery

The Rust sidecar manager discovers Python through a prioritized search:

1. **`which python3`** / **`where python`** — PATH lookup
2. **Common install locations**:
   - macOS: `/Library/Frameworks/Python.framework/Versions/<version>/bin/python3`, homebrew paths
   - Windows: `%LOCALAPPDATA%/Programs/Python/`, `%PROGRAMFILES%/Python/`
   - Linux: `/usr/bin/python3`, `/usr/local/bin/python3`
3. **Version verification** — Checks the discovered Python reports 3.13+
4. **code-puppy verification** — Runs `python3 -c "import code_puppy"` to confirm availability

If no suitable Python environment is found, the sidecar fails to start and the user sees an error on the Welcome Screen.

## Upgrading

To upgrade to a newer version:

1. Install the new platform installer (overwrites the previous installation)
2. Existing data (`~/.pupcode_ide/`, `~/.code_puppy/`) is preserved
3. The SQLite schema auto-migrates at startup if new columns are added
4. Session pickle files maintain backward compatibility through the `RestrictedUnpickler`

## Troubleshooting

### Sidecar Won't Start

- Verify Python 3.13+ is on PATH: `python3 --version`
- Verify code-puppy is installed: `pip show code-puppy`
- Check for leftover processes: `pkill -f sidecar_main.py` (Unix) or Task Manager (Windows)
- Inspect Tauri window console output for error messages

### "Cannot connect to sidecar"

- The allocated port may have expired or conflicted
- Restart the application to get a fresh port allocation
- Check firewall settings are not blocking localhost connections

### Sessions Not Appearing

- Verify the autosave directory exists and contains `.pkl` files
- The session manager syncs disk files to the database on each `list_sessions` call
- Corrupt pickle files may fail to load — check the sidecar logs

### Voice Input Not Working

- Verify voice config at `~/.pupcode_ide/voice.json`
- Check that the STT service URL is reachable
- Ensure the API key is valid (shown masked as `****XXXX` in settings)
