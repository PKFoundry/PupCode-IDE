import { useState, useEffect } from 'react';
import { FileText } from 'lucide-react';
import useAppStore from '../../store/useAppStore';

export default function SettingsAgentsRules() {
  const { agentsRules, loadAgentsRules } = useAppStore();

  useEffect(() => { loadAgentsRules(); }, [loadAgentsRules]);

  return (
    <div className="space-y-4 max-w-3xl">
      {agentsRules.length === 0 ? (
        <div className="text-center py-8 text-text-muted">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No AGENTS.md rules found</p>
          <p className="text-xs mt-1">Create a project-level AGENTS.md to define agent rules</p>
        </div>
      ) : (
        agentsRules.map((rule) => (
          <div key={rule.path} className="bg-bg-secondary rounded-lg border border-border overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <span className={`text-xs px-2 py-0.5 rounded ${
                rule.scope === 'global' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
              }`}>{rule.scope}</span>
              <span className="text-xs text-text-muted font-mono truncate">{rule.path}</span>
            </div>
            <pre className="p-4 text-xs text-text-secondary font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
              {rule.content}
            </pre>
          </div>
        ))
      )}
    </div>
  );
}
