import { Loader2 } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from '../store/useChatStore';
import { formatAgentName } from './ToolCallMessage';
import ChatMessage from './ChatMessage';

interface MessageListProps {
  messages: ChatMessageType[];
  isStreaming: boolean;
  activeSubAgent: string | null;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export default function MessageList({ messages, isStreaming, activeSubAgent, messagesEndRef }: MessageListProps) {
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-center text-text-muted">
          <span className="text-4xl mb-3">🐶</span>
          <p className="text-sm font-medium">Start a conversation</p>
          <p className="text-xs mt-1 max-w-[240px]">
            Ask Code Puppy to help you write, edit, or debug code.
          </p>
        </div>
      ) : (
        messages.map((msg) => <ChatMessage key={msg.id} message={msg} isStreaming={isStreaming} />)
      )}

      {isStreaming && (
        <div className="flex items-center gap-2 text-text-muted text-xs animate-pulse-slow">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>
            {activeSubAgent
              ? `Code Puppy is thinking... (running ${formatAgentName(activeSubAgent)})`
              : 'Code Puppy is thinking...'}
          </span>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
