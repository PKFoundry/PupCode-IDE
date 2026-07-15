/**
 * UI settings store: welcome screen, panel dimensions, collapsed states,
 * layout preferences, command palette, loading overlay, settings panel.
 *
 * Spun out of the monolithic useAppStore (HIGH-3).
 */

import { create, type SetState, type GetState } from 'zustand';
import { useConnectionStore } from './useConnectionStore';

export interface UISettingsState {
  // Welcome
  showWelcome: boolean;
  setShowWelcome: (show: boolean) => void;
  // Sidebar
  sidebarWidth: number;
  setSidebarWidth: (width: number) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  sidebarHidden: boolean;
  setSidebarHidden: (hidden: boolean) => void;
  // Chat panel
  chatPanelWidth: number;
  setChatPanelWidth: (width: number) => void;
  chatPanelCollapsed: boolean;
  setChatPanelCollapsed: (collapsed: boolean) => void;
  // Layout helpers
  getMaxChatPanelWidth: (viewportWidth: number) => number;
  saveLayoutPreferences: () => void;
  loadLayoutPreferences: () => Promise<void>;
  // Command palette
  showCommandPalette: boolean;
  setShowCommandPalette: (show: boolean) => void;
  // Loading overlay
  showLoading: boolean;
  loadingMessage: string;
  setLoading: (show: boolean, message?: string) => void;
  // Settings panel
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  settingsTab: string;
  setSettingsTab: (tab: string) => void;
}

export const uiSettingsSliceCreator = (
  set: SetState<UISettingsState>,
  get: GetState<UISettingsState>,
): UISettingsState => ({
  showWelcome: true,
  setShowWelcome: (show) => set({ showWelcome: show }),

  sidebarWidth: 240,
  setSidebarWidth: (width) => set({ sidebarWidth: Math.max(180, Math.min(600, width)) }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  sidebarHidden: false,
  setSidebarHidden: (hidden) => set({ sidebarHidden: hidden }),

  chatPanelWidth: 384,
  setChatPanelWidth: (width) => set({ chatPanelWidth: Math.max(280, width) }),

  chatPanelCollapsed: false,
  setChatPanelCollapsed: (collapsed) => set({ chatPanelCollapsed: collapsed }),


  getMaxChatPanelWidth: (viewportWidth: number) => {
    const { sidebarHidden, sidebarCollapsed, sidebarWidth } = get();
    const sidebarSpace = sidebarHidden ? 0 : sidebarCollapsed ? 16 : sidebarWidth + 4;
    return Math.max(400, viewportWidth - sidebarSpace - 4);
  },

  saveLayoutPreferences: () => {
    const state = get();
    const layout = {
      sidebarWidth: state.sidebarWidth,
      sidebarCollapsed: state.sidebarCollapsed,
      sidebarHidden: state.sidebarHidden,
      chatPanelWidth: state.chatPanelWidth,
      chatPanelCollapsed: state.chatPanelCollapsed,
    };
    localStorage.setItem('layout_prefs', JSON.stringify(layout));
  },

  loadLayoutPreferences: async () => {
    try {
      const saved = localStorage.getItem('layout_prefs');
      if (saved) {
        const layout = JSON.parse(saved);
        set({
          sidebarWidth: layout.sidebarWidth ?? 240,
          sidebarCollapsed: layout.sidebarCollapsed ?? false,
          sidebarHidden: layout.sidebarHidden ?? false,
          chatPanelWidth: layout.chatPanelWidth ?? 384,
          chatPanelCollapsed: layout.chatPanelCollapsed ?? false,
        });
      }
    } catch (err) {
      console.error('Failed to load layout preferences:', err);
    }
  },

  showCommandPalette: false,
  setShowCommandPalette: (show) => set({ showCommandPalette: show }),

  showLoading: false,
  loadingMessage: '',
  setLoading: (show, message = '') => set({ showLoading: show, loadingMessage: message }),

  showSettings: false,
  setShowSettings: (show) => set({ showSettings: show }),

  settingsTab: 'general',
  setSettingsTab: (tab) => set({ settingsTab: tab }),

});

export const useUISettingsStore = create<UISettingsState>(
  (set, get) => uiSettingsSliceCreator(set, get),
);

export default useUISettingsStore;
