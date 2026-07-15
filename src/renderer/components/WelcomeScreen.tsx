import { useState, useEffect } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { getSidecarClient } from '../services/sidecar';

function WelcomeScreen() {
  const {
    setShowWelcome,
    setWorkingDir,
    setSidecarPort,
    setSidecarConnected,
    setAuthToken,
    workingDir,
    authToken,
  } = useAppStore();

  const [selectedDir, setSelectedDir] = useState<string | null>(workingDir || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (workingDir) setSelectedDir(workingDir);
  }, [workingDir]);

  const handleSelectDirectory = async () => {
    setLoading(true);
    setError(null);

    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const dir = await open({ directory: true, multiple: false });
      if (dir) {
        setSelectedDir(dir);
        await connect(dir);
      } else {
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to select directory');
      setLoading(false);
    }
  };

  const connect = async (dir: string) => {
    setLoading(true);
    setWorkingDir(dir);

    // Start sidecar via Tauri IPC
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<any>('start_sidecar', { dir });
    // Check if sidecar actually started
    if (!result.success) {
      setError(result.error || 'Failed to start sidecar.');
      setLoading(false);
      return;
    }
    const port = result.port || 8765;
    setSidecarPort(port);

    // Get auth token for sidecar communication
    const token = await invoke<string>('get_sidecar_auth_token');
    setAuthToken(token);

    try {
      const client = getSidecarClient(port, token);
      
      // Health check (exempt from auth)
      await client.health();

      // Set working dir on sidecar (auth required)
      await client.updateConfig({ working_dir: dir });

      setSidecarConnected(true);
      setShowWelcome(false);
      useAppStore.getState().connectFileWatcher();
    } catch (err: any) {
      setError(`Cannot connect to sidecar: ${err.message}. Make sure the Python sidecar is running.`);
      setSidecarConnected(false);
      setSidecarPort(null);
    }

    setLoading(false);
  };

  const dirName = selectedDir ? (selectedDir.split(/[\\/]/).pop() || selectedDir) : null;

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-bg-primary">
      <div className="max-w-md w-full p-8 animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4"></div>
          <h1 className="text-3xl font-bold text-text-primary">PupCode IDE</h1>
          <p className="text-text-secondary mt-2">
            Your AI coding agent, now with a pretty face.
          </p>
        </div>

        {/* Directory Selection */}
        <div className="bg-bg-secondary rounded-lg p-6 border border-border">
          <h2 className="text-lg font-semibold mb-4">Get Started</h2>
          <p className="text-text-secondary text-sm mb-6">
            Select a working directory to begin. This is the project folder
            where Code Puppy will read and write files.
          </p>

          {/* Selected directory display */}
          {selectedDir && (
            <div className="mb-4 p-3 bg-bg-primary rounded-lg border border-border flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen className="w-4 h-4 text-accent flex-shrink-0" />
                <span className="text-sm text-text-primary truncate">{dirName}</span>
              </div>
              <span className="text-xs text-text-muted flex-shrink-0 ml-2">Selected</span>
            </div>
          )}

          {/* Button */}
          <button
            onClick={handleSelectDirectory}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <FolderOpen className="w-5 h-5" />
            )}
            {loading ? 'Connecting...' : (selectedDir ? 'Change Workspace' : 'Select Working Directory')}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-text-muted text-xs mt-6">
          Powered by code-puppy
        </p>
      </div>
    </div>
  );
}

export default WelcomeScreen;
