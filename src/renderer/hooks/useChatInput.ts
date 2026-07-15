import { useState, useRef, useEffect } from 'react';
import type { ChatAttachment } from '../types/session';

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_ATTACHMENTS = 4;

interface UseChatInputOptions {
  isStreaming: boolean;
  sendMessage: (content: string) => Promise<void>;
  executeCommand: (cmd: string, args?: string) => Promise<void>;
  addPendingAttachment: (att: ChatAttachment) => void;
  pendingAttachments: ChatAttachment[];
}

interface UseChatInputResult {
  input: string;
  setInput: (val: string) => void;
  showSlash: boolean;
  setShowSlash: (val: boolean) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  handleSend: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => Promise<void>;
  handleSlashSelect: (command: string) => void;
  handleInsertAtCursor: (text: string) => void;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function generateImageFilename(file: File): string {
  const ts = Date.now().toString(36);
  let baseName = file.name.replace(/\.[^.]+$/, '').trim();
  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  if (!baseName || /^image$/i.test(baseName) || /^picture$/i.test(baseName)) {
    baseName = 'screenshot';
  }
  baseName = baseName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase();
  return `${baseName}_${ts}.${ext}`;
}

export function useChatInput({
  isStreaming,
  sendMessage,
  executeCommand,
  addPendingAttachment,
  pendingAttachments,
}: UseChatInputOptions): UseChatInputResult {
  const [input, setInput] = useState('');
  const [showSlash, setShowSlash] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  });

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleInsertAtCursor = (text: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = input.slice(0, start);
    const after = input.slice(end);
    setInput(before + text + after);
    requestAnimationFrame(() => {
      const newPos = start + text.length;
      el.selectionStart = el.selectionEnd = newPos;
    });
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));

    if (imageItem) {
      const blob = imageItem.getAsFile();
      if (!blob) return;

      // Check size limit
      if (blob.size > MAX_ATTACHMENT_SIZE) {
        alert(`Image too large (${(blob.size / 1024 / 1024).toFixed(1)}MB). Max 10MB.`);
        return;
      }

      // Check attachment limit
      if (pendingAttachments.length >= MAX_ATTACHMENTS) {
        alert(`Maximum ${MAX_ATTACHMENTS} attachments per message.`);
        return;
      }

      e.preventDefault();

      try {
        const dataUri = await blobToBase64(blob);
        const filename = generateImageFilename(blob);

        addPendingAttachment({
          id: crypto.randomUUID(),
          name: filename,
          dataUri,
          mimeType: blob.type || 'image/png',
          size: blob.size,
        });

        handleInsertAtCursor(`[ ${filename}] `);
      } catch (err) {
        console.error('Failed to process pasted image:', err);
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput('');
    setShowSlash(false);

    // Check if it's a slash command
    if (text.startsWith('/')) {
      const parts = text.split(/\s+/, 2);
      const cmd = parts[0];
      const args = parts[1] || '';
      await executeCommand(cmd, args);
    } else {
      await sendMessage(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSlashSelect = (command: string) => {
    const newText = input.replace(/\/\w*$/, command + ' ');
    setInput(newText);
    setShowSlash(false);
    inputRef.current?.focus();
  };

  return {
    input,
    setInput,
    showSlash,
    setShowSlash,
    inputRef,
    messagesEndRef,
    handleSend,
    handleKeyDown,
    handlePaste,
    handleSlashSelect,
    handleInsertAtCursor,
  };
}
