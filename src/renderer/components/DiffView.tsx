import Editor from '@monaco-editor/react';
import useAppStore from '../store/useAppStore';
import { Check, X } from 'lucide-react';

export default function DiffView() {
  const { editorTabs, activeTab, closeTab, updateTabContent } = useAppStore();
  const activeTabData = editorTabs.find((tab) => tab.path === activeTab);

  if (!activeTabData || !activeTabData.isDirty || !activeTab) {
    return null;
  }

  const handleAccept = () => {
    useAppStore.setState((state) => ({
      editorTabs: state.editorTabs.map((tab) =>
        tab.path === activeTab ? { ...tab, originalContent: tab.content, isDirty: false } : tab
      ),
    }));
  };

  const handleReject = () => {
    updateTabContent(activeTab, activeTabData.originalContent);
  };

  const handleClose = () => {
    closeTab(activeTab);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Diff toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-bg-primary border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary">Comparing changes</span>
          <span className="text-xs text-text-muted">({activeTabData.name})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAccept}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Accept
          </button>
          <button
            onClick={handleReject}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Reject
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Diff editor - using Monaco's diff editor mode */}
      <div className="flex-1">
        <Editor
          height="100%"
          language={activeTabData.language || 'plaintext'}
          value={activeTabData.content}
          theme="vs-dark"
          options={{
            readOnly: true,
            automaticLayout: true,
            fontSize: 14,
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
            lineNumbers: 'on',
            renderWhitespace: 'selection',
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  );
}
