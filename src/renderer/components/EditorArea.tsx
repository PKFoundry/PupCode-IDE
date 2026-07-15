import { useCallback, useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import useAppStore from '../store/useAppStore';
import { X, Dot, GitCompareArrows, Check, RotateCcw, Code, Eye } from 'lucide-react';
import MarkdownPreview from './MarkdownPreview';
import PositionalPortal from './PositionalPortal';

export default function EditorArea() {
  const { editorTabs, activeTab, updateTabContent, saveFile, workingDir } = useAppStore();
  const activeTabData = editorTabs.find((tab) => tab.path === activeTab);
  const [showDiff, setShowDiff] = useState(false);

  // Reset diff view when active tab changes
  useEffect(() => {
    setShowDiff(false);
  }, [activeTab]);

  // Reset diff view when dirty state clears (e.g. after accept/reject)
  useEffect(() => {
    if (!activeTabData?.isDirty) {
      setShowDiff(false);
    }
  }, [activeTabData?.isDirty]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (activeTab && value !== undefined) {
        updateTabContent(activeTab, value);
      }
    },
    [activeTab, updateTabContent]
  );

  const handleEditorMount = useCallback(
    (editor: any, monaco: any) => {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (activeTab) saveFile(activeTab);
      });
    },
    [activeTab, saveFile]
  );

  if (editorTabs.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-secondary">
        <div className="text-center">
          <div className="text-5xl mb-4">🐶</div>
          <p className="text-text-muted text-lg">Select a file to open</p>
          <p className="text-text-muted text-sm mt-1">or ask the agent to create one</p>
        </div>
      </div>
    );
  }

  const hasChanges = activeTabData?.isDirty;

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar - fixed, never moves */}
      <div className="flex items-center bg-bg-primary border-b border-white/10 overflow-x-auto scrollbar-thin flex-shrink-0">
        {editorTabs.map((tab) => (
          <TabItem key={tab.path} tab={tab} />
        ))}
      </div>

      {/* Diff toggle bar - sits between tabs and editor */}
      {hasChanges && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-green-900/20 border-b border-green-500/30 flex-shrink-0">
          <span className="text-xs text-green-400 truncate mr-2">
            ⚠ {activeTabData?.name} has unsaved changes
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            {showDiff ? (
              <>
                <button
                  onClick={() => {
                    if (activeTab) useAppStore.getState().saveFile(activeTab);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  Accept
                </button>
                <button
                  onClick={() => {
                    if (activeTab && activeTabData) {
                      useAppStore.getState().updateTabContent(activeTab, activeTabData.originalContent);
                    }
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-red-600/20 text-red-400 rounded hover:bg-red-600/30 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reject
                </button>
                <button
                  onClick={() => setShowDiff(false)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-white/10 text-text-muted rounded hover:bg-white/20 transition-colors"
                >
                  Edit
                </button>
              </>
            ) : (
              <button
                onClick={() => setShowDiff(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-green-600/20 text-green-400 rounded hover:bg-green-600/30 transition-colors"
              >
                <GitCompareArrows className="w-3.5 h-3.5" />
                View Diff
              </button>
            )}
          </div>
        </div>
      )}

      {/* Editor - takes remaining space */}
      {activeTabData && (
        <div className="flex-1 min-h-0">
          {activeTabData.isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : showDiff && hasChanges ? (
            <div className="flex h-full">
              <div className="flex-1 flex flex-col border-r border-white/10">
                <div className="px-2 py-1 bg-red-900/20 text-xs text-red-400">Original</div>
                <Editor
                  height="100%"
                  language={activeTabData.language || 'plaintext'}
                  value={activeTabData.originalContent}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    fontSize: 14,
                    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    lineNumbers: 'on',
                  }}
                />
              </div>
              <div className="flex-1 flex flex-col">
                <div className="px-2 py-1 bg-green-900/20 text-xs text-green-400">Modified</div>
                <Editor
                  height="100%"
                  language={activeTabData.language || 'plaintext'}
                  value={activeTabData.content}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    fontSize: 14,
                    fontFamily: '"JetBrains Mono", "Fira Code", Consolas, monospace',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    lineNumbers: 'on',
                  }}
                />
              </div>
            </div>
          ) : activeTabData.viewMode === 'preview' && activeTabData.name.endsWith('.md') ? (
            <MarkdownPreview content={activeTabData.content} workingDir={workingDir || ''} />
          ) : (
            <Editor
              height="100%"
              language={activeTabData.language || 'plaintext'}
              value={activeTabData.content}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: 14,
                fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                lineNumbers: 'on',
                renderWhitespace: 'selection',
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                formatOnPaste: true,
                formatOnType: true,
                wordWrap: 'off',
                padding: { top: 8, bottom: 8 },
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TabItem({ tab }: { tab: { path: string; name: string; isDirty: boolean; isLoading: boolean; viewMode?: 'raw' | 'preview' } }) {
  const { activeTab, closeTab, setTabViewMode } = useAppStore();
  const isActive = activeTab === tab.path;
  const isMarkdown = tab.name.endsWith('.md');

  return (
    <div
      className={`group flex items-center gap-1.5 px-3 py-2 text-sm cursor-pointer border-r border-white/10 min-w-0 max-w-[200px] ${
        isActive
          ? 'bg-bg-secondary text-text-primary border-b-2 border-b-blue-500'
          : 'bg-bg-primary/50 text-text-muted hover:bg-bg-secondary hover:text-text-primary'
      }`}
      onClick={() => {
        useAppStore.getState().setActiveTab(tab.path);
      }}
    >
      <span className="truncate">{tab.name}</span>
      {isActive && isMarkdown && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setTabViewMode(tab.path, tab.viewMode === 'preview' ? 'raw' : 'preview');
          }}
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs opacity-70 hover:opacity-100 hover:bg-white/10 transition-opacity flex-shrink-0"
          title={tab.viewMode === 'preview' ? 'Switch to Raw' : 'Switch to Preview'}
        >
          {tab.viewMode === 'preview' ? <Code className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </button>
      )}
      {tab.isDirty && <Dot className="w-3 h-3 text-white flex-shrink-0" />}
      {tab.isLoading && (
        <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          closeTab(tab.path);
        }}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/20 transition-opacity flex-shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
