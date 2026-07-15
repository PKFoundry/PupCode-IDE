import { useState, useRef, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import type { Session } from '../types/session';

interface Props {
  session: Session;
  onClose: () => void;
}

export default function SessionRenameModal({ session, onClose }: Props) {
  const renameSession = useAppStore((s) => s.renameSession);
  const [customName, setCustomName] = useState(session.custom_name || '');
  const [description, setDescription] = useState(session.description || '');
  const [tags, setTags] = useState(session.tags.join(', '));
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const handleSave = async () => {
    if (!customName.trim()) return;
    setSaving(true);
    await renameSession(session.session_name, customName.trim(), description || undefined, tags || undefined);
    setSaving(false);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !saving) handleSave();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-bg-primary border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-text-primary">Rename Session</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-hover text-text-muted transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Name</label>
            <input
              ref={nameRef}
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Give this session a name..."
              className="w-full px-3 py-2 text-xs bg-bg-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Description (optional)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What was this session about?"
              className="w-full px-3 py-2 text-xs bg-bg-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
          </div>
          <div>
            <label className="block text-[10px] text-text-muted mb-1 uppercase tracking-wider">Tags (comma-separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. auth, refactoring, bugfix"
              className="w-full px-3 py-2 text-xs bg-bg-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/10">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!customName.trim() || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
