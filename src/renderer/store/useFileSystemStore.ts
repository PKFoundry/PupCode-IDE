import type { AppState } from './useAppStore';
import type { SetState, GetState } from 'zustand';
import { getSidecarClient } from '../services/sidecar';

export interface FileNode {
  name: string;
  path: string;
  is_directory: boolean;
  children: FileNode[] | null;
  is_loading?: boolean;
}

export interface EditorTab {
  path: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  isLoading: boolean;
  language?: string;
  viewMode: 'raw' | 'preview';
}

export type FileSystemSlice = Pick<AppState,
  'fileTree' | 'expandedPaths' | 'selectedFile' | 'loadFileTree' | 'refreshFileTree' |
  'toggleExpand' | 'selectFile' | 'editorTabs' | 'activeTab' | 'setActiveTab' |
  'openFile' | 'closeTab' | 'updateTabContent' | 'setTabViewMode' | 'saveFile' |
  'modifiedFiles' | 'agentModifiedFiles' | 'markFileModified' | 'clearFileModified' |
  '_fileWs' | 'connectFileWatcher' | 'disconnectFileWatcher'
>;

export const fileSystemSliceCreator = (set: SetState<AppState>, get: GetState<AppState>): FileSystemSlice => ({
// File Explorer
fileTree: [],
expandedPaths: new Set<string>(),
selectedFile: null,
loadFileTree: async (dir: string) => {
  const { sidecarPort } = get();
  if (!sidecarPort) return;
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.getFileTree(dir);
    if (data.tree) {
      set({ fileTree: data.tree });
      set((state) => ({ expandedPaths: new Set(state.expandedPaths).add(dir) }));
    }
  } catch (err) {
    console.error('Failed to load file tree:', err);
  }
},
refreshFileTree: async () => {
  const { workingDir, loadFileTree } = get();
  if (workingDir) {
    await loadFileTree(workingDir);
  }
},
toggleExpand: (path: string) => {
  set((state) => {
    const newExpanded = new Set(state.expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    return { expandedPaths: newExpanded };
  });
},
selectFile: (path: string | null) => set({ selectedFile: path }),

// Editor Tabs
editorTabs: [],
activeTab: null,
setActiveTab: (path: string | null) => set({ activeTab: path }),
openFile: async (path: string) => {
  const { sidecarPort, editorTabs, clearFileModified } = get();
  if (!sidecarPort) return;

  const existingTab = editorTabs.find((tab) => tab.path === path);
  if (existingTab) {
    set({ activeTab: path });
    return;
  }

  const name = path.split('/').pop()?.split('\\').pop() || path;
  set({
    editorTabs: [
      ...editorTabs,
      { path, name, content: '', originalContent: '', isDirty: false, isLoading: true, viewMode: 'raw' as const },
    ],
    activeTab: path,
  });

  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.getFileContent(path);
    if (data.content !== undefined) {
      const language = detectLanguage(path);
      set((state) => ({
        editorTabs: state.editorTabs.map((tab) =>
          tab.path === path
            ? { ...tab, content: data.content, originalContent: data.content, isLoading: false, language, viewMode: tab.viewMode ?? 'raw' }
            : tab
        ),
      }));
      clearFileModified(path);
    }
  } catch (err) {
    console.error('Failed to open file:', err);
    set((state) => ({
      editorTabs: state.editorTabs.filter((tab) => tab.path !== path),
      activeTab: state.activeTab === path ? null : state.activeTab,
    }));
  }
},
closeTab: (path: string) => {
  const { editorTabs, activeTab } = get();
  const newTabs = editorTabs.filter((tab) => tab.path !== path);
  set({
    editorTabs: newTabs,
    activeTab:
      activeTab === path
        ? newTabs.length > 0
          ? newTabs[newTabs.length - 1].path
          : null
        : activeTab,
  });
},
updateTabContent: (path: string, content: string) => {
  set((state) => ({
    editorTabs: state.editorTabs.map((tab) =>
      tab.path === path ? { ...tab, content, isDirty: content !== tab.originalContent } : tab
    ),
  }));
},
setTabViewMode: (path: string, mode: 'raw' | 'preview') => {
  set((state) => ({
    editorTabs: state.editorTabs.map((tab) =>
      tab.path === path ? { ...tab, viewMode: mode } : tab
    ),
  }));
},
saveFile: async (path: string) => {
  const { sidecarPort, editorTabs, refreshFileTree, clearFileModified } = get();
  if (!sidecarPort) return;

  const tab = editorTabs.find((t) => t.path === path);
  if (!tab || !tab.isDirty) return;

  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.writeFileContent(path, tab.content);
    if (data.success) {
      set((state) => ({
        editorTabs: state.editorTabs.map((t) =>
          t.path === path ? { ...t, isDirty: false, originalContent: t.content } : t
        ),
      }));
      clearFileModified(path);
      await refreshFileTree();
    }
  } catch (err) {
    console.error('Failed to save file:', err);
  }
},

