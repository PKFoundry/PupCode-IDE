/**
 * Settings store: agents, MCP servers, slash commands, voice config, workspace change.
 *
 * Uses slice creator pattern composed into useAppStore (HIGH-3).
 * Accesses sidecarPort via useConnectionStore (independent store).
 * All other cross-store access uses the `get` parameter from useAppStore.
 *
 * Themes → useThemeStore.ts (split out for size)
 * Models → useModelsStore.ts (split out for size)
 */

import type { VoiceConfig } from '../types/voice';
import { getSidecarClient } from '../services/sidecar';
import { useConnectionStore } from './useConnectionStore';
import type { AppState } from './useAppStore';
import type { SetState, GetState } from 'zustand';

// Re-export Model + ModelFormData from useModelsStore for backward compat
export type { Model, ModelFormData } from './useModelsStore';

export interface Agent {
  name: string;
  display_name: string;
  description: string;
  is_active: boolean;
}

export interface MCPServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  status: 'configured' | 'started' | 'stopped';
}

export interface SlashCommand {
  name: string;
  description: string;
  category: string;
}

export interface AgentFormData {
  name: string;
  description: string;
  system_prompt: string;
  tools: string[];
}

export type SettingsSlice = Pick<AppState,
  'agents' | 'activeAgent' | 'setAgents' | 'setActiveAgent' | 'switchAgent' |
  'createAgent' | 'updateAgent' | 'deleteAgent' | 'refreshAgents' |
  'mcpServers' | 'setMcpServers' | 'loadMcpServers' | 'addMcpServer' | 'deleteMcpServer' |
  'slashCommands' | 'setSlashCommands' | 'loadSlashCommands' | 'executeCommand' |
  'agentsRules' | 'setAgentsRules' | 'loadAgentsRules' |
  'voiceConfig' | 'loadVoiceConfig' | 'saveVoiceConfig' | 'toggleVoiceRecording' |
  'changeWorkspace'
>;

export const settingsSliceCreator = (
  set: SetState<AppState>,
  get: GetState<AppState>,
): SettingsSlice => ({
  // ---- Agents CRUD ----
  agents: [],
  activeAgent: null,
  setAgents: (agents) => set({ agents }),
  setActiveAgent: (name) => set({ activeAgent: name }),
  switchAgent: async (name) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    const client = getSidecarClient(sidecarPort);
    const data = await client.switchAgent(name);
    if (data.success) {
      set({
        activeAgent: data.active_agent,
        agents: get().agents.map((a) => ({
          ...a,
          is_active: a.name === data.active_agent,
        })),
      });
    }
  },
  createAgent: async (data) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const result = await client.createAgent(data);
      if (result.success) {
        await get().refreshAgents();
      }
      return result.success || false;
    } catch {
      return false;
    }
  },
  updateAgent: async (name, data) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const result = await client.updateAgent(name, data);
      if (result.success) {
        await get().refreshAgents();
      }
      return result.success || false;
    } catch {
      return false;
    }
  },
  deleteAgent: async (name) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const result = await client.deleteAgent(name);
      if (result.success) {
        await get().refreshAgents();
        if (get().activeAgent === name) {
          const remaining = get().agents.filter((a) => a.name !== name);
          get().setActiveAgent(remaining[0]?.name || null);
        }
      }
      return result.success || false;
    } catch {
      return false;
    }
  },
  refreshAgents: async () => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.getAgents();
      get().setAgents(data.agents || []);
      get().setActiveAgent(data.active_agent || get().activeAgent);
    } catch (err) {
      console.error('Failed to refresh agents:', err);
    }
  },

  // ---- MCP Servers ----
  mcpServers: [],
  setMcpServers: (servers) => set({ mcpServers: servers }),
  loadMcpServers: async () => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.getMcpServers();
      set({ mcpServers: data.servers || [] });
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
    }
  },
  addMcpServer: async (name, command, args) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.addMcpServer(name, command, args);
      if (data.success) await get().loadMcpServers();
      return data.success || false;
    } catch (err) {
      console.error('Failed to add MCP server:', err);
      return false;
    }
  },
  deleteMcpServer: async (name) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.deleteMcpServer(name);
      if (data.success) await get().loadMcpServers();
      return data.success || false;
    } catch (err) {
      console.error('Failed to delete MCP server:', err);
      return false;
    }
  },

  // ---- Slash Commands ----
  slashCommands: [],
  setSlashCommands: (commands) => set({ slashCommands: commands }),
  loadSlashCommands: async () => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.getCommands();
      set({ slashCommands: data.commands || [] });
    } catch (err) {
      console.error('Failed to load slash commands:', err);
    }
  },
  executeCommand: async (command, args?) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.executeCommand(command, args);
      if (data.success && data.output) {
        if (command === '/model' || command === '/agent') {
          await get().refreshAgents();
          const modelsData = await client.getModels();
          get().setModels(modelsData.models || []);
          get().setActiveModel(modelsData.active_model || null);
        }
        if (command === '/truncate' || command === '/clear') {
          get().clearMessages();
        }
      }
    } catch (err) {
      console.error('Failed to execute command:', err);
    }
  },

  // ---- Agents Rules ----
  agentsRules: [],
  setAgentsRules: (rules) => set({ agentsRules: rules }),
  loadAgentsRules: async () => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.getAgentsRules();
      set({ agentsRules: data.rules || [] });
    } catch (err) {
      console.error('Failed to load AGENTS.md rules:', err);
    }
  },

  // ---- Voice Config ----
  voiceConfig: {
    enabled: false,
    base_url: '',
    model: 'Systran/faster-whisper-small',
    api_key: '',
    language: 'en',
    chunk_duration_seconds: 30,
  },
  loadVoiceConfig: async () => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.getVoiceConfig();
      set({ voiceConfig: data });
    } catch (err) {
      console.error('Failed to load voice config:', err);
    }
  },
  saveVoiceConfig: async (config) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.saveVoiceConfig(config);
      if (data.success) {
        set({ voiceConfig: config });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to save voice config:', err);
      return false;
    }
  },
  toggleVoiceRecording: () => {
    window.dispatchEvent(new CustomEvent('toggle-voice-recording'));
  },

  // ---- Workspace Change ----
  changeWorkspace: async (dir: string) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    get().setLoading(true, 'Changing workspace...');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<any>('start_sidecar', { dir });
      if (result.success && result.port) {
        useConnectionStore.getState().setSidecarPort(result.port);
        useConnectionStore.getState().setSidecarConnected(true);
        useConnectionStore.getState().setWorkingDir(dir);
        await get().refreshFileTree();
        await get().loadAgentsRules();
        await get().loadSlashCommands();
        get().clearMessages();
        get().disconnectFileWatcher();
        get().connectFileWatcher();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to change workspace:', err);
      return false;
    } finally {
      get().setLoading(false);
    }
  },
});
