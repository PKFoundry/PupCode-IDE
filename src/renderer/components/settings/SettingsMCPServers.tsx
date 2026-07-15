import { useState, useEffect } from 'react';
import { Plus, Trash2, Play, Square, Check } from 'lucide-react';
import useAppStore from '../../store/useAppStore';

export default function SettingsMCPServers() {
  const { mcpServers, loadMcpServers, addMcpServer, deleteMcpServer } = useAppStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');

  useEffect(() => { loadMcpServers(); }, [loadMcpServers]);

  const handleAdd = async () => {
    if (!name || !command) return;
    const parsedArgs = args.trim() ? args.trim().split(/\s+/) : [];
    const success = await addMcpServer(name, command, parsedArgs);
    if (success) { setName(''); setCommand(''); setArgs(''); setShowAddForm(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {!showAddForm && (
        <button onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors text-sm">
          <Plus className="w-4 h-4" /> Add MCP Server
        </button>
      )}

      {showAddForm && (
        <div className="bg-bg-secondary rounded-lg p-4 border border-border space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Add MCP Server</h3>
          <input type="text" placeholder="Server name" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
          <input type="text" placeholder="Command (e.g. npx)" value={command} onChange={(e) => setCommand(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
          <input type="text" placeholder="Arguments (space-separated)" value={args} onChange={(e) => setArgs(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={!name || !command}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors">
              <Check className="w-3.5 h-3.5" /> Add
            </button>
            <button onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-muted hover:text-text-primary transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {mcpServers.length === 0 && <p className="text-sm text-text-muted text-center py-8">No MCP servers configured</p>}
        {mcpServers.map((server) => (
          <div key={server.name} className="flex items-center justify-between px-4 py-3 rounded-lg border bg-bg-secondary border-border">
            <div>
              <div className="text-sm text-text-primary">{server.name}</div>
              <div className="text-xs text-text-muted font-mono">{server.command} {server.args.join(' ')}</div>
            </div>
            <button onClick={() => deleteMcpServer(server.name)}
              className="p-1.5 rounded hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
