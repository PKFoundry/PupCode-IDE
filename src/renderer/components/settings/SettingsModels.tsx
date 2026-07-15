import { useState } from 'react';
import { Check, Trash2, Edit2 } from 'lucide-react';
import useAppStore, { ModelFormData } from '../../store/useAppStore';

export default function SettingsModels() {
  const { models, deleteModel } = useAppStore();
  const [editingModel, setEditingModel] = useState<string | null>(null);
  const [formData, setFormData] = useState<ModelFormData>({
    name: '', type: 'openai', endpoint: '', api_key: '', description: '', context_length: 0, timeout: 0,
  });

  const handleEdit = (name: string) => {
    setEditingModel(name);
    setFormData({ name, type: 'openai', endpoint: '', api_key: '', description: '', context_length: 0, timeout: 0 });
    useAppStore.getState().getModel(name).then((config) => {
      if (!config) return;
      const ce = config.custom_endpoint || {};
      const endpoint = ce.url || config.endpoint || '';
      const api_key = ce.api_key || config.api_key_env || config.api_key || '';
      const typeMap: Record<string, string> = {
        custom_openai: 'openai', anthropic: 'anthropic', google: 'google',
        cerebras: 'cerebras', ollama: 'ollama', chatgpt_oauth: 'openai',
      };
      const type = typeMap[config.type] || config.type || 'openai';
      setFormData({
        name,
        type,
        endpoint,
        api_key,
        description: config.description || '',
        context_length: config.context_length || 0,
        timeout: config.timeout || 0,
      });
    });
  };

  const handleSave = async () => {
    if (!editingModel) return;
    const config: Record<string, any> = {
      type: formData.type === 'openai' ? 'custom_openai' : formData.type,
      name: formData.name,
    };
    if (formData.endpoint) {
      config.custom_endpoint = {
        url: formData.endpoint,
        api_key: formData.api_key || '$API_KEY',
      };
    }
    if (formData.description) config.description = formData.description;
    if (formData.context_length) config.context_length = formData.context_length;
    if (formData.timeout) config.timeout = formData.timeout;

    const success = await useAppStore.getState().updateModel(editingModel, { raw_config: config });
    if (success) {
      setEditingModel(null);
      setFormData({ name: '', type: 'openai', endpoint: '', api_key: '', description: '', context_length: 0, timeout: 0 });
    }
  };

  const handleCancel = () => {
    setEditingModel(null);
    setFormData({ name: '', type: 'openai', endpoint: '', api_key: '', description: '', context_length: 0, timeout: 0 });
  };

  return (
    <div className="space-y-2">
      {models.length === 0 && <p className="text-sm text-text-muted text-center py-8">No models configured</p>}
      {models.map((model) => (
        editingModel === model.name ? (
          <div key={model.name} className="bg-bg-secondary rounded-lg p-4 border border-accent/30 space-y-3">
            <h3 className="text-sm font-semibold text-text-primary">Edit Model</h3>
            <input type="text" placeholder="Model name" value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
            <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary focus:outline-none focus:border-accent">
              <option value="openai">OpenAI Compatible</option>
              <option value="anthropic">Anthropic</option>
              <option value="google">Google</option>
              <option value="cerebras">Cerebras</option>
              <option value="ollama">Ollama</option>
            </select>
            <input type="text" placeholder="Endpoint URL" value={formData.endpoint}
              onChange={(e) => setFormData({ ...formData, endpoint: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
            <input type="password" placeholder="API Key env var" value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
            <div className="flex gap-2">
              <input type="number" placeholder="Context length" value={formData.context_length || ''}
                onChange={(e) => setFormData({ ...formData, context_length: parseInt(e.target.value) || 0 })}
                className="w-1/2 px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
              <input type="number" placeholder="Timeout" value={formData.timeout || ''}
                onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 0 })}
                className="w-1/2 px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent" />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSave}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover transition-colors">
                <Check className="w-3.5 h-3.5" /> Save
              </button>
              <button onClick={handleCancel}
                className="px-3 py-1.5 bg-bg-primary border border-border rounded text-sm text-text-muted hover:text-text-primary transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <div key={model.name} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
            model.is_active ? 'bg-accent/10 border-accent/30' : 'bg-bg-secondary border-border'
          }`}>
            <div className="flex items-center gap-3">
              {model.is_active && <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">Active</span>}
              <div>
                <div className="text-sm font-medium text-text-primary">{model.name}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => handleEdit(model.name)} className="p-1.5 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => deleteModel(model.name)} className="p-1.5 rounded hover:bg-red-500/20 text-text-muted hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )
      ))}
    </div>
  );
}
