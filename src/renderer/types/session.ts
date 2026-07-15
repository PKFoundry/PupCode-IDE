/**
 * Session types for chat session management.
 *
 * Sessions are stored by code-puppy as pickle files in ~/.code_puppy/autosaves/.
 * The sidecar provides REST endpoints to list, load, rename, and delete them.
 */

/** A saved chat session from code-puppy's autosave directory. */
export interface Session {
  session_name: string;       // e.g. "auto_session_20260601_205244"
  custom_name: string | null; // User-friendly name (nullable)
  description: string | null;
  tags: string[];
  timestamp: string;          // ISO format
  message_count: number;
  total_tokens: number;
  file_path: string;
  auto_saved: boolean;
}

/** A preview message extracted from a session's pickle history. */
export interface PreviewMessage {
  role: 'user' | 'assistant' | 'tool' | 'system' | 'unknown';
  content: string;
}

/** An image attachment held in memory, ready to send with a chat message. */
export interface ChatAttachment {
  id: string;
  name: string;       // e.g. "error_screenshot_k3x2a.png"
  dataUri: string;    // "data:image/png;base64,..."
  mimeType: string;   // "image/png"
  size: number;       // bytes
}

/** Response from GET /api/sessions/list */
export interface SessionListResponse {
  sessions: Session[];
  total: number;
  page: number;
  limit: number;
}

/** Response from GET /api/sessions/{name}/preview */
export interface SessionPreviewResponse {
  session_name: string;
  custom_name: string | null;
  preview_messages: PreviewMessage[];
  message_count: number;
}
