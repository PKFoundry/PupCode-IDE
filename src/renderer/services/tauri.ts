/**
 * Tauri API Bridge
 *
 * Replaces Electron's preload.ts. Provides the same `window.electronAPI`
 * interface so the React components work with zero changes.
 */

import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

// ---------------------------------------------------------------------------
// Types matching the Electron preload interface
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Implementation using Tauri v2 APIs
// ---------------------------------------------------------------------------

const tauriAPI: ElectronAPI = {
  /**
   * Start the Python sidecar process.
   * In dev mode, expects sidecar to already be running on port 8765.
   * In prod mode, spawns the bundled sidecar binary.
   */
  async startSidecar(workingDir: string): Promise<SidecarStartResult> {
    try {
      const result = await invoke<SidecarStartResult>('start_sidecar', { dir: workingDir });
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /**
   * Stop the Python sidecar process.
   */
  async stopSidecar(): Promise<{ success: boolean }> {
    try {
      await invoke('stop_sidecar');
      return { success: true };
    } catch {
      return { success: false };
    }
  },

  /**
   * Get the current sidecar port.
   */
  async getSidecarPort(): Promise<number> {
    return invoke<number>('get_sidecar_port');
  },

  /**
   * Open a directory picker dialog.
   */
  async openDirectory(): Promise<string | null> {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select Working Directory',
      });
      return selected === null ? null : (Array.isArray(selected) ? selected[0] : selected);
    } catch {
      return null;
    }
  },
};

// ---------------------------------------------------------------------------
// Expose globally (matching Electron's contextBridge pattern)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

window.electronAPI = tauriAPI;

export default tauriAPI;
