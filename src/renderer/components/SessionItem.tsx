import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, Tag, Edit2, Trash2, Clock, MessageCircle, Loader2 } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import type { Session, PreviewMessage } from '../types/session';
import SessionRenameModal from './SessionRenameModal';
import SessionDeleteConfirm from './SessionDeleteConfirm';

interface SessionItemProps {
  session: Session;
}

export default function SessionItem({ session }: SessionItemProps) {
  const { loadSessionIntoChat, activeSession, sessionLoading, getSessionPreview } = useAppStore();
  const [hovered, setHovered] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [preview, setPreview] = useState<PreviewMessage[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isActive = activeSession === session.session_name;
  const displayName = session.custom_name || formatSessionName(session.session_name);
  const date = formatDate(session.timestamp);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview fetch — only fetch after hovering 400ms
  const fetchPreview = useCallback(async () => {
    if (previewLoading || preview) return;
    setPreviewLoading(true);
    const msgs = await getSessionPreview(session.session_name, 2);
    setPreview(msgs.length > 0 ? msgs : null);
    setPreviewLoading(false);
  }, [preview, previewLoading, session.session_name, getSessionPreview]);

  const handleMouseEnter = () => {
    setHovered(true);
    hoverTimerRef.current = setTimeout(fetchPreview, 400);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  const handleClick = () => {
    if (!sessionLoading) {
      loadSessionIntoChat(session.session_name);
    }
  };

  return (
    <>
      <div
        className={`group relative rounded-lg px-3 py-2.5 cursor-pointer transition-all duration-150 ${
          isActive
            ? 'bg-blue-500/10 border border-blue-500/30'
            : hovered
            ? 'bg-bg-hover border border-transparent'
            : 'border border-transparent'
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        {/* Name */}
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-medium leading-snug ${isActive ? 'text-blue-300' : 'text-text-primary'}`}>
            {displayName}
          </p>

          {/* Action buttons */}
          {hovered && !sessionLoading && (
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); setShowRename(true); }}
                className="p-1 rounded hover:bg-bg-secondary text-text-muted hover:text-text-primary transition-colors"
                title="Rename"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setShowDelete(true); }}
                className="p-1 rounded hover:bg-bg-secondary text-text-muted hover:text-red-400 transition-colors"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-text-muted">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {date}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            {session.message_count}
          </span>
          {session.total_tokens > 0 && (
            <span className="flex items-center gap-1">
              {formatTokens(session.total_tokens)}
            </span>
          )}
        </div>

        {/* Tags */}
        {session.tags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Tag className="w-2.5 h-2.5 text-text-muted" />
            {session.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-[9px] rounded bg-bg-secondary text-text-secondary border border-white/5">
                {tag}
              </span>
            ))}
            {session.tags.length > 3 && (
              <span className="text-[9px] text-text-muted">+{session.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Preview Tooltip */}
        {hovered && preview && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 pointer-events-none">
            <div className="bg-bg-primary border border-white/15 rounded-lg shadow-2xl p-3 text-xs">
              {preview.map((msg, i) => (
                <PreviewMessageBubble key={i} message={msg} />
              ))}
              <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/10 text-[10px] text-text-muted">
                <MessageCircle className="w-3 h-3" />
                <span>Click to load full session</span>
              </div>
            </div>
          </div>
        )}

        {/* Preview Loading */}
        {hovered && previewLoading && !preview && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 pointer-events-none">
            <div className="bg-bg-primary border border-white/15 rounded-lg shadow-2xl px-4 py-2 flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading preview...
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {sessionLoading && isActive && (
          <div className="absolute inset-0 bg-bg-primary/60 backdrop-blur-[1px] rounded-lg flex items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-text-secondary">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              Loading...
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      {showRename && (
        <SessionRenameModal session={session} onClose={() => setShowRename(false)} />
      )}
      {showDelete && (
        <SessionDeleteConfirm session={session} onClose={() => setShowDelete(false)} />
      )}
    </>
  );
}

// =============================================================================
// Preview Message Bubble
// =============================================================================

function PreviewMessageBubble({ message }: { message: PreviewMessage }) {
  const roleLabel = message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI' : 'Tool';
  const roleColor = message.role === 'user' ? 'text-blue-300' : message.role === 'assistant' ? 'text-green-300' : 'text-yellow-300';

  return (
    <div className="mb-1.5 last:mb-0">
      <span className={`text-[10px] font-medium ${roleColor}`}>{roleLabel}:</span>
      <p className="text-[10px] text-text-secondary leading-relaxed mt-0.5 line-clamp-3">
        {stripThinking(message.content)}
      </p>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatSessionName(name: string): string {
  const match = name.match(/auto_session_(\d{8})_(\d{6})/);
  if (match) {
    const [, dateStr, timeStr] = match;
    const year = parseInt(dateStr.slice(0, 4));
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = parseInt(dateStr.slice(6, 8));
    const hours = parseInt(timeStr.slice(0, 2));
    const minutes = parseInt(timeStr.slice(2, 4));
    const d = new Date(year, month, day, hours, minutes);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  return name;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatTokens(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return `${count}`;
}

function stripThinking(content: string): string {
  return content.replace(/\[thinking\][^\n]*/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 300);
}
