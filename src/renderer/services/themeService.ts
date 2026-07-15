// =============================================================================
// Theme Service
// =============================================================================

import { getSidecarClient } from './sidecar';

export interface ThemeColors {
  // Backgrounds
  'bg-primary': string;
  'bg-secondary': string;
  'bg-tertiary': string;
  'bg-hover': string;

  // Text
  'text-primary': string;
  'text-secondary': string;
  'text-muted': string;

  // Accent
  'accent': string;
  'accent-hover': string;
  'accent-muted': string;

  // Borders
  'border': string;
  'border-muted': string;

  // Status
  'success': string;
  'warning': string;
  'error': string;

  // UI Extras
  'scrollbar-thumb': string;
  'scrollbar-hover': string;
  'selection-bg': string;
  'color-scheme': string;
}

export interface ThemePrefs {
  active: string;
  custom: Record<string, ThemeColors>;
}

const STORAGE_KEY = 'theme_prefs';

// Default theme - matches current hardcoded colors exactly
export const DEFAULT_THEME: ThemeColors = {
  'bg-primary': '#1e1e2e',
  'bg-secondary': '#252536',
  'bg-tertiary': '#2d2d44',
  'bg-hover': '#33334d',
  'text-primary': '#e4e4e7',
  'text-secondary': '#a1a1aa',
  'text-muted': '#71717a',
  'accent': '#7c6ff7',
  'accent-hover': '#6b5ce7',
  'accent-muted': '#5a4fd4',
  'border': '#3f3f5a',
  'border-muted': '#2d2d44',
  'success': '#4ade80',
  'warning': '#fbbf24',
  'error': '#f87171',
  'scrollbar-thumb': '#3f3f5a',
  'scrollbar-hover': '#5a5a7a',
  'selection-bg': '#7c6ff744',
  'color-scheme': 'dark',
};

// Preset themes
const PRESET_THEMES: Record<string, ThemeColors> = {
  'Default': DEFAULT_THEME,
  'Light': {
    'bg-primary': '#ffffff',
    'bg-secondary': '#f5f5f5',
    'bg-tertiary': '#e8e8e8',
    'bg-hover': '#e0e0e0',
    'text-primary': '#1a1a2e',
    'text-secondary': '#4a4a5a',
    'text-muted': '#8a8a9a',
    'accent': '#6c5ce7',
    'accent-hover': '#5a4bd6',
    'accent-muted': '#7c6ff7',
    'border': '#d4d4dc',
    'border-muted': '#e8e8e8',
    'success': '#22c55e',
    'warning': '#f59e0b',
    'error': '#ef4444',
    'scrollbar-thumb': '#c4c4cc',
    'scrollbar-hover': '#a4a4ac',
    'selection-bg': '#6c5ce744',
    'color-scheme': 'light',
  },
  'High Contrast': {
    'bg-primary': '#000000',
    'bg-secondary': '#111111',
    'bg-tertiary': '#1a1a1a',
    'bg-hover': '#222222',
    'text-primary': '#ffffff',
    'text-secondary': '#cccccc',
    'text-muted': '#999999',
    'accent': '#00d4ff',
    'accent-hover': '#00b8e6',
    'accent-muted': '#0099cc',
    'border': '#444444',
    'border-muted': '#222222',
    'success': '#00ff00',
    'warning': '#ffff00',
    'error': '#ff0000',
    'scrollbar-thumb': '#444444',
    'scrollbar-hover': '#666666',
    'selection-bg': '#00d4ff44',
    'color-scheme': 'dark',
  },
  'Nord': {
    'bg-primary': '#2e3440',
    'bg-secondary': '#3b4252',
    'bg-tertiary': '#434c5e',
    'bg-hover': '#4c566a',
    'text-primary': '#eceff4',
    'text-secondary': '#d8dee9',
    'text-muted': '#7b88a1',
    'accent': '#88c0d0',
    'accent-hover': '#81a2be',
    'accent-muted': '#5e81ac',
    'border': '#4c566a',
    'border-muted': '#3b4252',
    'success': '#a3be8c',
    'warning': '#ebcb8b',
    'error': '#bf616a',
    'scrollbar-thumb': '#4c566a',
    'scrollbar-hover': '#434c5e',
    'selection-bg': '#88c0d044',
    'color-scheme': 'dark',
  },
  'Catppuccin': {
    'bg-primary': '#1e1e2e',
    'bg-secondary': '#313244',
    'bg-tertiary': '#45475a',
    'bg-hover': '#585b70',
    'text-primary': '#cdd6f4',
    'text-secondary': '#bac2de',
    'text-muted': '#6c7086',
    'accent': '#cba6f7',
    'accent-hover': '#b4befe',
    'accent-muted': '#89b4fa',
    'border': '#585b70',
    'border-muted': '#313244',
    'success': '#a6e3a1',
    'warning': '#f9e2af',
    'error': '#f38ba8',
    'scrollbar-thumb': '#585b70',
    'scrollbar-hover': '#6c7086',
    'selection-bg': '#cba6f744',
    'color-scheme': 'dark',
  },
};

/**
 * Apply theme colors to CSS variables on document root.
 */
export function applyTheme(colors: ThemeColors): void {
  const root = document.documentElement.style;
  Object.entries(colors).forEach(([key, value]) => {
    root.setProperty(`--${key}`, value);
  });
}

/**
 * Get all preset themes.
 */
export function getPresetThemes(): Record<string, ThemeColors> {
  return PRESET_THEMES;
}

/**
 * Get a specific preset theme by name.
 */
export function getPresetTheme(name: string): ThemeColors | null {
  return PRESET_THEMES[name] || null;
}

/**
 * Get the list of preset theme names.
 */
