import { create, type SetState, type GetState } from 'zustand';
import type { Session, PreviewMessage, ChatAttachment } from '../types/session';
import type { VoiceConfig } from '../types/voice';
import type { ThemeColors } from '../services/themeService';
import { getSidecarClient } from '../services/sidecar';
import {
  chatSliceCreator, ChatMessage, SubAgentEntry,
} from './useChatStore';
import {
  fileSystemSliceCreator, FileNode, EditorTab,
} from './useFileSystemStore';
import {
  sessionSliceCreator,
} from './useSessionStore';
import {
  settingsSliceCreator,
  Agent, MCPServer, SlashCommand, AgentFormData,
} from './useSettingsStore';
import {
  connectionSliceCreator,
} from './useConnectionStore';
import { useConnectionStore } from './useConnectionStore';
import {
  uiSettingsSliceCreator,
} from './useUISettingsStore';
import {
  modelsSliceCreator,
} from './useModelsStore';
import type { Model, ModelFormData } from './useModelsStore';
import {
  themeSliceCreator,
} from './useThemeStore';

// Re-export types from sub-stores for backward compatibility
export type {
  ChatMessage, FileNode, EditorTab, Model, Agent, MCPServer,
  SlashCommand, AgentFormData, ModelFormData, ChatAttachment, VoiceConfig,
  Session, PreviewMessage, ThemeColors,
};

// =============================================================================
// AppState - complete type definition (avoids circular Pick<> references)
// =============================================================================

