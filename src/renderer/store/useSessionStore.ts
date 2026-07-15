import type { AppState } from './useAppStore';
import type { SetState, GetState } from 'zustand';
import type { Session, PreviewMessage } from '../types/session';
import { getSidecarClient } from '../services/sidecar';

export type SessionSlice = Pick<AppState,
  'sessions' | 'activeSession' | 'sessionSearch' | 'sessionLoading' |
  'setSessions' | 'setActiveSession' | 'setSessionSearch' | 'setSessionLoading' |
  'loadSessions' | 'loadSessionIntoChat' | 'renameSession' | 'deleteSession' | 'getSessionPreview'
>;

export const sessionSliceCreator = (set: SetState<AppState>, get: GetState<AppState>): SessionSlice => ({
// Sessions
sessions: [],
activeSession: null,
sessionSearch: '',
sessionLoading: false,
setSessions: (sessions) => set({ sessions }),
setActiveSession: (name) => set({ activeSession: name }),
setSessionSearch: (q) => set({ sessionSearch: q }),
setSessionLoading: (loading) => set({ sessionLoading: loading }),
loadSessions: async (search?) => {
  const { sidecarPort } = get();
  if (!sidecarPort) return;
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.listSessions(search);
    set({ sessions: data.sessions || [] });
  } catch (err) {
    console.error('Failed to load sessions:', err);
  }
},
loadSessionIntoChat: async (sessionName: string) => {
  const { sidecarPort, clearMessages, addMessage, setActiveSession, setSessionLoading } = get();
  if (!sidecarPort) return;
  setSessionLoading(true);
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.loadSessionHistory(sessionName);
    if (data.success) {
      setActiveSession(sessionName);
      clearMessages();

      // Render loaded messages in chat (new structured format)
      if (data.messages && Array.isArray(data.messages)) {
        let msgIndex = 0;
        for (const msg of data.messages) {
          const msgType = msg.type;

          if (msgType === 'user') {
            addMessage({
              id: `loaded-user-${msgIndex}`,
              type: 'user',
              content: msg.content || '',
              timestamp: Date.now() + msgIndex,
            });
          } else if (msgType === 'assistant') {
            const content = (msg.content || '').trim();
            if (content) {
              addMessage({
                id: `loaded-assistant-${msgIndex}`,
                type: 'assistant',
                content,
                timestamp: Date.now() + msgIndex,
              });
            }
          } else if (msgType === 'tool_call') {
            addMessage({
              id: `loaded-tool-${msgIndex}`,
              type: 'tool_call',
              content: '',
              timestamp: Date.now() + msgIndex,
              tool_name: msg.tool_name || 'unknown',
              tool_args: msg.tool_args || {},
              tool_status: msg.tool_status || 'success',
              tool_result_summary: msg.tool_result_summary || '',
              tool_duration_ms: msg.tool_duration_ms,
            });
          }
          msgIndex++;
        }
      }

      // Add a separator
      addMessage({
        id: `separator-${Date.now()}`,
        type: 'assistant',
        content: `--- Session loaded (${data.message_count || 0} messages). Continuing... ---`,
        timestamp: Date.now(),
      });
    } else {
      addMessage({
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to load session: ${data.error || 'Unknown error'}`,
        timestamp: Date.now(),
      });
    }
  } catch (err) {
    console.error('Failed to load session:', err);
    addMessage({
      id: `error-${Date.now()}`,
      type: 'error',
      content: 'Could not connect to sidecar. Make sure the app is running.',
      timestamp: Date.now(),
    });
  } finally {
    setSessionLoading(false);
  }
},
renameSession: async (sessionName, customName, description?, tags?) => {
  const { sidecarPort, sessions, setSessions } = get();
  if (!sidecarPort) return;
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.renameSession(sessionName, customName, description, tags);
    if (data.success) {
      setSessions(
        sessions.map((s) =>
          s.session_name === sessionName
            ? { ...s, custom_name: customName, description: description ?? s.description, tags: tags ? tags.split(',').map((t: string) => t.trim()) : s.tags }
            : s
        )
      );
    }
  } catch (err) {
    console.error('Failed to rename session:', err);
  }
},
deleteSession: async (sessionName: string) => {
  const { sidecarPort, sessions, setSessions, activeSession, setActiveSession } = get();
  if (!sidecarPort) return;
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.deleteSession(sessionName);
    if (data.success) {
      const newSessions = sessions.filter((s) => s.session_name !== sessionName);
      setSessions(newSessions);
      if (activeSession === sessionName) {
        setActiveSession(null);
      }
    }
  } catch (err) {
    console.error('Failed to delete session:', err);
  }
},
getSessionPreview: async (sessionName: string, count = 3) => {
  const { sidecarPort } = get();
  if (!sidecarPort) return [];
  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.getSessionPreview(sessionName, count);
    return data.preview_messages || [];
  } catch (err) {
    console.error('Failed to get session preview:', err);
    return [];
  }
},

});
