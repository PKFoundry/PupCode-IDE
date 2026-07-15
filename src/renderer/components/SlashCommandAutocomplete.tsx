import { useState, useEffect, useRef } from 'react';
import useAppStore from '../store/useAppStore';

interface SlashCommandAutocompleteProps {
  inputText: string;
  onSelect: (command: string) => void;
  onClose: () => void;
}

function SlashCommandAutocomplete({ inputText, onSelect, onClose }: SlashCommandAutocompleteProps) {
  const { slashCommands, loadSlashCommands } = useAppStore();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showing, setShowing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Check if user is typing a slash command
  useEffect(() => {
    const match = inputText.match(/\/(\w*)$/);
    if (match) {
      setShowing(true);
      setSelectedIndex(0);
      if (slashCommands.length === 0) {
        loadSlashCommands();
      }
    } else {
      setShowing(false);
    }
  }, [inputText, slashCommands.length, loadSlashCommands]);

  // Filter commands by current prefix
  const prefix = (inputText.match(/\/(\w*)$/) || [])[1] || '';
  const filtered = prefix
    ? slashCommands.filter((cmd) =>
        cmd.name.toLowerCase().includes(prefix.toLowerCase()) ||
        cmd.description.toLowerCase().includes(prefix.toLowerCase())
      )
    : slashCommands;

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showing || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex].name);
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!showing || filtered.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 mb-2 w-72 bg-bg-primary border border-border rounded-lg shadow-xl overflow-hidden z-10 animate-fade-in"
      onKeyDown={handleKeyDown}
    >
      <div className="max-h-48 overflow-y-auto py-1">
        {filtered.slice(0, 8).map((cmd, index) => (
          <button
            key={cmd.name}
            className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
              index === selectedIndex ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:bg-bg-hover'
            }`}
            onMouseEnter={() => setSelectedIndex(index)}
            onClick={() => onSelect(cmd.name)}
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-mono">{cmd.name}</span>
              <span className="text-[10px] text-text-muted truncate">{cmd.description}</span>
            </div>
            <span className="text-[10px] text-text-muted px-1.5 py-0.5 rounded bg-bg-secondary ml-2 flex-shrink-0">
              {cmd.category}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-1 border-t border-border text-[10px] text-text-muted">
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
      </div>
    </div>
  );
}

export default SlashCommandAutocomplete;
