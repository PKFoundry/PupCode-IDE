import { Settings, Command, FolderOpen, PanelLeft, PanelRight } from 'lucide-react';
import useAppStore from '../store/useAppStore';

function Toolbar() {
  const {
    activeModel, activeAgent, workingDir,
    setShowCommandPalette, setShowSettings,
    changeWorkspace,
    sidebarHidden, setSidebarHidden,
    chatPanelCollapsed, setChatPanelCollapsed,
  } = useAppStore();

  const handleOpenDirectory = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const dir = await open({ directory: true, multiple: false });
      if (dir) {
        await changeWorkspace(dir);
      }
    } catch (err) {
      console.error('Failed to open directory picker:', err);
    }
  };

  return (
    <div className="h-10 bg-bg-secondary border-b border-border flex items-center px-3 gap-3 select-none">
      {/* Logo */}
      <div className="flex items-center gap-1.5">
        <span className="text-base"></span>
        <span className="font-semibold text-sm text-text-primary">PupCode IDE</span>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Model */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-primary text-xs">
        <span className="text-accent"></span>
        <span className="text-text-primary">{activeModel || 'No model'}</span>
      </div>

      {/* Agent */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-primary text-xs">
        <span className="text-accent"></span>
        <span className="text-text-primary">{activeAgent || 'No agent'}</span>
      </div>

      {/* Working Directory */}
      {workingDir && (
        <>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5 group">
            <span
              className="text-xs text-text-muted truncate max-w-xs"
              title={workingDir}
            >
              {workingDir.split(/[\\/]/).pop() || workingDir}
            </span>
            <button
              onClick={handleOpenDirectory}
              className="p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
              title="Change workspace"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      <div className="flex-1" />

      {/* Toggle Sidebar */}
      <button
        onClick={() => setSidebarHidden(!sidebarHidden)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover text-xs transition-colors
          ${sidebarHidden ? 'text-accent' : 'text-text-muted'}`}
        title="Toggle Sidebar (Ctrl+B)"
      >
        <PanelLeft className="w-3.5 h-3.5" />
      </button>

      {/* Toggle Chat */}
      <button
        onClick={() => setChatPanelCollapsed(!chatPanelCollapsed)}
        className={`flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover text-xs transition-colors
          ${chatPanelCollapsed ? 'text-accent' : 'text-text-muted'}`}
        title="Toggle Chat (Ctrl+J)"
      >
        <PanelRight className="w-3.5 h-3.5" />
      </button>

      {/* Command Palette */}
      <button
        onClick={() => setShowCommandPalette(true)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-bg-hover text-xs text-text-muted transition-colors"
        title="Command Palette (Ctrl+Shift+P)"
      >
        <Command className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Commands...</span>
      </button>


      {/* Settings */}
      <button
        onClick={() => setShowSettings(true)}
        className="p-1.5 rounded hover:bg-bg-hover text-text-muted transition-colors"
        title="Settings (Ctrl+,)"
      >
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );
}

export default Toolbar;
