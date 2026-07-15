# Architecture

## System Context

PupCode IDE is a three-layer desktop application that provides a graphical interface for the `code-puppy` AI coding agent. The application runs locally on the user's machine, communicates with LLM providers over the internet, and performs file operations confined to a user-selected workspace.

```
User
  │
  ▼
┌─────────────────────────────────────────────────┐
│               Desktop Application                │
│                                                  │
│  ┌───────────┐  IPC  ┌──────────┐               │
│  │ React UI   │◄─────►│ Rust     │               │
│  │ (Webview)  │       │ (Tauri)  │               │
│  └─────┬─────┘       └────┬─────┘               │
│        │ HTTP/WS           │                     │
│        ▼                   ▼                     │
│  ┌─────────────────────────────────┐            │
│  │     Python Sidecar (FastAPI)    │            │
│  │     · AI Chat · File Ops        │            │
│  └───────────────┬─────────────────┘            │
└───────────────────┼─────────────────────────────┘
                    │
         ┌──────────┼──────────┐
         ▼          ▼
     LLM API    Filesystem
     (Internet)  (Local)
```

## Layer 1: Rust Tauri Shell

**Location:** `src/`

The Rust shell is the application entry point and process orchestrator. It is compiled to a small native binary (~5 MB) and provides:

- **`main.rs`** — Tauri plugin initialization, command registration, and IPC handlers. Defines commands:
  - `start_sidecar` — Spawn the Python sidecar process, allocate a port, set environment
  - `stop_sidecar` — Terminate the sidecar process
  - `get_sidecar_port` — Return the currently allocated port
  - `get_sidecar_auth_token` — Return the generated auth token
  - `open` (dialog plugin) — Native directory selection dialog

- **`sidecar.rs`** (~695 lines) — Python environment discovery, port allocation, and process lifecycle:
  - Discovers Python 3.13+ on the system (checks PATH, common install locations)
  - Verifies that `code-puppy` is installed in the discovered Python
  - Allocates a free TCP port via brief socket bind
  - Spawns the Python sidecar as a child process with `SIDECAR_AUTH_TOKEN`, `SIDECAR_PORT`, and `SIDECAR_WORKING_DIR` environment variables
  - Monitors process exit and cleans up on shutdown
  - Platform-specific handling: Windows Job Objects for process tree cleanup

### Tauri Configuration

| File | Purpose |
|------|---------|
| `tauri.conf.json` | App identity (name, version), CSP policy, devtools setting, bundling configuration |
| `capabilities/default.json` | Permission manifest — filesystem access, shell open, process restart/exit |

The CSP in `index.html` restricts script sources to `'self'`, `https://cdn.jsdelivr.net`, and `blob:` (for React dynamic imports). Connections are allowed to `http://localhost:*` and `ws://localhost:*` for sidecar communication.

## Layer 2: React Frontend

**Location:** `src/renderer/`

The frontend is a TypeScript/React 18 application built with Vite 5, styled with Tailwind CSS 3. It runs in a Tauri webview.

### Store Architecture (Zustand)

State is managed via Zustand using a **slice creator pattern**. Stores are composed for modularity while maintaining cross-cutting access:

| Store | Responsibility |
|-------|---------------|
| `useAppStore` | Root composed store — aggregating slices for chat, sessions, UI layout, settings |
| `useConnectionStore` | Connection state: `workingDir`, `sidecarPort`, `sidecarConnected`, `authToken` |
| `useThemeStore` | Theme management: active theme, custom themes, import/export |
| `useModelsStore` | LLM model CRUD: list, active model, add/update/delete |

Slice creators within `useAppStore` include:

| Slice | File | Responsibility |
|-------|------|---------------|
| Chat | `useAppStore.ts` | Messages, streaming tokens, WebSocket lifecycle, tool call rendering |
| File System | `useFileSystemStore.ts` | File tree, editor tabs, dirty state, file watch WebSocket |
| Settings | `useSettingsStore.ts` | Agents, MCP servers, slash commands, voice config, workspace change |

Stores access `sidecarPort` through `useConnectionStore.getState().sidecarPort` rather than through the composed `useAppStore`, avoiding circular dependencies.

### Services

