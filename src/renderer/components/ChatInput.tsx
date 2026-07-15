import { Send, Loader2 } from 'lucide-react';
import MicButton from './MicButton';
import SlashCommandAutocomplete from './SlashCommandAutocomplete';

interface ChatInputProps {
  input: string;
  setInput: (val: string) => void;
  showSlash: boolean;
  setShowSlash: (val: boolean) => void;
  isStreaming: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  handleSend: () => Promise<void>;
  handleSlashSelect: (command: string) => void;
}

export default function ChatInput({
  input, setInput, showSlash, setShowSlash, isStreaming,
  inputRef, handleKeyDown, handlePaste, handleSend, handleSlashSelect,
}: ChatInputProps) {
  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => { setInput(e.target.value); setShowSlash(e.target.value.includes('/')); }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onBlur={() => setTimeout(() => setShowSlash(false), 200)}
        onFocus={() => { if (input.includes('/')) setShowSlash(true); }}
        placeholder={isStreaming ? 'Code Puppy is thinking...' : 'Ask Code Puppy anything...'}
        rows={3}
        className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 pr-10 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
      />
      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        <MicButton />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isStreaming}
          className="p-1.5 rounded-md bg-accent hover:bg-accent-hover text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>

      {/* Slash Command Autocomplete */}
      {showSlash && (
        <SlashCommandAutocomplete
          inputText={input}
          onSelect={handleSlashSelect}
          onClose={() => setShowSlash(false)}
        />
      )}
    </div>
  );
}
