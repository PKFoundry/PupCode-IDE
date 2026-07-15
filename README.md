# PupCode IDE

A native desktop IDE for the [code-puppy](https://github.com/mpfaffenberger/code_puppy) AI coding agent. Combines a lightweight Rust/Tauri shell with a React frontend and a Python/FastAPI sidecar to deliver a full-featured, multi-model AI coding experience on Windows, macOS, and Linux.

![PupCode IDE](screenshots/PupCode%20IDE_1.png)
![PupCode IDE](screenshots/PupCode%20IDE_2.png)

## What It Does

- **AI chat with your codebase** — Conversations with Claude, GPT-4o, Gemini, Ollama, and other models. The agent can read files, edit code, run shell commands, and search across projects using built-in tools.
- **Integrated code editor** — Monaco-powered editor with syntax highlighting, editor tabs, markdown preview, and live file watching.
- **Session management** — Persistent, searchable conversation history with token usage tracking and cost estimation.
- **Multi-model & multi-agent** — Manage multiple LLM providers and switch between custom agents with different system prompts and tool sets.
- **Voice input** — Speech-to-text configuration for hands-free prompting.
- **Customizable themes** — Light/dark presets with custom theme creation and import/export.

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Shell                       │
│              (Rust, ~5 MB binary)                    │
│                                                     │
│  ┌──────────────┐    IPC    ┌──────────────────┐    │
│  │  React UI     │◄────────►│  sidecar.rs       │    │
│  │  (Vite 5)    │  invoke()│  Python mgr       │    │
│  └──────────────┘           │  port discovery   │    │
│        │                    │  process lifetime │    │
│        │ HTTP/WebSocket     └────────┬─────────┘    │
│        ▼                             │               │
│  ┌──────────────┐                    │ spawn         │
│  │  Sidecar API  │                    ▼               │
│  │  (FastAPI)    │          ┌──────────────────┐     │
│  │  · Chat WS    │          │  Python 3.13+    │     │
│  │  · Files REST │          │  code-puppy      │     │
│  │  · Sessions   │          │  pydantic-ai     │     │
│  │  · Config     │          │  LLM providers   │     │
│  └──────────────┘          └──────────────────┘     │
└─────────────────────────────────────────────────────┘
```

Three layers, two processes, one auth token:

| Layer | Tech | Responsibility |
|-------|------|----------------|
| **Desktop shell** | Rust + Tauri v2 | Process management, Python discovery, IPC bridge, native dialogs |
| **Frontend** | React 18 + TypeScript + Vite 5 + Tailwind 3 | UI, state management (Zustand), Monaco editor, WebSocket client |
| **Sidecar API** | Python 3.13+ + FastAPI | AI session orchestration, file operations, shell execution, session persistence |

See **[Architecture](docs/ARCHITECTURE.md)** for module-level detail.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Rust toolchain | 1.75+ | `cargo`, `rustc` |
| Node.js | 18+ | npm included |
| Python | 3.13+ | Must be on PATH |
| code-puppy | latest | Installed in the same Python environment as the sidecar |

Install guides:
- Rust: <https://rustup.rs>
- Node.js: <https://nodejs.org>
- Python: <https://www.python.org/downloads/>
- code-puppy: `pip install code-puppy`

For platform-specific prerequisites (system packages, Xcode, etc.), see **[Build Guide](docs/BUILD.md)**.

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/PKFoundry/PupCode-IDE.git
cd PupCode-IDE

# 2. Install frontend dependencies
npm install

# 3. Ensure code-puppy is installed in your Python 3.13+ environment
pip install code-puppy

# 4. Run the development server (frontend + Tauri dev window)
npm run tauri dev
```

The first launch shows a **Welcome Screen** — select a workspace directory to start the Python sidecar and begin chatting.

## Configuration

| Setting | Where | Details |
|---------|-------|---------|
| Workspace directory | Welcome Screen / Settings | Project root for file operations |
| API keys | code-puppy config (`~/.code_puppy/`) | Managed by code-puppy, not the desktop app |
| Voice STT | `~/.pupcode_ide/voice.json` | Base URL, model, API key (masked on read) |
| Themes | `~/.pupcode_ide/themes/` | Custom theme JSON files |
| Custom agents | `~/.code_puppy/agents/*.json` | Agent definitions with system prompts |
| Session data | `~/.pupcode_ide/session_db.sqlite` | SQLite metadata; pickles in code-puppy AUTOSAVE_DIR |
| Sidecar port | Randomized per session | Allocated by Rust sidecar manager at startup |

Full configuration reference: **[Configuration](docs/ARCHITECTURE.md#configuration-locations)**

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Open command palette |
| `Ctrl+,` | Open settings panel |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+J` | Toggle chat panel |
| `Ctrl+Shift+V` | Toggle markdown preview (on .md files) |
| `Ctrl+M` | Toggle voice recording |

## Repository Structure

```
├── src/                        # Tauri Rust application
│   ├── main.rs                 # Entry point, Tauri plugin init, command handlers
│   └── sidecar.rs              # Python discovery, port allocation, process lifecycle (~695 lines)
├── src-tauri/                  # Tauri configuration
│   ├── tauri.conf.json         # App identity, CSP, bundling config
│   └── ...
├── capabilities/               # Tauri permission manifests
│   └── default.json
├── sidecar-src/                # Python sidecar (FastAPI)
│   ├── sidecar_main.py         # App factory, middleware, router mounting
│   ├── auth_middleware.py      # Token-based auth for HTTP + WebSocket
│   ├── app_lifecycle.py        # AppState singleton, lifespan, emitter forwarding
│   ├── shared.py               # Re-export hub (backward compat)
│   ├── helpers.py              # Path utilities (dirs, model source finder)
│   ├── tool_tracking.py        # Tool call ID injection into emitter events
│   ├── session_manager.py      # Session CRUD, disk sync, pickle handling
│   ├── schema.py               # SQLite schema, pickle whitelist
│   ├── message_serialization.py # Pickle safety, tool arg extraction, display formatting
│   ├── token_usage.py          # Pricing, cost calc, usage analytics mixin
│   ├── file_watcher.py         # watchdog-based file change detection
│   ├── path_utils.py           # Workspace-constrained path validation
│   ├── voice_config.py         # STT config with API key masking
│   └── routers/
│       ├── websocket.py        # /ws/chat — AI streaming, /ws/files — file watching
│       ├── config.py           # /api/config — settings, workspace, MCP, themes, agents-rules
│       ├── files.py            # /api/files — CRUD operations
│       ├── sessions.py         # /api/sessions — session list/load/rename/delete/preview
│       ├── models.py           # /api/models — LLM model CRUD
│       ├── agents.py           # /api/agents — custom agent CRUD
├── src/renderer/               # React frontend
│   ├── App.tsx                 # Root component, layout, keyboard shortcuts
│   ├── components/             # 30+ React components
│   ├── store/                  # Zustand stores (slice pattern)
│   ├── services/               # sidecar.ts (HTTP/WS client), themeService.ts, tauri.ts
│   ├── types/                  # TypeScript interfaces
│   └── ...
├── tests/                      # Python test suite (8 files)
├── Plans/                      # Planning artifacts (gitignored)
└── docs/                       # This documentation
```

## Key Development Docs

| Document | Covers |
|----------|--------|
| [Build Guide](docs/BUILD.md) | Dependencies, dev/prod builds, platform specifics |
| [Architecture](docs/ARCHITECTURE.md) | Module map, data flow, state management, config |
| [Development Guide](docs/DEVELOPMENT.md) | Local setup, workflows, conventions, debugging |
| [Testing Guide](docs/TESTING.md) | Test suite, running tests, coverage, CI |
| [Security Model](docs/SECURITY.md) | Auth, path confinement, pickle safety, known risks |

## License

See `LICENSE` file in the repository root. This project incorporates [code-puppy](https://github.com/mpfaffenberger/code_puppy) under its own licensing terms.