| Service | File | Purpose |
|---------|------|---------|
| Sidecar client | `services/sidecar.ts` | HTTP client for all REST endpoints; WebSocket URL builders for `/ws/chat` and `/ws/files` |
| Theme service | `services/themeService.ts` | Theme load/save/apply with CSS variable manipulation; custom theme disk I/O |
| Tauri bridge | `services/tauri.ts` | Thin wrapper around `@tauri-apps/api` invoke functions |

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `App.tsx` | Root | Layout composition, keyboard shortcut registration, theme init, data loading on sidecar connect |
| `WelcomeScreen.tsx` | Onboarding | Directory selection, sidecar startup flow |
| `ChatPanel.tsx` (~463L) | Chat UI | Message list, streaming rendering, tool call previews, input box |
| `FileExplorer.tsx` (~434L) | File tree | Tree navigation, context menus, inline rename, drag-drop support |
| `EditorArea.tsx` | Center pane | Monaco editor tabs, file content, save/dirty state |
| `Sidebar.tsx` | Left | Session list, navigation |
| `SettingsPanel.tsx` | Modal | Model, agent, theme, MCP, voice settings |
| `CommandPalette.tsx` | Overlay | Quick action search |
| `ResizeHandle.tsx` | Layout | Draggable panel resizing for sidebar and chat |

### Keyboard Shortcuts

Registered in `App.tsx` via `window.addEventListener('keydown', ...)`:

