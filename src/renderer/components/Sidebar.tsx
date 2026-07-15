import { useState, useRef, useEffect, useCallback } from 'react';
import { FolderTree, History, ChevronRight } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import FileExplorer from './FileExplorer';
import SessionList from './SessionList';

type Tab = 'files' | 'sessions';
const COLLAPSED_WIDTH = 48;

export default function Sidebar() {
  const { sidebarWidth, sidebarCollapsed, setSidebarCollapsed, models, agents, activeModel, activeAgent, switchModel, switchAgent } = useAppStore();
  const [tab, setTab] = useState<Tab>('files');
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseLeave = useCallback(() => {
    hoverTimer.current = setTimeout(() => setHovered(false), 500);
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHovered(true);
  }, []);

  useEffect(() => {
    return () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); };
  }, []);

  const isExpanded = !sidebarCollapsed || hovered;
  const currentWidth = isExpanded ? sidebarWidth : COLLAPSED_WIDTH;

  return (
    <div
      className="flex flex-col bg-bg-primary border-r border-white/10 relative"
      style={{ width: currentWidth, minWidth: 0, flexShrink: 0 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {isExpanded ? <FullSidebar tab={tab} setTab={setTab} sidebarCollapsed={sidebarCollapsed} /> : <CollapsedIcons tab={tab} setTab={setTab} />}
    </div>
  );
}

function FullSidebar({ tab, setTab, sidebarCollapsed }: { tab: Tab; setTab: (t: Tab) => void; sidebarCollapsed: boolean }) {
  const { models, agents, activeModel, activeAgent, switchModel, switchAgent, setSidebarCollapsed } = useAppStore();

  return (
    <>
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/10">
        <div className="flex gap-3">
          <button onClick={() => setTab('files')} className={`text-[10px] font-medium uppercase tracking-wider transition-colors ${tab === 'files' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>Files</button>
          <button onClick={() => setTab('sessions')} className={`text-[10px] font-medium uppercase tracking-wider transition-colors ${tab === 'sessions' ? 'text-text-primary' : 'text-text-muted hover:text-text-secondary'}`}>Sessions</button>
        </div>
        <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors" title="Collapse sidebar"><ChevronRight className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex-1 flex flex-col min-h-0">{tab === 'files' ? <FileExplorer /> : <SessionList />}</div>
      <div className="border-t border-white/10 p-3 space-y-3">
        <div>
          <label className="block text-xs text-text-muted mb-1">Model</label>
          <select className="w-full px-2 py-1.5 text-xs bg-bg-secondary border border-white/10 rounded text-text-primary focus:outline-none focus:border-blue-500/50" value={activeModel || ''} onChange={(e) => switchModel(e.target.value)}>
            {models.map((m) => <option key={m.name} value={m.name}>{m.display_name} ({m.provider})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-text-muted mb-1">Agent</label>
          <select className="w-full px-2 py-1.5 text-xs bg-bg-secondary border border-white/10 rounded text-text-primary focus:outline-none focus:border-blue-500/50" value={activeAgent || ''} onChange={(e) => switchAgent(e.target.value)}>
            {agents.map((a) => <option key={a.name} value={a.name}>{a.display_name}</option>)}
          </select>
        </div>
      </div>
    </>
  );
}

function CollapsedIcons({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex flex-col items-center py-3 gap-3">
      <button onClick={() => setTab('files')} className={`p-2 rounded-lg transition-colors ${tab === 'files' ? 'bg-blue-600/30 text-blue-200' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'}`} title="Files"><FolderTree className="w-4 h-4" /></button>
      <button onClick={() => setTab('sessions')} className={`p-2 rounded-lg transition-colors ${tab === 'sessions' ? 'bg-blue-600/30 text-blue-200' : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'}`} title="Sessions"><History className="w-4 h-4" /></button>
    </div>
  );
}
