/**
 * Sidecar API Client
 *
 * Communicates with the Python sidecar over HTTP/REST.
 * Provides typed methods for all API endpoints.
 * Singleton pattern — use getInstance(port, authToken) to get the shared instance.
 */

// =============================================================================
// Types
// =============================================================================

interface SidecarConfig {
  port: number;
  authToken?: string;
}

// =============================================================================
// Client Class
// =============================================================================

class SidecarClient {
  private port: number;
  private baseUrl: string;
  private authToken?: string;

  constructor(config: SidecarConfig) {
    this.port = config.port;
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    this.authToken = config.authToken;
  }

  setAuthToken(token: string | undefined) {
    this.authToken = token;
  }

  // =====================================================================
  // Health
  // =====================================================================

  async health(): Promise<{ status: string; working_dir: string | null; python_version: string }> {
    return this.get('/api/health');
  }

  // =====================================================================
  // Models
  // =====================================================================

  async getModels(): Promise<any> {
    return this.get('/api/models');
  }

  async switchModel(name: string): Promise<any> {
    return this.post('/api/models/switch', { name });
  }

  async addModel(data: Record<string, any>): Promise<any> {
    return this.post('/api/models/add', data);
  }

  async deleteModel(name: string): Promise<any> {
    return this.del(`/api/models/${encodeURIComponent(name)}`);
  }

  async getModel(name: string): Promise<any> {
    return this.get(`/api/models/${encodeURIComponent(name)}`);
  }

  async updateModel(name: string, data: Record<string, any>): Promise<any> {
    return this.put(`/api/models/${encodeURIComponent(name)}`, data);
  }

  // =====================================================================
  // Agents
  // =====================================================================

  async getAgents(): Promise<any> {
    return this.get('/api/agents');
  }

  async switchAgent(name: string): Promise<any> {
    return this.post('/api/agents/switch', { name });
  }

  async getAgent(name: string): Promise<any> {
    return this.get(`/api/agents/${encodeURIComponent(name)}`);
  }

  async createAgent(data: Record<string, any>): Promise<any> {
    return this.post('/api/agents/create', data);
  }

  async updateAgent(name: string, data: Record<string, any>): Promise<any> {
    return this.put(`/api/agents/${encodeURIComponent(name)}`, data);
  }

  async deleteAgent(name: string): Promise<any> {
    return this.del(`/api/agents/${encodeURIComponent(name)}`);
  }

  // =====================================================================
  // Config
  // =====================================================================

  async getConfig(): Promise<any> {
    return this.get('/api/config');
  }

  async updateConfig(config: Record<string, any>): Promise<any> {
    return this.put('/api/config', config);
  }

  async getWorkspace(): Promise<any> {
    return this.get('/api/workspace');
  }

  // =====================================================================
  // Files
  // =====================================================================

  async getFileTree(path?: string): Promise<any> {
    const url = path ? `/api/files/tree?path=${encodeURIComponent(path)}` : '/api/files/tree';
    return this.get(url);
  }

  async getFileContent(filePath: string): Promise<any> {
    return this.get(`/api/files/content?file_path=${encodeURIComponent(filePath)}`);
  }

  async writeFileContent(path: string, content: string): Promise<any> {
    return this.put('/api/files/content', { path, content });
  }

  async renameFile(oldPath: string, newPath: string): Promise<any> {
    return this.post('/api/files/rename', { old_path: oldPath, new_path: newPath });
  }

  async deleteFile(path: string): Promise<any> {
    return this.post('/api/files/delete', { path });
  }

  async duplicateFile(sourcePath: string): Promise<any> {
    return this.post('/api/files/duplicate', { source_path: sourcePath });
  }

  async createNewFile(path: string, isDirectory?: boolean, content?: string): Promise<any> {
    return this.post('/api/files/new', { path, is_directory: isDirectory, content: content ?? '' });
  }

  // =====================================================================
  // Sessions
  // =====================================================================

  async listSessions(search?: string, sort?: string, order?: string, page?: number, limit?: number): Promise<any> {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    if (order) params.set('order', order);
    if (page) params.set('page', String(page));
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return this.get(`/api/sessions/list${qs ? '?' + qs : ''}`);
  }

  async loadSession(sessionName: string): Promise<any> {
    return this.post('/api/sessions/load', { session_name: sessionName });
  }

  async loadSessionHistory(sessionName: string): Promise<any> {
    return this.post(`/api/sessions/${encodeURIComponent(sessionName)}/load-history`, {});
  }

  async renameSession(sessionName: string, customName: string, description?: string, tags?: string): Promise<any> {
    return this.put(`/api/sessions/${encodeURIComponent(sessionName)}/rename`, {
      custom_name: customName,
      description,
      tags,
    });
  }

  async deleteSession(sessionName: string): Promise<any> {
    return this.del(`/api/sessions/${encodeURIComponent(sessionName)}`);
  }

  async getSessionPreview(sessionName: string, count?: number): Promise<any> {
    const c = count ?? 3;
    return this.get(`/api/sessions/${encodeURIComponent(sessionName)}/preview?count=${c}`);
  }

  // =====================================================================
  // Usage
  // =====================================================================

  async getUsageSummary(period?: string, model?: string): Promise<any> {
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (model) params.set('model', model);
    const qs = params.toString();
    return this.get(`/api/usage/summary${qs ? '?' + qs : ''}`);
  }

