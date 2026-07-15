# Development Guide

## Local Setup

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/PKFoundry/PupCode-IDE.git
cd PupCode-IDE

# Frontend dependencies
npm install

# Ensure Rust is installed (rustup)
# https://rustup.rs

# Ensure Python 3.13+ is on PATH
python3 --version  # should show 3.13+

# Install code-puppy in your Python environment
pip install code-puppy

# Sidecar dependencies (should be satisfied by code-puppy, but verify)
pip install -r sidecar-src/requirements.txt
```

### 2. Start the Development Server

```bash
npm run tauri dev
```

This runs two processes concurrently:
- **Vite dev server** — Hot-reloads the React frontend
- **Tauri dev window** — Compiles Rust and opens the native window

The development flow:
1. The Tauri window opens showing the Welcome Screen
2. Select a workspace directory
3. The Rust sidecar discovers Python, allocates a port, and spawns the sidecar
4. The frontend connects via HTTP/WebSocket and loads initial data

### 3. Debugging

#### Frontend Debugging

The webview supports standard browser devtools. Enable them via the Tauri config or by pressing `Ctrl+Shift+I` when devtools are available.

The Vite dev server provides hot module replacement for React components. Edit files in `src/renderer/` and changes appear immediately.

#### Rust Debugging

```bash
# Compile and run with debug output
cargo run

# Run only Rust tests
cargo test
```

#### Python Sidecar Debugging

The sidecar logs to stdout/stderr. Add debug logging by modifying the `logging.basicConfig` level in `shared.py`:

```python
logging.basicConfig(level=logging.DEBUG, ...)
```

To attach a debugger to the sidecar process, locate the PID from the Tauri window logs and attach `pdb` or `debugpy`.

For standalone sidecar testing (without the Tauri wrapper), run:

```bash
cd sidecar-src
export SIDECAR_AUTH_TOKEN=test-token
export SIDECAR_PORT=8765
export SIDECAR_WORKING_DIR=/path/to/workspace
python3 -m uvicorn sidecar_main:app --port 8765 --reload
```

## Common Development Workflows

### Adding a New API Endpoint

1. **Define the route** in the appropriate router under `sidecar-src/routers/`:

```python
# sidecar-src/routers/new_feature.py
from fastapi import APIRouter
from auth_middleware import require_auth

router = APIRouter(prefix="/api/new-feature", dependencies=[Depends(require_auth)])

@router.get("")
async def get_feature():
    return {"status": "ok"}
```

2. **Register the router** in `sidecar-src/sidecar_main.py`:

```python
from routers.new_feature import router as new_feature_router
app.include_router(new_feature_router)
```

3. **Add the client method** in `src/renderer/services/sidecar.ts`:

```typescript
async getNewFeature(): Promise<any> {
  const response = await fetch(`${this.baseUrl}/api/new-feature`, {
    headers: { 'X-Auth-Token': this.token },
  });
  return response.json();
}
```

4. **Create or update a Zustand store** to hold the state and provide actions.

### Adding a New React Component

1. Create the component in `src/renderer/components/`.
2. Use TypeScript interfaces for props (avoid `any`).
3. Follow the existing pattern: functional components with hooks.
4. Import Lucide icons from `lucide-react` for iconography.
5. Use Tailwind utility classes for styling (no separate CSS files).
6. Theme-aware colors use CSS custom properties (`bg-bg-primary`, `text-text-primary`, etc.).

### Adding a New Store Slice

The recommended pattern follows the existing decomposition:

1. Create a new standalone store file (e.g., `store/useNewFeatureStore.ts`) using `create<>()` from Zustand.
2. If it needs to be part of the composed `useAppStore`, create a slice creator function:

```typescript
export type NewFeatureSlice = Pick<AppState, 'featureData' | 'loadFeatureData' | ...>;

