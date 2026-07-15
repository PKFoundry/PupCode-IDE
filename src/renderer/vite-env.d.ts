/// <reference types="vite/client" />

// Tauri API types — mirrors Electron's preload.ts interface
interface SidecarStartResult {
  success: boolean;
  port?: number;
  error?: string;
}

interface ElectronAPI {
  startSidecar: (workingDir: string) => Promise<SidecarStartResult>;
  stopSidecar: () => Promise<{ success: boolean }>;
  getSidecarPort: () => Promise<number>;
  openDirectory: () => Promise<string | null>;
}

interface Window {
  electronAPI: ElectronAPI;
}

interface ImportMetaEnv {
  readonly VITE_SIDECAR_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