// File watching
modifiedFiles: new Set<string>(),
agentModifiedFiles: new Set<string>(),
_fileWs: null as WebSocket | null,
// Chat WebSocket (for cleanup)
connectFileWatcher: () => {
  const { sidecarPort } = get();
  if (!sidecarPort) return;
  if (get()._fileWs?.readyState === WebSocket.OPEN) return;

  let pingInterval: ReturnType<typeof setInterval> | undefined;

  const client = getSidecarClient(sidecarPort);
  const ws = new WebSocket(client.getFileWebSocketUrl());

  ws.onopen = () => {
    console.log('[file-watcher] connected');
    set({ _fileWs: ws });
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
    (ws as any).pingInterval = pingInterval;
  };

  ws.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      const payload = data.data || {};

      if (data.type === 'file_changed') {
        const { event_type, path } = payload;
        if (!path) return;

        if (event_type === 'modified') {
          const tab = get().editorTabs.find((t) => t.path === path);
          if (tab) {
            const { sidecarPort } = get();
            if (sidecarPort) {
              getSidecarClient(sidecarPort).getFileContent(path)
                .then((fileData) => {
                  if (fileData.content !== undefined && fileData.content !== tab.content) {
                    get().updateTabContent(path, fileData.content);
                  }
                })
                .catch(() => {});
            }
          } else {
            get().markFileModified(path, false);
          }
        }

        if (event_type === 'created' || event_type === 'deleted') {
          get().refreshFileTree();
        }
      }
    } catch (err) {
      console.error('[file-watcher] parse error:', err);
    }
  };

  ws.onclose = () => {
    clearInterval(pingInterval);
    console.log('[file-watcher] disconnected, reconnecting in 3s...');
    set({ _fileWs: null });
    setTimeout(() => {
      if (get()._fileWs !== ws) {
        get().connectFileWatcher();
      }
    }, 3000);
  };

  ws.onerror = () => {
    console.error('[file-watcher] connection error');
  };
},
disconnectFileWatcher: () => {
  const ws = get()._fileWs;
  if (ws) {
    const storedPing = (ws as any).pingInterval;
    if (storedPing) clearInterval(storedPing);
    set({ _fileWs: null });
    ws.close();
  }
},
markFileModified: (path: string, byAgent: boolean) => {
  set((state) => {
    const modified = new Set(state.modifiedFiles);
    const agentModified = new Set(state.agentModifiedFiles);
    if (byAgent) {
      agentModified.add(path);
    } else {
      modified.add(path);
    }
    return { modifiedFiles: modified, agentModifiedFiles: agentModified };
  });
},
clearFileModified: (path: string) => {
  set((state) => {
    const modified = new Set(state.modifiedFiles);
    const agentModified = new Set(state.agentModifiedFiles);
    modified.delete(path);
    agentModified.delete(path);
    return { modifiedFiles: modified, agentModifiedFiles: agentModified };
  });
},

});

// Helper: detect language from file extension
function detectLanguage(path: string): string | undefined {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', json: 'json', md: 'markdown', css: 'css', html: 'html',
    xml: 'xml', yaml: 'yaml', yml: 'yaml', toml: 'toml', sh: 'shell',
    bat: 'bat', ps1: 'powershell', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', rb: 'ruby', php: 'php',
    sql: 'sql', graphql: 'graphql', gql: 'graphql', svg: 'svg',
    txt: 'plaintext', log: 'log', env: 'plaintext',
    gitignore: 'plaintext', dockerignore: 'plaintext',
  };
  return langMap[ext];
}
