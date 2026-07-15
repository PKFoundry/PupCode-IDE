import useAppStore from '../../store/useAppStore';

export default function GeneralSettingsTab() {
  const { workingDir, activeModel, activeAgent, sidecarConnected } = useAppStore();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Application</h3>
        <div className="space-y-3 text-sm">
          {[
            ['Version', '0.3.0'],
            ['Working Directory', workingDir || 'Not set'],
            ['Active Model', activeModel || 'None'],
            ['Active Agent', activeAgent || 'None'],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-text-muted">{label}</span>
              <span className="text-text-primary truncate ml-4">{value}</span>
            </div>
          ))}
          <div className="flex justify-between">
            <span className="text-text-muted">Sidecar Status</span>
            <span className={sidecarConnected ? 'text-green-400' : 'text-red-400'}>
              {sidecarConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-bg-secondary rounded-lg p-4 border border-border">
        <h3 className="text-sm font-semibold text-text-primary mb-3">Keyboard Shortcuts</h3>
        <div className="space-y-2 text-sm">
          {[
            ['Ctrl+Shift+P', 'Command Palette'],
            ['Ctrl+,', 'Settings'],
            ['Ctrl+S', 'Save File'],
            ['Enter', 'Send Message'],
            ['Shift+Enter', 'New Line (Chat)'],
          ].map(([key, desc]) => (
            <div key={key} className="flex justify-between items-center">
              <span className="text-text-muted">{desc}</span>
              <kbd className="text-xs bg-bg-primary px-2 py-0.5 rounded border border-border font-mono">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