  async getUsageBySession(limit?: number, offset?: number): Promise<any> {
    const params = new URLSearchParams();
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const qs = params.toString();
    return this.get(`/api/usage/by_session${qs ? '?' + qs : ''}`);
  }

  async getDailyUsage(days?: number): Promise<any> {
    const d = days ?? 30;
    return this.get(`/api/usage/daily?days=${d}`);
  }

  async getUsageByModel(period?: string, limit?: number, offset?: number): Promise<any> {
    const params = new URLSearchParams();
    if (period) params.set('period', period);
    if (limit) params.set('limit', String(limit));
    if (offset) params.set('offset', String(offset));
    const qs = params.toString();
    return this.get(`/api/usage/by_model${qs ? '?' + qs : ''}`);
  }

  async clearUsage(): Promise<any> {
    return this.post('/api/usage/clear', {});
  }

  // =====================================================================
  // Themes
  // =====================================================================

  async listThemes(): Promise<any> {
    return this.get('/api/themes/list');
  }

  async getTheme(filename: string): Promise<any> {
    return this.get(`/api/themes/${filename}`);
  }

  async saveTheme(data: Record<string, any>): Promise<any> {
    return this.post('/api/themes/save', data);
  }

  async deleteTheme(filename: string): Promise<any> {
    return this.del(`/api/themes/${filename}`);
  }

  // =====================================================================
  // Voice
  // =====================================================================

  async getVoiceConfig(): Promise<any> {
    return this.get('/api/voice/config');
  }

  async saveVoiceConfig(config: Record<string, any>): Promise<any> {
    return this.put('/api/voice/config', config);
  }

  async validateVoiceConfig(config: Record<string, any>): Promise<any> {
    return this.post('/api/voice/config/validate', config);
  }

  async transcribeAudio(formData: FormData): Promise<any> {
    const headers: Record<string, string> = {};
    if (this.authToken) {
      headers['X-Auth-Token'] = this.authToken;
    }
    const res = await fetch(`${this.baseUrl}/api/voice/transcribe`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) throw new Error(`Transcribe failed: ${res.status}`);
    return res.json();
  }

  // =====================================================================
  // MCP Servers
  // =====================================================================

  async getMcpServers(): Promise<any> {
    return this.get('/api/mcp/servers');
  }

  async addMcpServer(name: string, command: string, args: string[]): Promise<any> {
    return this.post('/api/mcp/servers/add', { name, command, args });
  }

  async startMcpServer(name: string): Promise<any> {
    return this.post(`/api/mcp/servers/${encodeURIComponent(name)}/start`, {});
  }

  async stopMcpServer(name: string): Promise<any> {
    return this.post(`/api/mcp/servers/${encodeURIComponent(name)}/stop`, {});
  }

  async deleteMcpServer(name: string): Promise<any> {
    return this.del(`/api/mcp/servers/${encodeURIComponent(name)}`);
  }

  // =====================================================================
  // Slash Commands
  // =====================================================================

  async getCommands(): Promise<any> {
    return this.get('/api/commands');
  }

  async executeCommand(command: string, args?: string): Promise<any> {
    return this.post('/api/commands/execute', { command, args: args ?? '' });
  }

  // =====================================================================
  // AGENTS.md Rules
  // =====================================================================

  async getAgentsRules(): Promise<any> {
    return this.get('/api/agents-rules');
  }

  // =====================================================================
  // WebSocket URLs
  // =====================================================================

  getChatWebSocketUrl(): string {
    const auth = this.authToken ? `?auth_token=${encodeURIComponent(this.authToken)}` : '';
    return `ws://127.0.0.1:${this.port}/ws/chat${auth}`;
  }

  getFileWebSocketUrl(): string {
    const auth = this.authToken ? `?auth_token=${encodeURIComponent(this.authToken)}` : '';
    return `ws://127.0.0.1:${this.port}/ws/files${auth}`;
  }

  // =====================================================================
  // HTTP Primitives
  // =====================================================================

  private async request(path: string, options?: RequestInit): Promise<any> {
    const headers: Record<string, string> = {};

    // Merge existing headers
    if (options?.headers) {
      if (options.headers instanceof Headers) {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else if (typeof options.headers === 'object') {
        Object.assign(headers, options.headers);
      }
    }

    // Inject auth token
    if (this.authToken) {
      headers['X-Auth-Token'] = this.authToken;
    }

    const res = await fetch(`${this.baseUrl}${path}`, { ...options, headers });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Request failed: ${res.status} ${res.statusText} ${errorText}`);
    }
    return res.json().catch(() => ({}));
  }

  private async get(path: string): Promise<any> {
    return this.request(path, { method: 'GET' });
  }

  private async post(path: string, body: any): Promise<any> {
    return this.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async put(path: string, body: any): Promise<any> {
    return this.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private async del(path: string): Promise<any> {
    return this.request(path, { method: 'DELETE' });
  }
}

// =============================================================================
// Singleton Accessor
// =============================================================================

let _instance: SidecarClient | null = null;
let _lastPort: number | null = null;

export function getSidecarClient(port: number, authToken?: string): SidecarClient {
  if (!_instance || _lastPort !== port) {
    _instance = new SidecarClient({ port, authToken });
    _lastPort = port;
  }
  if (authToken !== undefined) {
    _instance.setAuthToken(authToken);
  }
  return _instance;
}

export default SidecarClient;
