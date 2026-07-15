import { X } from 'lucide-react';
import type { ChatAttachment } from '../types/session';

interface AttachmentStripProps {
  attachments: ChatAttachment[];
  onRemove: (id: string) => void;
}

export default function AttachmentStrip({ attachments, onRemove }: AttachmentStripProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map(att => (
        <div
          key={att.id}
          className="group relative flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-md bg-bg-tertiary border border-border hover:border-accent/50 transition-colors"
        >
          <img
            src={att.dataUri}
            alt={att.name}
            className="w-8 h-8 rounded object-cover"
          />
          <span className="text-[11px] text-text-secondary truncate max-w-[100px]">
            {att.name}
          </span>
          <button
            onClick={() => onRemove(att.id)}
            className="ml-0.5 p-0.5 rounded hover:bg-bg-hover text-text-muted hover:text-error transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