export const newFeatureSliceCreator = (set, get): NewFeatureSlice => ({
  featureData: null,
  loadFeatureData: async () => {
    // ...
  },
});
```

3. Compose it into `useAppStore.ts`:

```typescript
export const useAppStore = create<AppState>()((...a) =>
  produce(
    combine(
      initialState(),
      newFeatureSliceCreator(...a),
      // ... other slices
    ),
    (draft) => draft,
  ),
);
```

4. Cross-store access should use `useConnectionStore.getState().sidecarPort` for the port, not `get().sidecarPort`.

### Adding a New Model or Agent

Models and agents are managed at runtime through the settings panel. The underlying data structures are:

**Model JSON** (stored in code-puppy config files):
```json
{
  "name": "my-model",
  "type": "openai",
  "endpoint": "https://api.openai.com/v1",
  "api_key_env": "OPENAI_API_KEY",
  "context_length": 128000
}
```

**Agent JSON** (stored in `~/.code_puppy/agents/`):
```json
{
  "name": "my-agent",
  "description": "A specialized coding assistant",
  "system_prompt": "...",
  "tools": ["read_file", "write_file", "run_shell"]
}
```

### Adding a New Theme

Themes are JSON files defining CSS custom property values. They can be:
- Created via the Settings panel (saved to `~/.pupcode_ide/themes/`)
- Imported as JSON
- Exported for sharing

The theme service (`services/themeService.ts`) applies themes by setting CSS variables on `document.documentElement`. Preset themes (Default, Dracula, Nord, Gruvbox, Monokai, GitHub Light) are baked into the service.

## Code Conventions

### Frontend (TypeScript/React)

- **Strict TypeScript**: `tsconfig.json` enforces strict mode. Avoid `any` where possible.
- **Functional components**: All components are function-based with hooks.
- **Named exports**: Prefer named exports over default exports for barrel imports.
- **Tailwind classes**: Use theme-aware color classes (`bg-bg-primary`, `text-text-primary`) instead of hardcoded colors.
- **Lucide icons**: Import from `lucide-react`, not custom SVGs.
- **Error handling**: Wrap async operations in try/catch; log with `console.error` (LOW-2 remediation pending).

### Backend (Python)

- **Type hints**: Use `from __future__ import annotations` and full type annotations.
- **Logging**: Use `logging.getLogger(__name__)`, not print statements.
- **Path safety**: Always validate paths through `validate_workspace_path()` before filesystem operations.
- **Async**: Use `async def` for FastAPI route handlers; use `run_in_executor` for blocking I/O.
- **Pydantic models**: Preferred for request/response validation (HIGH-5 remediation ongoing).

### Rust

- **Result types**: Use `Result<T, Error>` for fallible operations.
- **Error handling**: Propagate with `?` operator; provide meaningful error messages at boundaries.
- **Platform conditionals**: Use `#[cfg(windows)]`, `#[cfg(target_os = "macos")]`, `#[cfg(target_os = "linux")]` for platform-specific code.

## Directory Layout Convention

```
src/renderer/
├── components/     # One component per file (30+ files)
├── store/          # One store per file, slice creators
├── services/       # API clients, theme service, Tauri bridge
├── types/          # TypeScript interfaces shared across modules
├── hooks/          # (If custom hooks grow beyond inline usage)
└── utils/          # (For pure utility functions extracted from stores)
```

```
sidecar-src/
├── sidecar_main.py    # App entry point
├── auth_middleware.py  # Auth dependencies
├── app_lifecycle.py    # AppState, lifespan
├── helpers.py          # Path utilities
├── tool_tracking.py    # Emitter monkey-patching
├── session_manager.py  # Session CRUD + disk sync
├── schema.py           # DB schema, paths
├── message_serialization.py  # Pickle, tool args, display format
├── token_usage.py      # Pricing, cost, analytics mixin
├── file_watcher.py     # File change detection
├── path_utils.py       # Path validation
├── voice_config.py     # Voice STT config
├── shared.py           # Re-export hub (do not add new logic here)
└── routers/            # One router module per domain
```

## Post-Audit Remediation Status

Several architectural improvements were made in response to the security audit:

| Finding | Status | Details |
|---------|--------|---------|
| CRITICAL-1: Shell execution | Resolved | Terminal and shell.py removed entirely |
| CRITICAL-2: WebSocket auth bypass | Fixed | `require_ws_auth` in `auth_middleware.py`; inline auth removed from `websocket.py` |
| HIGH-3: Monolithic store | Partially fixed | Split into `useConnectionStore`, `useThemeStore`, `useModelsStore`; `useAppStore` still large |
| MEDIUM-1: `shared.py` god module | Fixed | Refactored into `helpers.py`, `tool_tracking.py`, `app_lifecycle.py`; `shared.py` is now a re-export hub |
| MEDIUM-3: `session_manager.py` size | Partially fixed | Split out `schema.py`, `message_serialization.py`, `token_usage.py`; coordinator still ~378 lines |
| MEDIUM-5: Duplicate arg extraction | Fixed | `_extract_tool_args()` centralized in `message_serialization.py` |
| INFO-1: Trivial test assertion | Open | `assert_eq!(port1, port1)` still present in `sidecar.rs` |

See the [Security Model](SECURITY.md) and [AuditReport.md](../AuditReport.md) for full details.
