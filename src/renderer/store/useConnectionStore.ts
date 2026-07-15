/**
 * Connection state store: workingDir, sidecarPort, sidecarConnected, authToken.
 *
 * Spun out of the monolithic useAppStore (HIGH-3).
 */

import { create, type SetState, type GetState } from 'zustand';

export interface ConnectionState {
  workingDir: string | null;
  setWorkingDir: (dir: string | null) => void;
  sidecarPort: number | null;
  setSidecarPort: (port: number | null) => void;
  sidecarConnected: boolean;
  setSidecarConnected: (connected: boolean) => void;
  authToken: string | null;
  setAuthToken: (token: string | null) => void;
}

export const connectionSliceCreator = (
  set: SetState<ConnectionState>,
  _get: GetState<ConnectionState>,
): Omit<ConnectionState, 'setWorkingDir' | 'setSidecarPort' | 'setSidecarConnected' | 'setAuthToken'> & {
  setWorkingDir: (dir: string | null) => void;
  setSidecarPort: (port: number | null) => void;
  setSidecarConnected: (connected: boolean) => void;
  setAuthToken: (token: string | null) => void;
} => ({
  workingDir: null,
  setWorkingDir: (dir) => set({ workingDir: dir }),

  sidecarPort: null,
  setSidecarPort: (port) => set({ sidecarPort: port }),

  sidecarConnected: false,
  setSidecarConnected: (connected) => set({ sidecarConnected: connected }),

  authToken: null,
  setAuthToken: (token) => set({ authToken: token }),
});

export const useConnectionStore = create<ConnectionState>(
  (set, get) => connectionSliceCreator(set, get),
);

export default useConnectionStore;
