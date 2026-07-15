import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  shortcut?: string;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onClose: () => void;
}

function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  const handleClick = (onClick: () => void) => {
    onClick();
    onClose();
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100]" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed z-[101] min-w-[180px] py-1 bg-bg-secondary border border-border rounded-lg shadow-xl animate-fade-in"
        style={{ left: x, top: y }}
        role="menu"
      >
        {items.map((item) => (
          <button
            key={item.id}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => handleClick(item.onClick)}
            className={`flex items-center w-full px-3 py-1.5 text-sm text-left transition-colors
              ${item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              ${item.danger ? 'hover:bg-red-500/20 text-red-400' : 'hover:bg-bg-hover text-text-primary'}
            `}
          >
            {item.icon && <span className="mr-2 w-4 flex-shrink-0">{item.icon}</span>}
            <span className="flex-1">{item.label}</span>
            {item.shortcut && <span className="text-xs text-text-muted ml-4">{item.shortcut}</span>}
          </button>
        ))}
      </div>
    </>,
    document.body
  );
}

export default ContextMenu;
