import type { AppState } from './useAppStore';
import type { SetState, GetState } from 'zustand';
import type { ChatAttachment } from '../types/session';
import { getSidecarClient } from '../services/sidecar';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'tool_call' | 'error';
  content: string;
  timestamp: number;
  tool_name?: string;
  tool_args?: Record<string, any>;
  tool_status?: string;
  tool_result_summary?: string;
  tool_duration_ms?: number;
  tool_call_id?: string;
  usage?: Record<string, number>;
}

/** One entry on the sub-agent call stack, paired by tool_call_id. */
export interface SubAgentEntry {
  name: string;
  tool_call_id: string;
}

export type ChatSlice = Pick<AppState,
  'messages' | 'isStreaming' | '_messagesTrimmed' | 'pendingAttachments' | '_chatWebSocket' |
  'addMessage' | 'clearMessages' | 'setIsStreaming' | 'sendMessage' |
  'addPendingAttachment' | 'removePendingAttachment' | 'clearPendingAttachments' |
  'activeSubAgent' | 'subAgentStack' | 'pushSubAgent' | 'popSubAgent'
>;

export const chatSliceCreator = (set: SetState<AppState>, get: GetState<AppState>): ChatSlice => ({
messages: [],
isStreaming: false,
_messagesTrimmed: false,

// Sub-agent tracking for dynamic thinking label
activeSubAgent: null as string | null,
subAgentStack: [] as SubAgentEntry[],
pushSubAgent: (name: string, toolCallId: string) => set((state) => ({
  activeSubAgent: name,
  subAgentStack: [...state.subAgentStack, { name, tool_call_id: toolCallId }],
})),
popSubAgent: (toolCallId: string) => set((state) => {
  // Only pop if the top-of-stack entry matches this tool_call_id
  const top = state.subAgentStack[state.subAgentStack.length - 1];
  if (!top || top.tool_call_id !== toolCallId) {
    // No matching entry (e.g. push was skipped due to missing agent_name)
    return state;
  }
  const newStack = state.subAgentStack.slice(0, -1);
  return {
    subAgentStack: newStack,
    activeSubAgent: newStack.length > 0 ? newStack[newStack.length - 1].name : null,
  };
}),

addMessage: (msg) => set((state) => {
  const MAX_MESSAGES = 500;
  const newMessages = [...state.messages, msg];
  if (newMessages.length > MAX_MESSAGES) {
    return {
      messages: newMessages.slice(newMessages.length - MAX_MESSAGES),
      _messagesTrimmed: true,
    };
  }
  return { messages: newMessages };
}),
clearMessages: () => set({ messages: [], _messagesTrimmed: false }),
setIsStreaming: (streaming) => set({ isStreaming: streaming }),

// Chat Attachments
pendingAttachments: [],
addPendingAttachment: (attachment) => set((state) => ({
  pendingAttachments: [...state.pendingAttachments, attachment],
})),
removePendingAttachment: (id) => set((state) => ({
  pendingAttachments: state.pendingAttachments.filter(a => a.id !== id),
})),
_chatWebSocket: null as WebSocket | null,
  clearPendingAttachments: () => set({ pendingAttachments: [] }),
sendMessage: async (content: string) => {
  const { sidecarPort } = get();
  if (!sidecarPort) return;

  // Close existing chat WebSocket to prevent connection leaks
  const existingWs = get()._chatWebSocket;
  if (existingWs && existingWs.readyState === WebSocket.OPEN) {
    existingWs.close();
  }

  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    type: 'user',
    content,
    timestamp: Date.now(),
  };
  get().addMessage(userMsg);
  get().setIsStreaming(true);

  const client = getSidecarClient(sidecarPort);
  const ws = new WebSocket(client.getChatWebSocketUrl());
  set({ _chatWebSocket: ws });
  const session_id = `session-${Date.now()}`;

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: 'subscribe', session_id }));

    // Build attachment payloads from in-memory base64 data
    const { pendingAttachments } = get();
    const attachments = pendingAttachments.map(a => ({
      filename: a.name,
      mimeType: a.mimeType,
      data: a.dataUri.split(',')[1], // strip "data:image/png;base64," prefix
    }));

    ws.send(JSON.stringify({ type: 'user_message', content, session_id, attachments }));
    get().clearPendingAttachments();
  };

  let assistantContent = '';
  let assistantMsgId = `msg-${Date.now() + 1}`;
  let isFirstToken = true;
  let lastTokenTime = Date.now();
  let lastToolTime = 0;
  let needsNewAssistantMsg = false; // deferred: create new msg only when tokens arrive

  /** Finalize the current assistant message. */
  const finalizeAssistantMessage = () => {
    if (assistantContent.trim()) {
      set((state) => {
        const msgs = [...state.messages];
        const idx = msgs.findIndex((m) => m.id === assistantMsgId);
        if (idx >= 0) {
          msgs[idx] = { ...msgs[idx], content: assistantContent.trim(), timestamp: Date.now() };
        }
        return { messages: msgs };
      });
    }
    assistantContent = '';
    isFirstToken = true;
  };

  // Track pending tool calls so we can match start → complete
  const pendingToolCalls: Array<{
    id: string;
    tool_name: string;
    tool_args: Record<string, any>;
    tool_call_id?: string;
  }> = [];

  const timeoutCheck = setInterval(() => {
    if (!get().isStreaming) {
      clearInterval(timeoutCheck);
      return;
    }
    const idleMs = Date.now() - lastTokenTime;
    // Extend timeout if tools were recently active (within last 60s)
    const effectiveTimeout = (Date.now() - lastToolTime < 60000) ? 180000 : 60000;
    if (idleMs > effectiveTimeout) {
      clearInterval(timeoutCheck);
      ws.close();
      get().setIsStreaming(false);
      // Clear sub-agent state on timeout
      set({ activeSubAgent: null, subAgentStack: [] });
      get().addMessage({
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'Connection timed out — the response may be incomplete.',
        timestamp: Date.now(),
      });
    }
  }, 5000);

  ws.onmessage = (event: MessageEvent) => {
    // ANY message from backend = it's still alive
    lastTokenTime = Date.now();

    try {
      const data = JSON.parse(event.data);
      const payload = data.data || {};

      // Debug: log all event types
      if (data.type && !['token', 'thinking_token'].includes(data.type)) {
        console.log('[WS Event]', data.type, payload);
      }

      // Tool call started — finalize current assistant text, then show tool call
      if (data.type === 'tool_call_start') {
        console.log('[TOOL START]', payload);
        lastTokenTime = Date.now();
        lastToolTime = Date.now();

        // Finalize any text that came before this tool call
        finalizeAssistantMessage();

        const tcId = payload.tool_call_id || `tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const toolMsg = {
          id: tcId,
          type: 'tool_call' as const,
          content: '',
          timestamp: Date.now(),
          tool_name: payload.tool_name || 'unknown',
          tool_args: payload.tool_args || {},
          tool_status: 'running' as const,
          tool_call_id: tcId,
        };
        pendingToolCalls.push({ id: tcId, tool_name: toolMsg.tool_name, tool_args: toolMsg.tool_args, tool_call_id: tcId });
        get().addMessage(toolMsg);

        // Track sub-agent invocations for dynamic thinking label
        if (['invoke_agent', 'invoke_agent_with_model'].includes(toolMsg.tool_name)) {
          const agentName = toolMsg.tool_args?.agent_name;
          if (agentName) {
            get().pushSubAgent(agentName, tcId);
          }
        }
        return;
      }

      // Tool call completed — find matching pending call by tool_call_id
      if (data.type === 'tool_call_complete') {
        lastTokenTime = Date.now();
        lastToolTime = Date.now();
        const completedId = payload.tool_call_id;
        const completedName = payload.tool_name;
        const completedArgs = payload.tool_args || {};

        // Find the matching pending tool call by tool_call_id first, fall back to name
        let matchIdx = completedId
          ? pendingToolCalls.findIndex(tc => tc.tool_call_id === completedId)
          : pendingToolCalls.findIndex(tc => tc.tool_name === completedName);

        let matched: { id: string; tool_name: string; tool_args: Record<string, any>; tool_call_id?: string } | undefined;
        if (matchIdx >= 0) {
          matched = pendingToolCalls.splice(matchIdx, 1)[0];
          const isSuccess = payload.success !== false; // default to success
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === matched!.id
                ? {
                    ...msg,
                    tool_status: isSuccess ? ('success' as const) : ('error' as const),
                    tool_result_summary: payload.result_summary || '',
                    tool_duration_ms: payload.duration_ms,
                  }
                : msg
            ),
          }));
        } else {
          console.warn('[TOOL COMPLETE] No matching pending call for:', completedId || completedName, payload);
        }

        // Pop sub-agent stack when sub-agent invocation completes.
        // Uses tool_call_id to ensure strict pairing with the push.
        if (matched && ['invoke_agent', 'invoke_agent_with_model'].includes(matched.tool_name)) {
          get().popSubAgent(completedId || matched.tool_call_id || '');
        }

        // Trigger file tree refresh for file-modifying tools
        const toolName = payload.tool_name;
        if (['create_file', 'replace_in_file', 'write_file_content'].includes(toolName)) {
          const fp = completedArgs?.file_path || completedArgs?.path;
          if (fp) {
            get().markFileModified(fp, true);
            get().refreshFileTree();
          }
        }

        // Prepare for the next assistant text segment after this tool call
        needsNewAssistantMsg = true;  // lazy: create only when tokens arrive
        return;
      }

      // Stream events — only handle text/thinking tokens now
      if (data.type === 'stream_event') {
        // No longer parse tool calls from stream events — use tool_call_start/complete instead
      }

      if (data.type === 'token') {
        lastTokenTime = Date.now();
        let token = payload.content || '';

        // Lazily create a new assistant message after tool calls
        if (needsNewAssistantMsg) {
          assistantMsgId = `msg-${Date.now() + Math.random().toString(36).slice(2, 6)}`;
          assistantContent = '';
          isFirstToken = true;
          needsNewAssistantMsg = false;
        }

        if (isFirstToken) {
          token = token.replace(/^\s+/, '');
          isFirstToken = false;
        }

        // Collapse runs of 3+ newlines into 2 (artifact of model formatting around tool calls)
        token = token.replace(/\n{3,}/g, '\n\n');

        assistantContent += token;
        
        if(!assistantContent.trim()) { 
          // Don't create/update message with empty content
          return;
        }

        set((state) => {
          const msgs = [...state.messages];
          let idx = msgs.findIndex((m) => m.id === assistantMsgId);
          if (idx >= 0) {
            msgs[idx] = { ...msgs[idx], content: assistantContent, timestamp: Date.now() };
          } else {
            msgs.push({ id: assistantMsgId, type: 'assistant' as const, content: assistantContent, timestamp: Date.now() });
          }
          return { messages: msgs };
        });
      }

      if (data.type === 'thinking_token') {
        // Could show in a collapsible thinking section
      }

      if (data.type === 'message_complete') {
        clearInterval(timeoutCheck);
        get().setIsStreaming(false);
        // Clear any remaining sub-agent state on normal completion
        set({ activeSubAgent: null, subAgentStack: [] });

        // Finalize the last assistant message segment
        if (assistantContent.trim()) {
          const finalContent = assistantContent.replace(/\s+$/, '').replace(/^\s+/, '');
            if(finalContent) {
              set((state) => {
              const msgs = [...state.messages];
              const idx = msgs.findIndex((m) => m.id === assistantMsgId);
              if (idx >= 0) {
                msgs[idx] = { ...msgs[idx], content: finalContent, timestamp: Date.now() };
              } else {
                msgs.push({ id: assistantMsgId, type: 'assistant' as const, content: finalContent, timestamp: Date.now() });
              }
              return { messages: msgs };
            });
          } else {
            set((state) => ({
              messages: state.messages.filter(m => m.id !== assistantMsgId),
            }));
          }
          
        }
        const usage = payload.usage;
        if (usage) {
          get().addMessage({
            id: `usage-${Date.now()}`,
            type: 'assistant',
            content: `[Tokens: ${usage.input_tokens} in / ${usage.output_tokens} out]`,
            timestamp: Date.now(),
            usage,
          });
        }
        ws.close();
      }

      if (data.type === 'error') {
        clearInterval(timeoutCheck);
        get().setIsStreaming(false);
        // Clear sub-agent state on backend error event
        set({ activeSubAgent: null, subAgentStack: [] });
        get().addMessage({
          id: `error-${Date.now()}`,
          type: 'error',
          content: payload.error || 'Unknown error',
          timestamp: Date.now(),
        });
        ws.close();
      }
    } catch (err) {
      console.error('WebSocket message parse error:', err);
    }
  };

  ws.onerror = () => {
    clearInterval(timeoutCheck);
    if (get().isStreaming) {
      get().setIsStreaming(false);
      // Clear sub-agent state on error
      set({ activeSubAgent: null, subAgentStack: [] });
      get().addMessage({
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'WebSocket connection error',
        timestamp: Date.now(),
      });
    }
  };

  ws.onclose = () => {
    clearInterval(timeoutCheck);
    set({ _chatWebSocket: null });
    if (get().isStreaming) {
      get().setIsStreaming(false);
      // Clear sub-agent state on abnormal disconnect
      set({ activeSubAgent: null, subAgentStack: [] });
      get().addMessage({
        id: `error-${Date.now()}`,
        type: 'error',
        content: 'Connection lost — response may be incomplete.',
        timestamp: Date.now(),
      });
    }
  };
},
});
