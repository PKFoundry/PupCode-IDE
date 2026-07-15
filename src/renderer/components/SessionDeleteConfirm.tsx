import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import type { Session } from '../types/session';

interface SessionDeleteConfirmProps {
  session: Session;
  onClose: () => void;
}

export default function SessionDeleteConfirm({ session, onClose }: SessionDeleteConfirmProps) {
  const { deleteSession } = useAppStore();
  const [deleting, setDeleting] = useState(false);

  const displayName = session.custom_name || session.session_name;

  const handleDelete = async () => {
    setDeleting(true);
    await deleteSession(session.session_name);
    setDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-bg-primary border border-white/10 rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Warning header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-red-500/10 border-b border-red-500/20">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <h2 className="text-sm font-semibold text-red-300">Delete Session</h2>
            <p className="text-[10px] text-red-300/70 mt-0.5">This cannot be undone</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-red-500/20 text-red-300/60 hover:text-red-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-xs text-text-secondary leading-relaxed">
            Are you sure you want to delete this session?
          </p>
          <div className="mt-3 px-3 py-2 bg-bg-secondary rounded-lg border border-white/5">
            <p className="text-xs font-medium text-text-primary truncate">{displayName}</p>
            <p className="text-[10px] text-text-muted mt-0.5">
              {session.message_count} messages, {session.total_tokens.toLocaleString()} tokens
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10 bg-bg-secondary/50">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
