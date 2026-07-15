/**
 * Theme management store: active theme, theme list, custom themes, import/export.
 *
 * Spun out of useSettingsStore for size reduction (HIGH-3 / remediation).
 */

import { create, type SetState, type GetState } from 'zustand';
import type { ThemeColors } from '../services/themeService';
import { getSidecarClient } from '../services/sidecar';
import {
  activateTheme as activateThemeService,
  getAllThemeNames, getPresetThemeNames, loadThemePrefs,
  saveCustomTheme as saveCustomThemeService, deleteCustomTheme as deleteCustomThemeService,
  exportTheme as exportThemeService, importTheme as importThemeService,
  validateThemeColors as validateThemeColorsService,
} from '../services/themeService';
import { deleteThemeFromDisk } from '../services/themeService';
import { useConnectionStore } from './useConnectionStore';
import type { AppState } from './useAppStore';

export type ThemeSlice = Pick<AppState,
  'activeTheme' | 'availableThemes' | 'customThemes' | 'themeSyncing' |
  'setActiveTheme' | 'refreshThemes' | 'saveCustomTheme' | 'deleteCustomTheme' |
  'exportTheme' | 'importTheme' | 'validateThemeColors'
>;

export const themeSliceCreator = (
  set: SetState<AppState>,
  _get: GetState<AppState>,
): ThemeSlice => ({
  activeTheme: 'Default',
  availableThemes: [],
  customThemes: {},
  themeSyncing: false,

  setActiveTheme: (name: string) => {
    activateThemeService(name);
    set({ activeTheme: name });
  },

  refreshThemes: async () => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (!sidecarPort) {
      set({ availableThemes: getAllThemeNames(), themeSyncing: false });
      return;
    }
    set({ themeSyncing: true });
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.listThemes();
      const custom: Record<string, ThemeColors> = {};
      const diskNames = new Set<string>();
      for (const theme of (data.themes || [])) {
        try {
          const themeData = await client.getTheme(theme.file);
          if (themeData.colors) {
            custom[theme.name] = themeData.colors;
            diskNames.add(theme.name);
          }
        } catch { /* skip broken themes */ }
      }
      const existingPrefs = loadThemePrefs();
      const cleanedCustom = Object.fromEntries(
        Object.entries(existingPrefs.custom).filter(([name]) => diskNames.has(name))
      );
      for (const [name, colors] of Object.entries(custom)) {
        cleanedCustom[name] = colors;
        saveCustomThemeService(name, colors);
      }
      for (const name of Object.keys(existingPrefs.custom)) {
        if (!diskNames.has(name)) {
          deleteCustomThemeService(name);
        }
      }
      set({
        availableThemes: [...getPresetThemeNames(), ...Object.keys(cleanedCustom)],
        customThemes: cleanedCustom,
        themeSyncing: false,
      });
    } catch (e) {
      console.error('Failed to load themes:', e);
      set({ availableThemes: getAllThemeNames(), themeSyncing: false });
    }
  },

  saveCustomTheme: async (name: string, colors: ThemeColors) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    saveCustomThemeService(name, colors);
    if (sidecarPort) {
      try {
        const client = getSidecarClient(sidecarPort);
        await client.saveTheme({ name, colors });
      } catch (e) {
        console.error('Failed to save theme to disk:', e);
      }
    }
    activateThemeService(name);
    set(state => ({
      activeTheme: name,
      availableThemes: [...getPresetThemeNames(), name],
      customThemes: { ...state.customThemes, [name]: colors },
    }));
  },

  deleteCustomTheme: async (name: string) => {
    const sidecarPort = useConnectionStore.getState().sidecarPort;
    if (sidecarPort) {
      const safeName = name.replace(/\s+/g, '-').toLowerCase();
      await deleteThemeFromDisk(sidecarPort, `${safeName}.json`);
    }
    deleteCustomThemeService(name);
    set(state => {
      const updated = { ...state.customThemes };
      delete updated[name];
      return {
        availableThemes: getAllThemeNames().filter(n => n !== name),
        customThemes: updated,
      };
    });
  },

  exportTheme: (name: string) => exportThemeService(name),

  importTheme: (json: string): { name: string; colors: ThemeColors } | null => {
    const result = importThemeService(json);
    if (result) {
      saveCustomThemeService(result.name, result.colors);
      activateThemeService(result.name);
      set((state) => ({
        customThemes: { ...state.customThemes, [result.name]: result.colors },
        activeTheme: result.name,
        availableThemes: [...new Set([...state.availableThemes, result.name])],
      }));
      return result;
    }
    return null;
  },

  validateThemeColors: (colors: Partial<ThemeColors>) =>
    validateThemeColorsService(colors),
});

export const useThemeStore = create<ThemeSlice>(
  (set, get) => themeSliceCreator(set as SetState<AppState>, get as GetState<AppState>),
);

export default useThemeStore;