export interface AppState {
  // Connection
  workingDir: string | null;
  setWorkingDir: (dir: string | null) => void;
  sidecarPort: number | null;
  sidecarConnected: boolean;
  authToken: string | null;
  setSidecarPort: (port: number | null) => void;
  setSidecarConnected: (connected: boolean) => void;
  setAuthToken: (token: string | null) => void;
  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  activeSubAgent: string | null;
  subAgentStack: SubAgentEntry[];
  _messagesTrimmed: boolean;
  pendingAttachments: ChatAttachment[];
  _chatWebSocket: WebSocket | null;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;
  setIsStreaming: (streaming: boolean) => void;
  sendMessage: (content: string) => Promise<void>;
  addPendingAttachment: (attachment: ChatAttachment) => void;
  removePendingAttachment: (id: string) => void;
  clearPendingAttachments: () => void;
  pushSubAgent: (name: string, toolCallId: string) => void;
  popSubAgent: (toolCallId: string) => void;
  // File System
  fileTree: FileNode[];
  expandedPaths: Set<string>;
  selectedFile: string | null;
  loadFileTree: (dir: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  toggleExpand: (path: string) => void;
  selectFile: (path: string | null) => void;
  editorTabs: EditorTab[];
  activeTab: string | null;
  setActiveTab: (path: string | null) => void;
  openFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  updateTabContent: (path: string, content: string) => void;
  setTabViewMode: (path: string, mode: 'raw' | 'preview') => void;
  saveFile: (path: string) => Promise<void>;
  modifiedFiles: Set<string>;
  agentModifiedFiles: Set<string>;
  markFileModified: (path: string, byAgent: boolean) => void;
  clearFileModified: (path: string) => void;
  _fileWs: WebSocket | null;
  connectFileWatcher: () => void;
  disconnectFileWatcher: () => void;
  // Session
  sessions: Session[];
  activeSession: string | null;
  sessionSearch: string;
  sessionLoading: boolean;
  setSessions: (sessions: Session[]) => void;
  setActiveSession: (name: string | null) => void;
  setSessionSearch: (q: string) => void;
  setSessionLoading: (loading: boolean) => void;
  loadSessions: (search?: string) => Promise<void>;
  loadSessionIntoChat: (sessionName: string) => Promise<void>;
  renameSession: (sessionName: string, customName: string, description?: string, tags?: string) => Promise<void>;
  deleteSession: (sessionName: string) => Promise<void>;
  getSessionPreview: (sessionName: string, count?: number) => Promise<PreviewMessage[]>;
  // Settings (models)
  models: Model[];
  activeModel: string | null;
  setModels: (models: Model[]) => void;
  setActiveModel: (name: string | null) => void;
  switchModel: (name: string) => Promise<void>;
  addModel: (data: ModelFormData) => Promise<boolean>;
  deleteModel: (name: string) => Promise<boolean>;
  getModel: (name: string) => Promise<Record<string, any> | null>;
  updateModel: (name: string, data: ModelFormData) => Promise<boolean>;
  // Settings (agents)
  agents: Agent[];
  activeAgent: string | null;
  setAgents: (agents: Agent[]) => void;
  setActiveAgent: (name: string | null) => void;
  switchAgent: (name: string) => Promise<void>;
  createAgent: (data: AgentFormData) => Promise<boolean>;
  updateAgent: (name: string, data: Record<string, any>) => Promise<boolean>;
  deleteAgent: (name: string) => Promise<boolean>;
  refreshAgents: () => Promise<void>;
  // Settings (MCP)
  mcpServers: MCPServer[];
  setMcpServers: (servers: MCPServer[]) => void;
  loadMcpServers: () => Promise<void>;
  addMcpServer: (name: string, command: string, args: string[]) => Promise<boolean>;
  deleteMcpServer: (name: string) => Promise<boolean>;
  // Settings (slash commands)
  slashCommands: SlashCommand[];
  setSlashCommands: (commands: SlashCommand[]) => void;
  loadSlashCommands: () => Promise<void>;
  executeCommand: (command: string, args?: string) => Promise<void>;
  agentsRules: { path: string; scope: string; content: string }[];
  setAgentsRules: (rules: { path: string; scope: string; content: string }[]) => void;
  loadAgentsRules: () => Promise<void>;
  // Settings (voice)
  voiceConfig: VoiceConfig;
  loadVoiceConfig: () => Promise<void>;
  saveVoiceConfig: (config: VoiceConfig) => Promise<boolean>;
  toggleVoiceRecording: () => void;
  changeWorkspace: (dir: string) => Promise<boolean>;
  // Settings (themes)
  activeTheme: string;
  availableThemes: string[];
  customThemes: Record<string, ThemeColors>;
  themeSyncing: boolean;
  setActiveTheme: (name: string) => void;
  refreshThemes: () => Promise<void>;
  saveCustomTheme: (name: string, colors: ThemeColors) => Promise<void>;
  deleteCustomTheme: (name: string) => Promise<void>;
  exportTheme: (name: string) => string | null;
  importTheme: (json: string) => { name: string; colors: ThemeColors } | null;
  validateThemeColors: (colors: Partial<ThemeColors>) => boolean;
  // UI
  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarHidden: boolean;
  setSidebarHidden: (hidden: boolean) => void;
  chatPanelWidth: number;
  setChatPanelWidth: (width: number) => void;
  chatPanelCollapsed: boolean;
  setChatPanelCollapsed: (collapsed: boolean) => void;
  getMaxChatPanelWidth: (viewportWidth: number) => number;
  saveLayoutPreferences: () => void;
  loadLayoutPreferences: () => Promise<void>;
  showCommandPalette: boolean;
  setShowCommandPalette: (show: boolean) => void;
  showLoading: boolean;
  loadingMessage: string;
  setLoading: (show: boolean, message?: string) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
}

// =============================================================================
// Store Composition — spreads sub-store slices with cross-store sync
// =============================================================================

const useAppStore = create<AppState>((set, get) => ({
  // Connection slice (backed by useConnectionStore as source of truth)
  ...connectionSliceCreator(set as SetState<AppState>, get as GetState<AppState>),

  // UI settings slice
  ...uiSettingsSliceCreator(set as SetState<AppState>, get as GetState<AppState>),

  // Chat slice
  ...chatSliceCreator(set, get),

  // File system slice
  ...fileSystemSliceCreator(set, get),

  // Session slice
  ...sessionSliceCreator(set, get),

  // Models slice (spun out of settings)
  ...modelsSliceCreator(set, get),

  // Settings slice (agents, MCP, slash commands, voice, workspace)
  ...settingsSliceCreator(set, get),

  // Theme slice (spun out of settings)
  ...themeSliceCreator(set, get),
}));

// =============================================================================
// Bidirectional sync: useConnectionStore ↔ useAppStore
//
// useConnectionStore is the canonical source of truth for connection state.
// useAppStore mirrors it for backward-compatible selectors.
// =============================================================================

// 1. Initial sync: copy useConnectionStore → useAppStore
{
  const conn = useConnectionStore.getState();
  useAppStore.setState({
    workingDir: conn.workingDir,
    sidecarPort: conn.sidecarPort,
    sidecarConnected: conn.sidecarConnected,
    authToken: conn.authToken,
  });
}

// 2. Sync useConnectionStore changes → useAppStore (covers changeWorkspace, etc.)
useConnectionStore.subscribe((connState) => {
  useAppStore.setState({
    workingDir: connState.workingDir,
    sidecarPort: connState.sidecarPort,
    sidecarConnected: connState.sidecarConnected,
    authToken: connState.authToken,
  });
});

// 3. Override useAppStore connection setters to also write to useConnectionStore
//    (covers WelcomeScreen writes, ensures writes stay in sync)
useAppStore.setState({
  setWorkingDir: (dir) => {
    useConnectionStore.getState().setWorkingDir(dir);
  },
  setSidecarPort: (port) => {
    useConnectionStore.getState().setSidecarPort(port);
  },
  setSidecarConnected: (connected) => {
    useConnectionStore.getState().setSidecarConnected(connected);
  },
  setAuthToken: (token) => {
    useConnectionStore.getState().setAuthToken(token);
  },
});

// Cross-store effect: loadVoiceConfig when sidecar connects
useAppStore.subscribe((state, prevState) => {
  if (state.sidecarConnected && !prevState.sidecarConnected) {
    state.loadVoiceConfig();
  }
});

export default useAppStore;