export function getPresetThemeNames(): string[] {
  return Object.keys(PRESET_THEMES);
}

/**
 * Load theme preferences from localStorage.
 */
export function loadThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        active: parsed.active || 'Default',
        custom: parsed.custom || {},
      };
    }
  } catch (e) {
    console.error('Failed to load theme prefs:', e);
  }
  return { active: 'Default', custom: {} };
}

/**
 * Save theme preferences to localStorage.
 */
export function saveThemePrefs(prefs: ThemePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save theme prefs:', e);
  }
}

/**
 * Load and apply the active theme.
 */
export function loadActiveTheme(): ThemeColors {
  const prefs = loadThemePrefs();
  const custom = prefs.custom[prefs.active];
  if (custom) return custom;
  return PRESET_THEMES[prefs.active] || DEFAULT_THEME;
}

/**
 * Activate a theme by name (preset or custom).
 */
export function activateTheme(name: string): void {
  const prefs = loadThemePrefs();
  prefs.active = name;
  saveThemePrefs(prefs);

  const colors = prefs.custom[name] || PRESET_THEMES[name] || DEFAULT_THEME;
  applyTheme(colors);
}

/**
 * Save a custom theme.
 */
export function saveCustomTheme(name: string, colors: ThemeColors): void {
  const prefs = loadThemePrefs();
  prefs.custom[name] = colors;
  saveThemePrefs(prefs);
}

/**
 * Delete a custom theme.
 */
export function deleteCustomTheme(name: string): void {
  const prefs = loadThemePrefs();
  delete prefs.custom[name];

  // If the deleted theme was active, switch to Default
  if (prefs.active === name) {
    prefs.active = 'Default';
    applyTheme(DEFAULT_THEME);
  }
  saveThemePrefs(prefs);
}

/**
 * Get all available themes (presets + custom).
 */
export function getAllThemeNames(): string[] {
  const prefs = loadThemePrefs();
  const customNames = Object.keys(prefs.custom);
  return [...Object.keys(PRESET_THEMES), ...customNames];
}

/**
 * Get theme colors by name (preset or custom).
 */
export function getThemeColors(name: string): ThemeColors | null {
  const prefs = loadThemePrefs();
  return prefs.custom[name] || PRESET_THEMES[name] || null;
}

/**
 * Validate that all required tokens are present and are valid hex colors.
 */
export function validateThemeColors(colors: Partial<ThemeColors>): boolean {
  const requiredKeys: (keyof ThemeColors)[] = [
    'bg-primary', 'bg-secondary', 'bg-tertiary', 'bg-hover',
    'text-primary', 'text-secondary', 'text-muted',
    'accent', 'accent-hover', 'accent-muted',
    'border', 'border-muted',
    'success', 'warning', 'error',
    'scrollbar-thumb', 'scrollbar-hover', 'selection-bg',
    'color-scheme',
  ];

  for (const key of requiredKeys) {
    const value = colors[key];
    if (value === undefined || value === null) return false;
    if (key === 'color-scheme') {
      if (value !== 'light' && value !== 'dark') return false;
    } else {
      // Allow hex colors with optional alpha (e.g., #7c6ff744)
      if (!/^#[0-9a-fA-F]{3,8}$/.test(value as string)) return false;
    }
  }
  return true;
}

/**
 * Export a theme as a JSON string.
 */
export function exportTheme(name: string): string | null {
  const colors = getThemeColors(name);
  if (!colors) return null;

  return JSON.stringify({
    '$schema': 'code-puppy-theme-v1',
    name,
    exportedAt: new Date().toISOString(),
    colors,
  }, null, 2);
}

/**
 * Import a theme from a JSON string. Returns the theme name on success.
 */
export function importTheme(json: string): { name: string; colors: ThemeColors } | null {
  try {
    const parsed = JSON.parse(json);
    if (!parsed.colors || !parsed.name) return null;
    if (!validateThemeColors(parsed.colors)) return null;

    return {
      name: parsed.name,
      colors: parsed.colors as ThemeColors,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Sidecar API Functions (file-based theme storage)
// =============================================================================

/**
 * Fetch the sidecar port from the app store.
 */
function getSidecarPort(): number | null {
  try {
    const store = (window as any).__appStore?.getState?.();
    return store?.sidecarPort || null;
  } catch {
    return null;
  }
}

/**
 * List all saved custom themes from disk.
 */
export async function listSavedThemes(sidecarPort: number): Promise<Array<{ name: string; file: string; author: string; createdAt: string }>> {
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.listThemes();
    return data.themes || [];
  } catch (e) {
    console.error('Failed to list themes:', e);
    return [];
  }
}

/**
 * Load a specific theme from disk.
 */
export async function loadSavedTheme(sidecarPort: number, filename: string): Promise<ThemeColors | null> {
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.getTheme(filename);
    if (data.colors && validateThemeColors(data.colors)) {
      return data.colors as ThemeColors;
    }
    return null;
  } catch (e) {
    console.error('Failed to load theme:', e);
    return null;
  }
}

/**
 * Save a custom theme to disk.
 */
export async function saveThemeToDisk(sidecarPort: number, name: string, colors: ThemeColors, author: string = ''): Promise<boolean> {
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.saveTheme({ name, colors, author });
    return data.success === true;
  } catch (e) {
    console.error('Failed to save theme:', e);
    return false;
  }
}

/**
 * Delete a custom theme from disk.
 */
export async function deleteThemeFromDisk(sidecarPort: number, filename: string): Promise<boolean> {
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.deleteTheme(filename);
    return data.success === true;
  } catch (e) {
    console.error('Failed to delete theme:', e);
    return false;
  }
}
