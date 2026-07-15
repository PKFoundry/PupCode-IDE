/**
 * Model management store: model list, active model, CRUD operations.
 *
 * Spun out of useSettingsStore for size reduction (HIGH-3 / remediation).
 */

import { create, type SetState, type GetState } from 'zustand';
import { getSidecarClient } from '../services/sidecar';
import { useConnectionStore } from './useConnectionStore';
import type { AppState } from './useAppStore';

export interface Model {
  name: string;
  provider: string;
  display_name: string;
  is_active: boolean;
}

export interface ModelFormData {
  name: string;
  type: string;
  endpoint: string;
  api_key: string;
  description: string;
  context_length: number;
  timeout: number;
}

export type ModelsSlice = Pick<AppState,
  'models' | 'activeModel' | 'setModels' | 'setActiveModel' |
  'switchModel' | 'addModel' | 'deleteModel' | 'getModel' | 'updateModel'
>;

export const modelsSliceCreator = (
  set: SetState<AppState>,
  get: GetState<AppState>,
): ModelsSlice => ({
  models: [],
  activeModel: null,
  setModels: (models) => set({ models }),
  setActiveModel: (name) => set({ activeModel: name }),

  switchModel: async (name) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return;
    const client = getSidecarClient(sidecarPort);
    const data = await client.switchModel(name);
    if (data.success) {
      set({
        activeModel: data.active_model,
        models: get().models.map((m) => ({
          ...m,
          is_active: m.name === data.active_model,
        })),
      });
    }
  },

  addModel: async (data) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const result = await client.addModel(data);
      if (result.success) {
        const listData = await client.getModels();
        get().setModels(listData.models || []);
        get().setActiveModel(listData.active_model || null);
      }
      return result.success || false;
    } catch {
      return false;
    }
  },

  deleteModel: async (name) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const result = await client.deleteModel(name);
      if (result.success) {
        const newModels = get().models.filter((m) => m.name !== name);
        get().setModels(newModels);
        if (get().activeModel === name) {
          get().setActiveModel(newModels[0]?.name || null);
        }
      }
      return result.success || false;
    } catch {
      return false;
    }
  },

  getModel: async (name) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return null;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.getModel(name);
      return data.success ? data.config : null;
    } catch {
      return null;
    }
  },

  updateModel: async (name, data) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) return false;
    try {
      const client = getSidecarClient(sidecarPort);
      const result = await client.updateModel(name, data);
      if (result.success) {
        const listData = await client.getModels();
        get().setModels(listData.models || []);
        get().setActiveModel(listData.active_model || null);
      }
      return result.success || false;
    } catch {
      return false;
    }
  },
});

export const useModelsStore = create<ModelsSlice>(
  (set, get) => modelsSliceCreator(set as SetState<AppState>, get as GetState<AppState>),
);

export default useModelsStore;
