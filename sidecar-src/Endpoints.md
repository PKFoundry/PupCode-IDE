# Sidecar API Endpoints

Base URL: `http://127.0.0.1:<port>/api/`

---

## Health

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/health` | — | Returns status, working_dir, python_version |

---

## Models

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/models` | — | List all configured models + active model |
| POST | `/api/models/switch` | `{ name: string }` | Switch active model |
| POST | `/api/models/add` | `{ name, type, endpoint?, api_key_env?, description?, context_length?, timeout? }` | Add a new model |
| DELETE | `/api/models/{name}` | path param | Remove a model |
| GET | `/api/models/{name}` | path param | Get full model config |
| PUT | `/api/models/{name}` | `{ type?, endpoint?, api_key_env?, description?, context_length?, timeout?, name?, raw_config? }` | Update a model |

---

## Agents

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/agents` | — | List all agents + active agent |
| POST | `/api/agents/switch` | `{ name: string }` | Switch active agent |
| GET | `/api/agents/{name}` | path param | Get agent details (system_prompt, tools, etc.) |
| POST | `/api/agents/create` | `{ name, description?, system_prompt?, tools? }` | Create a new JSON agent |
| PUT | `/api/agents/{name}` | `{ description?, system_prompt?, tools? }` | Update an existing agent |
| DELETE | `/api/agents/{name}` | path param | Delete a JSON agent |
| GET | `/api/agents-rules` | — | Read global + project AGENTS.md files |

---

## Config

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/config` | — | Get working_dir, active_model, active_agent |
| PUT | `/api/config` | `{ working_dir?, model?, agent? }` | Update config |

---

## Workspace

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/workspace` | — | Get working_dir, exists, is_git_repo |

---

## Files

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/files/tree` | `path?` (query) | Recursive file tree (max depth 2) |
| GET | `/api/files/content` | `file_path` (query) | Read file content |
| PUT | `/api/files/content` | `{ path, content }` | Write file content |
| POST | `/api/files/rename` | `{ old_path, new_path }` | Rename/move a file |
| DELETE | `/api/files/delete` | `{ path }` | Delete file or directory |
| POST | `/api/files/duplicate` | `{ source_path }` | Duplicate a file |
| POST | `/api/files/new` | `{ path, is_directory?, content? }` | Create new file or directory |

---

## WebSockets

### Chat — `ws://127.0.0.1:<port>/ws/chat`

**Client → Server messages:**

| Type | Payload | Description |
|------|---------|-------------|
| `subscribe` | `{ session_id? }` | Subscribe to session events |
| `user_message` | `{ content, session_id?, attachments? }` | Send message to agent |
| `ping` | — | Keep-alive |

**Server → Client messages:**

| Type | Description |
|------|-------------|
| `subscribed` | Confirms subscription with session_id |
| `streaming_text` | Partial text chunks |
| `message_complete` | Final response text |
| `tool_call` | Tool invocation progress |
| `error` | Error message |
| `session_loaded` | Session loaded confirmation |
| `pong` | Ping response |

### Files — `ws://127.0.0.1:<port>/ws/files`

Persistent connection for file change events. Supports `ping`/`pong`.

---

## MCP Servers

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/mcp/servers` | — | List all MCP servers + status |
| POST | `/api/mcp/servers/add` | `{ name, command, args?, env? }` | Add MCP server config |
| POST | `/api/mcp/servers/{name}/start` | path param | Start an MCP server |
| POST | `/api/mcp/servers/{name}/stop` | path param | Stop an MCP server |
| DELETE | `/api/mcp/servers/{name}` | path param | Remove MCP server config |

---

## Commands

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/commands` | — | List available slash commands |
| POST | `/api/commands/execute` | `{ command, args? }` | Execute a slash command |

---

## Sessions

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/sessions/list` | `search?, sort?, order?, page?, limit?` | Paginated session list |
| POST | `/api/sessions/load` | `{ session_name }` | Load session metadata |
| POST | `/api/sessions/{session_name}/load-history` | path param | Load full history, inject into agent |
| PUT | `/api/sessions/{session_name}/rename` | path param + `{ custom_name?, description?, tags? }` | Rename/update session |
| DELETE | `/api/sessions/{session_name}` | path param | Delete session (files + DB) |
| GET | `/api/sessions/{session_name}/preview` | path param + `count?` (query, default 3) | Preview last N messages |

---

## Token Usage

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/usage/summary` | `period?` (today/week/month/all), `model?` | Aggregated usage stats |
| GET | `/api/usage/by_session` | `limit?, offset?` | Per-session usage breakdown |
| GET | `/api/usage/daily` | `days?` (default 30) | Daily aggregates for chart |
| GET | `/api/usage/by_model` | `period?, limit?, offset?` | Per-model aggregates with pagination |
| POST | `/api/usage/clear` | — | Clear all token usage data |

---

## Themes

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/themes/list` | — | List all saved theme files |
| GET | `/api/themes/{filename}` | path param | Get theme by filename |
| POST | `/api/themes/save` | `{ name, colors, author? }` | Save a custom theme |
| DELETE | `/api/themes/{filename}` | path param | Delete a custom theme |

---

## Voice

| Method | Endpoint | Args | Description |
|--------|----------|------|-------------|
| GET | `/api/voice/config` | — | Get voice input config |
| PUT | `/api/voice/config` | `{ enabled?, base_url?, model?, api_key?, language?, chunk_duration_seconds? }` | Save voice config |
| POST | `/api/voice/config/validate` | `{ base_url?, model?, api_key? }` | Validate config without saving |
| POST | `/api/voice/transcribe` | `file` (multipart UploadFile) | Transcribe audio via STT endpoint |
