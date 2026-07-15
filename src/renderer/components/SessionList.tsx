import { useEffect, useState } from 'react';
import { History, Search, Plus, Loader2 } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import SessionItem from './SessionItem';

export default function SessionList() {
  const { sessions, loadSessions, sessionSearch, setSessionSearch, sessionLoading } = useAppStore();
  const [searchFocused, setSearchFocused] = useState(false);

  useEffect(() => {
    loadSessions();
  }, []);

  const handleSearch = (value: string) => {
    setSessionSearch(value);
    if (value) {
      loadSessions(value);
    } else {
      loadSessions();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2 text-text-primary">
          <History className="w-4 h-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">Sessions</span>
        </div>
        <span className="text-[10px] text-text-muted">{sessions.length} saved</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <div className={`relative transition-colors ${searchFocused ? 'ring-1 ring-blue-500/30' : ''}`}>
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <input
            type="text"
            value={sessionSearch}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            placeholder="Search sessions..."
            className="w-full pl-7 pr-3 py-1.5 text-xs bg-bg-secondary border border-white/10 rounded text-text-primary placeholder-text-muted focus:outline-none"
          />
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sessionLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-text-muted">
            <Loader2 className="w-5 h-5 animate-spin mb-2" />
            <span className="text-xs">Loading sessions...</span>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-text-muted px-4">
            <History className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs font-medium">No sessions yet</p>
            <p className="text-[10px] mt-1 leading-relaxed">
              Chat sessions are auto-saved by code-puppy. Start a conversation to create one.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((session) => (
              <SessionItem key={session.session_name} session={session} />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {sessions.length > 0 && (
        <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-text-muted text-center">
          Click a session to load into chat
        </div>
      )}
    </div>
  );
}
