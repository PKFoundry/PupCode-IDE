import { useState, useEffect } from 'react';
import { Check, Download, Upload, Trash2, Palette, Eye, Check as CheckIcon, EyeOff } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { getPresetThemes, loadThemePrefs, getThemeColors, DEFAULT_THEME, validateThemeColors, ThemeColors } from '../../services/themeService';
import { listSavedThemes, loadSavedTheme, saveThemeToDisk, deleteThemeFromDisk } from '../../services/themeService';
import type { ThemeColors as ThemeColorsType } from '../../services/themeService';

// Minimal ThemeBuilder component (inline placeholder)
function ThemeBuilder({ onClose, initialTheme, initialName, onSave }: {
  onClose: () => void;
  initialTheme: ThemeColors;
  initialName: string;
  onSave: (name: string, colors: ThemeColors) => void;
}) {
  const [colors, setColors] = useState<ThemeColors>({ ...initialTheme });
  const [name, setName] = useState(initialName);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set(Object.keys(colors)));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative w-full max-w-3xl h-[85vh] bg-bg-primary border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-text-primary">Theme Builder</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted">
            <span className="text-lg"></span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary" />
          {Object.entries(colors).map(([key, value]) => (
            <div key={key} className="flex items-center gap-2">
              <button onClick={() => {
                const next = new Set(visibleKeys);
                if (next.has(key)) next.delete(key); else next.add(key);
                setVisibleKeys(next);
              }} className="p-1 rounded hover:bg-bg-hover text-text-muted">
                {visibleKeys.has(key) ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              {visibleKeys.has(key) && (
                <>
                  <span className="w-24 text-[10px] text-text-muted font-mono">{key}</span>
                  <input type="color" value={value} onChange={(e) => setColors({ ...colors, [key]: e.target.value })}
                    className="w-6 h-6 p-0 rounded cursor-pointer border border-border" />
                  <span className="text-xs font-mono text-text-primary">{value}</span>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-border rounded text-text-muted hover:text-text-primary">
            Cancel
          </button>
          <button onClick={() => onSave(name, colors)} className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover">
            Save Theme
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsAppearance() {
  const { activeTheme, setActiveTheme, availableThemes, refreshThemes, saveCustomTheme, deleteCustomTheme, exportTheme, importTheme, customThemes } = useAppStore();
  const presets = getPresetThemes();
  const presetNames = Object.keys(presets);
  const [themeRefreshTick, setThemeRefreshTick] = useState(0);
  const [showImport, setShowImport] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; theme: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { refreshThemes(); }, [refreshThemes]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('click', handler);
    window.addEventListener('contextmenu', handler);
    return () => {
      window.removeEventListener('click', handler);
      window.removeEventListener('contextmenu', handler);
    };
  }, [ctxMenu]);

  const handleImport = () => {
    setImportError('');
    setImportSuccess('');
    const result = importTheme(importJson);
    if (!result) {
      setImportError('Invalid theme JSON. Ensure it has "name" and "colors" with all 21 tokens.');
      return;
    }
    saveCustomTheme(result.name, result.colors);
    setImportSuccess(`Theme "${result.name}" imported and activated.`);
    setImportJson('');
    setTimeout(() => setShowImport(false), 1500);
  };

  const handleExport = (name: string) => {
    const json = exportTheme(name);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteCustom = async (name: string) => {
    try {
      await deleteCustomTheme(name);
      setThemeRefreshTick(t => t + 1);
    } catch (e) {
      console.error('Failed to delete theme:', e);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Preset Themes */}
      <div>
        <h3 className="text-sm font-semibold text-text-primary mb-3">Preset Themes</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {presetNames.map(name => {
            const theme = presets[name];
            const isActive = activeTheme === name;
            return (
              <button
                key={name}
                onClick={() => setActiveTheme(name)}
                className={`relative rounded-lg border-2 overflow-hidden transition-all ${
                  isActive
                    ? 'border-accent ring-2 ring-accent/20'
                    : 'border-border hover:border-text-muted'
                }`}
              >
                {/* Color swatch preview */}
                <div className="h-12 flex flex-col">
                  <div className="flex-1" style={{ backgroundColor: theme['bg-primary'] }} />
                  <div className="h-3" style={{ backgroundColor: theme['accent'] }} />
                </div>
                <div className="px-2 py-1.5 text-center bg-bg-secondary">
                  <span className={`text-xs font-medium ${isActive ? 'text-accent' : 'text-text-primary'}`}>
                    {name}
                  </span>
                </div>
                {isActive && (
                  <div className="absolute top-1 right-1 w-4 h-4 bg-accent rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Themes */}
      {Object.keys(customThemes).length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-text-primary mb-3">Custom Themes</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(customThemes).map(([name, theme]) => {
              const isActive = activeTheme === name;
              return (
                <div key={name} className="relative" onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setCtxMenu({ x: e.clientX, y: e.clientY, theme: name });
                }}>
                  <button
                    onClick={() => setActiveTheme(name)}
                    className={`w-full rounded-lg border-2 overflow-hidden transition-all ${
                      isActive
                        ? 'border-accent ring-2 ring-accent/20'
                        : 'border-border hover:border-text-muted'
                    }`}
                  >
                    <div className="h-12 flex flex-col">
                      <div className="flex-1" style={{ backgroundColor: theme['bg-primary'] }} />
                      <div className="h-3" style={{ backgroundColor: theme['accent'] }} />
                    </div>
                    <div className="px-2 py-1.5 text-center bg-bg-secondary">
                      <span className={`text-xs font-medium ${isActive ? 'text-accent' : 'text-text-primary'}`}>
                        {name}
                      </span>
                    </div>
                  </button>
                  {isActive && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-accent rounded-full flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                  {/* Action buttons */}
                  <div className="absolute top-0 left-0 flex gap-0.5 opacity-0 hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleExport(name); }}
                      className="p-1 bg-bg-secondary/90 rounded-br text-[10px] text-text-muted hover:text-text-primary"
                      title="Export"
                    >
                      Export
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteCustom(name); }}
                      className="p-1 bg-red-500/90 rounded-br text-[10px] text-white hover:text-red-200"
                      title="Delete"
                    >
                      Del
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Context Menu */}
      {ctxMenu && !deleteConfirm && (
        <div
          className="fixed z-50 min-w-[120px] py-1 rounded-lg border border-border bg-bg-secondary shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={() => {
              handleExport(ctxMenu.theme);
              setCtxMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-text-primary hover:bg-bg-hover transition-colors"
          >
            Export
          </button>
          <button
            onClick={() => {
              setDeleteConfirm(ctxMenu.theme);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-error hover:bg-red-500/10 transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div
          className="fixed z-50 min-w-[200px] py-1 rounded-lg border border-border bg-bg-secondary shadow-xl"
          style={{ left: ctxMenu?.x, top: ctxMenu?.y }}
        >
          <p className="px-3 py-1 text-xs text-text-primary">Delete "{deleteConfirm}"?</p>
          <button
            onClick={async () => {
              await handleDeleteCustom(deleteConfirm);
              setDeleteConfirm(null);
              setCtxMenu(null);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-error hover:bg-red-500/10 transition-colors"
          >
            Yes, delete
          </button>
          <button
            onClick={() => setDeleteConfirm(null)}
            className="w-full px-3 py-1.5 text-left text-xs text-text-muted hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        {!showImport ? (
          <>
            <button
              onClick={() => setShowBuilder(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30 transition-colors"
            >
              Theme Builder
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-primary transition-colors"
            >
              Import JSON
            </button>
            <button
              onClick={() => handleExport(activeTheme)}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text-primary transition-colors"
            >
              Export Active
            </button>
          </>
        ) : (
          <div className="flex-1 space-y-3">
            <textarea
              value={importJson}
              onChange={(e) => setImportJson(e.target.value)}
              placeholder='Paste theme JSON here...'
              rows={4}
              className="w-full px-3 py-2 text-xs bg-bg-primary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent resize-none"
            />
            {importError && <p className="text-xs text-error">{importError}</p>}
            {importSuccess && <p className="text-xs text-success">{importSuccess}</p>}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                className="px-3 py-1.5 text-xs bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors"
              >
                Import
              </button>
              <button
                onClick={() => { setShowImport(false); setImportError(''); setImportSuccess(''); setImportJson(''); }}
                className="px-3 py-1.5 text-xs border border-border text-text-muted rounded-lg hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Theme Builder Modal */}
      {showBuilder && (
        <ThemeBuilder
          onClose={() => setShowBuilder(false)}
          initialTheme={getThemeColors(activeTheme) || DEFAULT_THEME}
          initialName={activeTheme}
          onSave={async (name, colors) => { await saveCustomTheme(name, colors); setThemeRefreshTick(t => t + 1); }}
        />
      )}
    </div>
  );
}
