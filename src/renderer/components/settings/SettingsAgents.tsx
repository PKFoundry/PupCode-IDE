import { useState } from 'react';
import { Plus, Check, Trash2, Edit2, Code, Type } from 'lucide-react';
import useAppStore, { AgentFormData } from '../../store/useAppStore';
import { getSidecarClient } from '../../services/sidecar';

const ALL_TOOLS = [
  'list_files', 'read_file', 'create_file', 'replace_in_file',
  'delete_file', 'grep',
];

export default function SettingsAgents() {
  const { agents, createAgent, deleteAgent } = useAppStore();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [formData, setFormData] = useState<AgentFormData>({
    name: '', description: '', system_prompt: '', tools: [],
  });
  const [rawJson, setRawJson] = useState('');

  const handleCreate = async () => {
    const success = await createAgent(formData);
    if (success) {
      setFormData({ name: '', description: '', system_prompt: '', tools: [] });
      setShowCreateForm(false);
    }
  };

  const handleEdit = async (name: string) => {
    setEditingAgent(name);
    setShowCreateForm(false);
    setRawMode(false);
    // Fetch full agent config from backend
    try {
      const { sidecarPort } = useAppStore.getState();
      if (sidecarPort) {
        const client = getSidecarClient(sidecarPort);
        const data = await client.getAgent(name);
        if (!data.error) {
          // system_prompt can be string or array of strings
          const sp = data.system_prompt;
          const systemPromptStr = Array.isArray(sp) ? sp.join('\n') : (sp || '');
          setFormData({
            name: data.name || name,
            description: data.description || '',
            system_prompt: systemPromptStr,
            tools: Array.isArray(data.tools) ? data.tools : [],
          });
          setRawJson(JSON.stringify(data.raw_config || data, null, 2));
        }
      }
    } catch (err) {
      console.error('Failed to load agent details:', err);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingAgent) return;
    if (rawMode) {
      try {
        const parsed = JSON.parse(rawJson);
        const success = await useAppStore.getState().updateAgent(editingAgent, parsed);
        if (success) {
          setEditingAgent(null);
          setRawMode(false);
          setRawJson('');
        }
      } catch {
        alert('Invalid JSON');
      }
    } else {
      // Convert system_prompt string back to array format (matching caveman.json)
      const sp = formData.system_prompt.trim();
      const systemPromptValue = sp
        ? sp.split('\n').map((line) => line.trim()).filter(Boolean)
        : '';
      const payload = {
        description: formData.description,
        system_prompt: systemPromptValue,
        tools: formData.tools,
      };
      const success = await useAppStore.getState().updateAgent(editingAgent, payload);
      if (success) {
        setEditingAgent(null);
        setFormData({ name: '', description: '', system_prompt: '', tools: [] });
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingAgent(null);
    setRawMode(false);
    setRawJson('');
    setFormData({ name: '', description: '', system_prompt: '', tools: [] });
  };

  const toggleTool = (tool: string) => {
    setFormData((prev) => ({
      ...prev,
      tools: prev.tools.includes(tool) ? prev.tools.filter((t) => t !== tool) : [...prev.tools, tool],
    }));
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Create Agent Button */}
      {!showCreateForm && !editingAgent && (
        <button onClick={() => setShowCreateForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent/20 text-accent rounded-lg hover:bg-accent/30 transition-colors text-sm">
          <Plus className="w-4 h-4" /> Create Agent
        </button>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-bg-secondary rounded-lg p-4 border border-border space-y-3">
          <h3 className="text-sm font-semibold text-text-primary">Create New Agent</h3>
          <input type="text" placeholder="Agent name" value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
          <input type="text" placeholder="Description" value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
          <textarea placeholder="System prompt" value={formData.system_prompt} rows={4}
            onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none" />
          <div>
            <label className="text-xs text-text-muted mb-2 block">Available Tools</label>
            <div className="flex flex-wrap gap-2">
              {ALL_TOOLS.map((tool) => (
                <button key={tool} onClick={() => toggleTool(tool)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    formData.tools.includes(tool) ? 'bg-accent/20 border-accent/50 text-accent' : 'bg-bg-primary border-border text-text-muted hover:text-text-primary'
                  }`}>{tool}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!formData.name}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors">
              <Check className="w-3.5 h-3.5" /> Create
            </button>
            <button onClick={() => setShowCreateForm(false)}
              className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-muted hover:text-text-primary transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Edit Agent Form */}
      {editingAgent && (
        <div className="bg-bg-secondary rounded-lg p-4 border border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">Edit Agent: {editingAgent}</h3>
            <button
              onClick={() => setRawMode(!rawMode)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              title={rawMode ? 'Switch to form view' : 'Switch to raw JSON'}
            >
              {rawMode ? <Type className="w-3.5 h-3.5" /> : <Code className="w-3.5 h-3.5" />}
              {rawMode ? 'Form' : 'JSON'}
            </button>
          </div>

          {rawMode ? (
            <div className="space-y-3">
              <textarea
                value={rawJson}
                onChange={(e) => setRawJson(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary font-mono focus:outline-none focus:border-accent resize-none"
                placeholder='{"name": "...", "description": "...", "system_prompt": "...", "tools": [...]}'
              />
              <p className="text-[10px] text-text-muted">Edit the raw JSON configuration directly</p>
            </div>
          ) : (
            <div className="space-y-3">
              <input type="text" placeholder="Agent name" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
              <input type="text" placeholder="Description" value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
              <textarea placeholder="System prompt" value={formData.system_prompt} rows={4}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none" />
              <div>
                <label className="text-xs text-text-muted mb-2 block">Available Tools</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_TOOLS.map((tool) => (
                    <button key={tool} onClick={() => toggleTool(tool)}
                      className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                        formData.tools.includes(tool) ? 'bg-accent/20 border-accent/50 text-accent' : 'bg-bg-primary border-border text-text-muted hover:text-text-primary'
                      }`}>{tool}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={handleSaveEdit} disabled={!formData.name}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors">
              <Check className="w-3.5 h-3.5" /> Save
            </button>
            <button onClick={handleCancelEdit}
              className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-muted hover:text-text-primary transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {/* Agent List */}
      <div className="space-y-2">
        {agents.length === 0 && <p className="text-sm text-text-muted text-center py-8">No agents available</p>}
        {agents.map((agent) => (
          <div key={agent.name} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
            agent.is_active ? 'bg-accent/10 border-accent/30' : 'bg-bg-secondary border-border'
          }`}>
            <div className="flex items-center gap-3">
              {agent.is_active && <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">Active</span>}
              <div>
                <div className="text-sm text-text-primary">{agent.display_name || agent.name}</div>
                {agent.description && <div className="text-xs text-text-muted">{agent.description}</div>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => handleEdit(agent.name)}
                className="p-1.5 rounded hover:bg-blue-500/20 text-text-muted hover:text-blue-400 transition-colors" title="Edit">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => deleteAgent(agent.name)}
                className="p-1.5 rounded hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
