import { Trash2, CornerDownLeft } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { useChatInput } from '../hooks/useChatInput';
import MessageList from './MessageList';
import ChatInput from './ChatInput';
import AttachmentStrip from './AttachmentStrip';

function ChatPanel() {
  const {
    messages, isStreaming, activeSubAgent, sendMessage, executeCommand,
    chatPanelWidth, pendingAttachments, addPendingAttachment, removePendingAttachment,
  } = useAppStore();

  const chatInput = useChatInput({
    isStreaming,
    sendMessage,
    executeCommand,
    addPendingAttachment,
    pendingAttachments,
  });

  return (
    <div
      className="flex flex-col bg-bg-primary border-l border-border"
      style={{ width: chatPanelWidth, minWidth: 280, flexShrink: 0 }}
    >
      {/* Header */}
      <div className="h-10 flex items-center justify-between px-3 border-b border-border">
        <span className="text-sm font-semibold text-text-primary flex items-center gap-2">
          <CornerDownLeft className="w-4 h-4" /> Chat
        </span>
        <button
          onClick={() => useAppStore.getState().clearMessages()}
          className="p-1 rounded hover:bg-bg-hover text-text-muted transition-colors"
          title="Clear chat"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        isStreaming={isStreaming}
        activeSubAgent={activeSubAgent}
        messagesEndRef={chatInput.messagesEndRef}
      />

      {/* Input */}
      <div className="border-t border-border p-3">
        <ChatInput
          input={chatInput.input}
          setInput={chatInput.setInput}
          showSlash={chatInput.showSlash}
          setShowSlash={chatInput.setShowSlash}
          isStreaming={isStreaming}
          inputRef={chatInput.inputRef}
          handleKeyDown={chatInput.handleKeyDown}
          handlePaste={chatInput.handlePaste}
          handleSend={chatInput.handleSend}
          handleSlashSelect={chatInput.handleSlashSelect}
        />

        {/* Attachment Preview Strip */}
        <AttachmentStrip
          attachments={pendingAttachments}
          onRemove={removePendingAttachment}
        />

        <p className="text-[10px] text-text-muted mt-1.5">
          Shift+Enter for newline • Enter to send • / for commands • Ctrl+V to paste images
        </p>
      </div>
    </div>
  );
}

export default ChatPanel;