| Shortcut | Handler |
|----------|---------|
| `Ctrl+Shift+P` | Show command palette |
| `Ctrl+,` | Show settings |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+J` | Toggle chat panel |
| `Ctrl+Shift+V` | Toggle markdown preview (`.md` files only) |
| `Ctrl+M` | Toggle voice recording |

## Layer 3: Python Sidecar

**Location:** `sidecar-src/`

The sidecar is a FastAPI application that handles all business logic. It is spawned as a child process by the Rust shell with a randomized port and auth token.

### Module Map

| Module | Lines | Responsibility |
|--------|-------|---------------|
| `sidecar_main.py` | ~141 | FastAPI app factory, middleware registration, router mounting, CORS setup |
| `auth_middleware.py` | ~78 | Token-based auth for HTTP (`require_auth`) and WebSocket (`require_ws_auth`) |
| `app_lifecycle.py` | ~186 | `AppState` singleton, lifespan manager, emitter event forwarding to connected WebSockets |
| `shared.py` | ~77 | Re-export hub: imports and re-exports from decomposed modules; backward compatibility |
| `helpers.py` | ~60 | Path utilities: `_pupcode_ide_dir()`, `_agent_dir()`, `_themes_dir()`, `_find_model_source()` |
| `tool_tracking.py` | ~87 | Monkey-patches `code_puppy` emitter to inject `tool_call_id` into tool call events |
| `session_manager.py` | ~378 | Session CRUD, disk sync (pickle ↔ DB), preview generation |
| `schema.py` | ~59 | SQLite schema SQL, DB path, pickle whitelist modules |
| `message_serialization.py` | ~346 | `RestrictedUnpickler`, `_extract_tool_args()`, `_format_tool_preview()`, `serialise_messages_for_display()` |
| `token_usage.py` | ~295 | `MODEL_PRICING`, `calculate_cost()`, `TokenUsageMixin` (DB tracking, summaries, analytics) |
| `file_watcher.py` | ~160 | `watchdog`-based file change detection, debounced event emission |
| `path_utils.py` | ~42 | `validate_workspace_path()` — prevents directory traversal outside workspace |
| `voice_config.py` | ~96 | Voice STT config read/write with API key masking |

### Routers

| Router | Prefix | Endpoints |
|--------|--------|-----------|
| `websocket.py` | `/ws/chat`, `/ws/files` | AI chat streaming (auth-gated), file change broadcast |
| `config.py` | `/api/config` | Global settings, workspace, voice, themes, MCP servers, slash commands, agents-rules |
| `files.py` | `/api/files` | File tree, content read/write, rename, delete, duplicate, create |
| `sessions.py` | `/api/sessions` | Session list (paginated/searchable), load, rename, delete, preview |
| `models.py` | `/api/models` | LLM model CRUD (add, update, delete, switch, get source) |
| `agents.py` | `/api/agents` | Custom agent CRUD (create, update, delete, switch) |

### Data Flow: AI Chat

1. **Frontend** sends a message via `POST /api/chat/send` (or WebSocket)
2. **Sidecar** authenticates the request, invokes `code_puppy` agent with the message
3. **code-puppy** streams responses through its `frontend_emitter` plugin
4. **Tool tracking** intercepts emitter events, injecting `tool_call_id` for tool call correlation
5. **app_lifecycle** normalizes events (token, thinking_token, tool_call_start/complete, file_changed)
6. **WebSocket** forwards normalized events to the connected frontend session
7. **Frontend** renders streaming tokens, tool call previews, and file change updates

### Data Flow: File Operations

1. **Frontend** calls `/api/files/*` endpoints via HTTP
2. **path_utils** validates all paths are within the workspace root
3. Operations execute on the local filesystem
4. **file_watcher** detects external changes via `watchdog`
5. Changes are emitted through `/ws/files` to all connected file watch clients
6. **Frontend** refreshes file tree and updates open tabs accordingly

### Persistence

| Data | Storage | Location |
|------|---------|----------|
| Session metadata (name, tags, tokens) | SQLite WAL | `~/.pupcode_ide/session_db.sqlite` |
| Token usage records (per message) | SQLite | Same DB, `token_usage` table |
| Session message history | Python pickle | code-puppy's `AUTOSAVE_DIR/*.pkl` |
| Session metadata (message count, timestamp) | JSON | `*_meta.json` alongside `.pkl` files |
| Voice STT config | JSON | `~/.pupcode_ide/voice.json` |
| Custom themes | JSON | `~/.pupcode_ide/themes/*.json` |
| Custom agents | JSON | `~/.code_puppy/agents/*.json` |
| Model configurations | JSON | `~/.code_puppy/extra_models.json` and provider-specific files |

### Database Schema

Two tables in `session_db.sqlite`:

- **`sessions`** — `session_name` (PK), `custom_name`, `description`, `tags`, timestamps, token counters, `model_used`, `file_path`, `auto_saved`
- **`token_usage`** — `session_name` (FK→sessions), `model`, `input_tokens`, `output_tokens`, `thinking_tokens`, `cache_read_tokens`, `cache_write_tokens`, `cost_usd`, `timestamp`

Indexed on timestamp and session_name for efficient queries. Migrations add new columns at startup if missing.

## Configuration Locations

| Path | Contents |
|------|----------|
| `~/.code_puppy/` | code-puppy config: model files, agent JSONs, global settings |
| `~/.code_puppy/agents/` | Custom agent definitions |
| `~/.pupcode_ide/` | Desktop-specific data |
| `~/.pupcode_ide/session_db.sqlite` | Session metadata database |
| `~/.pupcode_ide/voice.json` | Voice STT configuration |
| `~/.pupcode_ide/themes/` | Custom theme files |

## Module Dependency Direction

```
sidecar_main.py
  └── auth_middleware.py
  └── routers/*
        ├── websocket.py
        │     └── app_lifecycle.py (AppState._active_sessions)
        │     └── shared.py → code_puppy imports
        ├── config.py
        │     └── helpers.py (path dirs)
        │     └── voice_config.py
        │     └── token_usage.py (via SessionManager)
        ├── files.py
        │     └── path_utils.py
        ├── sessions.py
        │     └── session_manager.py
        │           ├── schema.py
        │           ├── message_serialization.py
        │           └── token_usage.py (TokenUsageMixin)
        ├── models.py
        │     └── helpers.py (_find_model_source)
        ├── agents.py
        │     └── helpers.py (_agent_dir)

shared.py → re-exports from: helpers.py, tool_tracking.py, app_lifecycle.py
app_lifecycle.py
  └── tool_tracking.py
  └── file_watcher.py (optional, watchdog)
  └── code_puppy (emitter subscribe/unsubscribe)
```

## Authentication Model

All sidecar endpoints require authentication via the `SIDECAR_AUTH_TOKEN` environment variable:

- **HTTP requests**: Token sent in `X-Auth-Token` header, validated by `require_auth` dependency
- **WebSocket connections**: Token passed as `auth_token` query parameter, validated by `require_ws_auth` dependency
- **Health check**: `/api/health` is exempt from authentication (used by the Rust health check)
- **Token comparison**: Uses `hmac.compare_digest` for constant-time comparison, preventing timing attacks
- **Empty token policy**: When no token is configured, all authenticated requests are denied (only health check works)

The token is generated by the Rust sidecar at process spawn time and injected as an environment variable. The Rust shell retrieves it via the `get_sidecar_auth_token` IPC command.
