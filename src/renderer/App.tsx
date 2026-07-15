import { useEffect, useCallback } from 'react';
import useAppStore from './store/useAppStore';
import { loadActiveTheme, applyTheme, loadThemePrefs } from './services/themeService';
import { getSidecarClient } from './services/sidecar';
import WelcomeScreen from './components/WelcomeScreen';
import Toolbar from './components/Toolbar';
import Sidebar from './components/Sidebar';
import EditorArea from './components/EditorArea';
import ChatPanel from './components/ChatPanel';
import StatusBar from './components/StatusBar';
import CommandPalette from './components/CommandPalette';
import SettingsPanel from './components/SettingsPanel';
import LoadingOverlay from './components/LoadingOverlay';
import ResizeHandle from './components/ResizeHandle';

function App() {
  const {
    showWelcome,
    sidecarConnected,
    sidecarPort,
    workingDir,
    setModels,
    setAgents,
    setActiveModel,
    setActiveAgent,
    loadSlashCommands,
    sidebarWidth,
    setSidebarWidth,
    sidebarHidden,
    setSidebarHidden,
    sidebarCollapsed,
    setSidebarCollapsed,
    chatPanelWidth,
    setChatPanelWidth,
    getMaxChatPanelWidth,
    chatPanelCollapsed,
    setChatPanelCollapsed,
    saveLayoutPreferences,
    loadLayoutPreferences,
  } = useAppStore();

  // Load layout preferences on mount
  useEffect(() => {
    loadLayoutPreferences();
  }, [loadLayoutPreferences]);

  // Load and apply theme on mount
  useEffect(() => {
    const { activeTheme: storeTheme, setActiveTheme, refreshThemes } = useAppStore.getState();
    const prefs = loadThemePrefs();
    const themeName = prefs.active || 'Default';
    if (storeTheme !== themeName) {
      setActiveTheme(themeName);
    }
    const theme = loadActiveTheme();
    applyTheme(theme);
    refreshThemes();
  }, []);

  // Save layout preferences when they change (debounced)
  const debouncedSave = useCallback(
    (() => {
      let timeout: ReturnType<typeof setTimeout>;
      return () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => saveLayoutPreferences(), 500);
      };
    })(),
    [saveLayoutPreferences]
  );

  const handleSidebarResize = useCallback(
    (delta: number) => {
      setSidebarWidth(sidebarWidth + delta);
      debouncedSave();
      return delta;
    },
    [sidebarWidth, setSidebarWidth, debouncedSave]
  );

  const handleChatResize = useCallback(
    (delta: number) => {
      const newWidth = chatPanelWidth - delta;
      const max = getMaxChatPanelWidth(window.innerWidth);
      const clamped = Math.max(280, Math.min(max, newWidth));
      setChatPanelWidth(clamped);
      debouncedSave();
      return -(clamped - chatPanelWidth);
    },
    [chatPanelWidth, setChatPanelWidth, getMaxChatPanelWidth, debouncedSave]
  );

  // Load data when sidecar connects
  useEffect(() => {
    if (!sidecarConnected || !workingDir || !sidecarPort) return;

    const client = getSidecarClient(sidecarPort);

    client.getModels()
      .then((data) => { setModels(data.models || []); setActiveModel(data.active_model || null); })
      .catch(console.error);

    client.getAgents()
      .then((data) => { setAgents(data.agents || []); setActiveAgent(data.active_agent || null); })
      .catch(console.error);

    loadSlashCommands();
  }, [sidecarConnected, workingDir, sidecarPort, setModels, setAgents, setActiveModel, setActiveAgent, loadSlashCommands]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+P: Command Palette
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        useAppStore.getState().setShowCommandPalette(true);
      }
      // Ctrl+,: Settings
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault();
        useAppStore.getState().setShowSettings(true);
      }
      // Ctrl+B: Toggle Sidebar
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        const state = useAppStore.getState();
        useAppStore.getState().setSidebarHidden(!state.sidebarHidden);
      }
      // Ctrl+J: Toggle Chat Panel
      if (e.ctrlKey && e.key === 'j') {
        e.preventDefault();
        const state = useAppStore.getState();
        useAppStore.getState().setChatPanelCollapsed(!state.chatPanelCollapsed);
      }
      // Ctrl+Shift+V: Toggle Markdown Preview
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        const state = useAppStore.getState();
        if (state.activeTab?.endsWith('.md')) {
          const tab = state.editorTabs.find((t) => t.path === state.activeTab);
          const newMode = tab?.viewMode === 'preview' ? 'raw' : 'preview';
          useAppStore.getState().setTabViewMode(state.activeTab, newMode);
        }
      }
      // Ctrl+M: Toggle voice recording
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        useAppStore.getState().toggleVoiceRecording();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (showWelcome) {
    return <WelcomeScreen />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-bg-primary text-text-primary font-sans overflow-hidden">
      {/* Toolbar */}
      <Toolbar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        {!sidebarHidden && (
          <>
            <Sidebar />
            <ResizeHandle
              orientation="vertical"
              onResize={handleSidebarResize}
              onDoubleClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            />
          </>
        )}

        {/* Editor Area (center) */}
        <div className="flex-1 flex flex-col bg-bg-secondary min-w-0">
          <EditorArea />
        </div>

        {/* Chat Panel */}
        {!chatPanelCollapsed && (
          <>
            <ResizeHandle
              orientation="vertical"
              onResize={handleChatResize}
              onDoubleClick={() => setChatPanelCollapsed(!chatPanelCollapsed)}
            />
            <ChatPanel />
          </>
        )}
      </div>

      {/* Status Bar */}
      <StatusBar />

      {/* Overlays */}
      <CommandPalette />
      <SettingsPanel />
      <LoadingOverlay />
    </div>
  );
}

export default App;
