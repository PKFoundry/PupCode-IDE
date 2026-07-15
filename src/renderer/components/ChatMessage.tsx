import { useState } from 'react';
import { Copy } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '../store/useChatStore';
import type { ContextMenuItem } from './ContextMenu';
import ContextMenu from './ContextMenu';
import ChatMarkdown from './ChatMarkdown';
import ToolCallMessage from './ToolCallMessage';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming: boolean;
}

export default function ChatMessage({ message, isStreaming }: ChatMessageProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const contextItems: ContextMenuItem[] = [
    { id: 'copy', label: 'Copy Message', icon: <Copy className="w-3.5 h-3.5" />, onClick: handleCopy },
  ];

  if (message.type === 'assistant') {
    contextItems.push({ id: 'copy-md', label: 'Copy as Markdown', icon: <Copy className="w-3.5 h-3.5" />, onClick: handleCopy });
  }

  return (
    <>
      {message.type === 'user' && (
        <div className="flex justify-end animate-fade-in" onContextMenu={handleContextMenu}>
          <div className="max-w-[85%] bg-accent/20 text-accent rounded-lg rounded-br-sm px-3 py-2 text-sm">
            {message.content}
          </div>
        </div>
      )}

      {message.type === 'assistant' && (
        <div className="flex gap-2 animate-fade-in" onContextMenu={handleContextMenu}>
          <span className="text-sm flex-shrink-0 mt-0.5"></span>
          <div className="max-w-[85%] bg-bg-secondary rounded-lg rounded-bl-sm px-3 py-2 text-sm">
            {message.content ? (
              <ChatMarkdown content={message.content} isStreaming={isStreaming} />
            ) : (
              <span className="text-text-muted">Loading...</span>
            )}
          </div>
        </div>
      )}

      {message.type === 'tool_call' && (
        <ToolCallMessage message={message} onContextMenu={handleContextMenu} />
      )}

      {message.type === 'error' && (
        <div className="flex gap-2 animate-fade-in" onContextMenu={handleContextMenu}>
          <span className="text-sm flex-shrink-0 mt-0.5"></span>
          <div className="max-w-[85%] bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
            {message.content}
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu items={contextItems} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
    </>
  );
}
