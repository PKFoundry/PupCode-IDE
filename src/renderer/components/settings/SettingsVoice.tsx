import { useState, useEffect } from 'react';
import { Mic, Save, Check } from 'lucide-react';
import useAppStore from '../../store/useAppStore';

export default function SettingsVoice() {
  const { voiceConfig, loadVoiceConfig, saveVoiceConfig } = useAppStore();
  const [localConfig, setLocalConfig] = useState(voiceConfig);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => { loadVoiceConfig(); }, [loadVoiceConfig]);
  useEffect(() => { setLocalConfig(voiceConfig); }, [voiceConfig]);

  const handleSave = async () => {
    setErrors([]);
    if (!localConfig.base_url || !localConfig.model || !localConfig.api_key) {
      setErrors(['Base URL, Model, and API Key are required']);
      return;
    }
    setSaving(true);
    const ok = await saveVoiceConfig(localConfig);
    setSaving(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Info */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-2">Voice Input</h3>
        <p className="text-xs text-text-muted leading-relaxed">
          Configure your speech-to-text endpoint for voice input in chat.
          Requires an OpenAI-compatible STT server (e.g., Faster Whisper, Whisper.cpp).
        </p>
      </div>

      {/* Form */}
      <div className="bg-bg-secondary rounded-lg p-4 border border-border space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">Configuration</h3>

        {/* Enabled toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm text-text-primary">Enabled</label>
            <p className="text-xs text-text-muted">Show microphone button in chat</p>
          </div>
          <button
            onClick={() => setLocalConfig({ ...localConfig, enabled: !localConfig.enabled })}
            className={`w-10 h-5 rounded-full transition-colors relative ${localConfig.enabled ? 'bg-accent' : 'bg-bg-primary border border-border'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${localConfig.enabled ? 'translate-x-5' : ''}`} />
          </button>
        </div>

        {/* Base URL */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Base URL</label>
          <input
            type="text"
            value={localConfig.base_url}
            onChange={(e) => setLocalConfig({ ...localConfig, base_url: e.target.value })}
            placeholder="http://localhost:8000/v1"
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Model */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Model</label>
          <input
            type="text"
            value={localConfig.model}
            onChange={(e) => setLocalConfig({ ...localConfig, model: e.target.value })}
            placeholder="Systran/faster-whisper-small"
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* API Key */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">API Key</label>
          <input
            type="password"
            value={localConfig.api_key}
            onChange={(e) => setLocalConfig({ ...localConfig, api_key: e.target.value })}
            placeholder="Enter your API key"
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Language */}
        <div>
          <label className="text-xs text-text-muted mb-1 block">Language</label>
          <select
            value={localConfig.language}
            onChange={(e) => setLocalConfig({ ...localConfig, language: e.target.value })}
            className="w-full px-3 py-2 text-sm bg-bg-primary border border-border rounded text-text-primary focus:outline-none focus:border-accent"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese</option>
            <option value="ko">Korean</option>
            <option value="ru">Russian</option>
            <option value="pt">Portuguese</option>
          </select>
        </div>

        {/* Errors */}
        {errors.length > 0 && (
          <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
            {errors.join('\n')}
          </div>
        )}

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-accent text-white rounded text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
