import { useState, useCallback, useEffect, useRef } from 'react';

interface ResizeHandleProps {
  onResize: (delta: number) => number;
  onDoubleClick?: () => void;
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}

export default function ResizeHandle({ onResize, onDoubleClick, orientation = 'vertical', className = '' }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startPos.current = orientation === 'vertical' ? e.clientX : e.clientY;
    setIsDragging(true);
  }, [orientation]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = orientation === 'vertical' ? e.clientX : e.clientY;
      const delta = currentPos - startPos.current;
      const actualDelta = onResize(delta);
      startPos.current += actualDelta;
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = orientation === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, onResize, orientation]);

  if (orientation === 'vertical') {
    return (
      <div
        className={`w-[4px] cursor-col-resize flex items-center justify-center relative group ${className}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    >
        <div
          className={`absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 transition-all duration-150
            ${isDragging ? 'bg-blue-500' : 'bg-transparent group-hover:bg-blue-500/40'}`}
        />
        <div className="absolute inset-0 w-[8px] -left-[2px]" />
      </div>
    );
  }

  return (
    <div
      className={`h-[4px] cursor-row-resize flex items-center justify-center relative group ${className}`}
      onMouseDown={handleMouseDown}
      onDoubleClick={onDoubleClick}
    >
      <div
        className={`absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 transition-all duration-150
          ${isDragging ? 'bg-blue-500' : 'bg-transparent group-hover:bg-blue-500/40'}`}
      />
      <div className="absolute inset-0 h-[8px] -top-[2px]" />
    </div>
  );
}
