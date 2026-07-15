import { useState, useEffect } from 'react';
import {
  Settings, X, Zap, Bot, Server, FileText, Mic, BarChart3, Palette,
} from 'lucide-react';
import useAppStore from '../store/useAppStore';
import {
  SettingsGeneral,
  SettingsModels,
  SettingsAgents,
  SettingsMCPServers,
  SettingsAgentsRules,
  SettingsVoice,
  SettingsAppearance,
  SettingsUsage,
} from './settings';

const TABS = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'models', label: 'Models', icon: Zap },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'mcp', label: 'MCP Servers', icon: Server },
  { id: 'rules', label: 'AGENTS.md', icon: FileText },
  { id: 'voice', label: 'Voice', icon: Mic },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'usage', label: 'Usage', icon: BarChart3 },
];

function SettingsPanel() {
  const { showSettings, setShowSettings, settingsTab, setSettingsTab } = useAppStore();
  const [activeTab, setActiveTab] = useState(settingsTab);

  useEffect(() => { setActiveTab(settingsTab); }, [settingsTab]);

  if (!showSettings) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowSettings(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-5xl h-[80vh] bg-bg-primary border border-border rounded-xl shadow-2xl overflow-hidden flex animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-48 bg-bg-secondary border-r border-border flex flex-col flex-shrink-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Settings className="w-4 h-4 text-accent" />
            <span className="text-sm font-semibold text-text-primary">Settings</span>
          </div>
          <nav className="flex-1 py-2 overflow-y-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors ${
                    isActive
                      ? 'bg-accent/20 text-accent border-r-2 border-accent'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  }`}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSettingsTab(tab.id);
                  }}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-sm">{tab.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="px-4 py-3 border-t border-border text-[10px] text-text-muted">v0.3.0</div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">
              {TABS.find((t) => t.id === activeTab)?.label || 'Settings'}
            </h2>
            <button
              onClick={() => setShowSettings(false)}
              className="p-1.5 rounded hover:bg-bg-hover text-text-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'general' && <SettingsGeneral />}
            {activeTab === 'models' && <SettingsModels />}
            {activeTab === 'agents' && <SettingsAgents />}
            {activeTab === 'mcp' && <SettingsMCPServers />}
            {activeTab === 'rules' && <SettingsAgentsRules />}
            {activeTab === 'voice' && <SettingsVoice />}
            {activeTab === 'appearance' && <SettingsAppearance />}
            {activeTab === 'usage' && <SettingsUsage />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;
