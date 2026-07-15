import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Command, Settings, Bot, Zap, Trash2, HelpCircle, Server, Mic, Eye } from 'lucide-react';
import useAppStore from '../store/useAppStore';

interface PaletteCommand {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  category?: string;
}

const BUILTIN_COMMANDS: PaletteCommand[] = [
  { id: 'settings', label: 'Open Settings', icon: Settings, shortcut: 'Ctrl+,' },
  { id: 'voice', label: 'Toggle Voice Recording', icon: Mic, shortcut: 'Ctrl+M' },
  { id: 'clear-chat', label: 'Clear Chat', icon: Trash2 },
  { id: 'markdown-preview', label: 'Toggle Markdown Preview', icon: Eye, shortcut: 'Ctrl+Shift+V' },
  { id: 'switch-model', label: 'Switch Model', icon: Zap },
  { id: 'switch-agent', label: 'Switch Agent', icon: Bot },
  { id: 'refresh-files', label: 'Refresh File Tree', icon: Search },
  { id: 'help', label: 'Help & About', icon: HelpCircle },
];

function getIconForCategory(category: string): React.ComponentType<{ className?: string }> {
  switch (category) {
    case 'model': return Zap;
    case 'agent': return Bot;
    case 'chat': return Trash2;
    case 'mcp': return Server;
    case 'system': return Settings;
    case 'custom': return Command;
    default: return Command;
  }
}

function CommandPalette() {
  const { showCommandPalette, setShowCommandPalette, slashCommands, loadSlashCommands } = useAppStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (showCommandPalette && !loaded) {
      loadSlashCommands();
      setLoaded(true);
    }
  }, [showCommandPalette, loaded, loadSlashCommands]);

  useEffect(() => {
    if (showCommandPalette) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [showCommandPalette]);

  const allCommands: PaletteCommand[] = [
    ...BUILTIN_COMMANDS,
    ...slashCommands.map((cmd) => ({
      id: `slash:${cmd.name}`,
      label: `${cmd.name} — ${cmd.description}`,
      icon: getIconForCategory(cmd.category),
      category: cmd.category,
    })),
  ];

  const filtered = query
    ? allCommands.filter((cmd) => cmd.label.toLowerCase().includes(query.toLowerCase()))
    : allCommands;

  const executeCommand = useCallback((id: string) => {
    setShowCommandPalette(false);
    const store = useAppStore.getState();
    switch (id) {
      case 'settings': store.setShowSettings(true); break;
      case 'voice': store.toggleVoiceRecording(); break;
      case 'clear-chat': store.clearMessages(); break;
      case 'markdown-preview': {
        const activeTab = store.activeTab;
        if (activeTab?.endsWith('.md')) {
          const tab = store.editorTabs.find(t => t.path === activeTab);
          store.setTabViewMode(activeTab, tab?.viewMode === 'preview' ? 'raw' : 'preview');
        }
        break;
      }
      case 'switch-model': store.setShowSettings(true); store.setSettingsTab('models'); break;
      case 'switch-agent': store.setShowSettings(true); store.setSettingsTab('agents'); break;
      case 'refresh-files': store.refreshFileTree(); break;
      case 'help': store.setShowSettings(true); store.setSettingsTab('general'); break;
      default:
        if (id.startsWith('slash:')) store.executeCommand(id.slice(6));
    }
  }, [setShowCommandPalette]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[selectedIndex]) executeCommand(filtered[selectedIndex].id); }
    else if (e.key === 'Escape') { e.preventDefault(); setShowCommandPalette(false); }
  };

  if (!showCommandPalette) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]" onClick={() => setShowCommandPalette(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-bg-primary border border-border rounded-xl shadow-2xl overflow-hidden animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-text-primary text-sm placeholder-text-muted focus:outline-none"
          />
          <kbd className="text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border">ESC</kbd>
        </div>

        {/* Command List */}
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-text-muted text-sm">No commands found</div>
          ) : (
            filtered.map((cmd, index) => {
              const Icon = cmd.icon || Command;
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={cmd.id}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isSelected ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-bg-hover'
                  }`}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => executeCommand(cmd.id)}
                >
                  <Icon className="w-4 h-4 flex-shrink-0 opacity-70" />
                  <span className="flex-1 text-sm truncate">{cmd.label}</span>
                  {cmd.shortcut && (
                    <kbd className="text-[10px] text-text-muted bg-bg-secondary px-1.5 py-0.5 rounded border border-border ml-2">
                      {cmd.shortcut}
                    </kbd>
                  )}
                  {cmd.category && (
                    <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-secondary">
                      {cmd.category}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[10px] text-text-muted">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
          <span>{filtered.length} commands</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
