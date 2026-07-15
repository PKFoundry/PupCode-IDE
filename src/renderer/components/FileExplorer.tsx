import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import useAppStore, { FileNode } from '../store/useAppStore';
import { ChevronRight, ChevronDown, Folder, FolderOpen, File, Search, RefreshCw, Edit2, Trash2, Copy, FolderPlus, FilePlus, ExternalLink } from 'lucide-react';
import { getSidecarClient } from '../services/sidecar';
import ContextMenu, { ContextMenuItem } from './ContextMenu';

// File extension colors
const FILE_COLORS: Record<string, string> = {
  ts: 'text-blue-400',
  tsx: 'text-blue-400',
  js: 'text-yellow-400',
  jsx: 'text-yellow-400',
  py: 'text-green-400',
  json: 'text-yellow-300',
  md: 'text-text-muted',
  css: 'text-purple-400',
  html: 'text-orange-400',
  yaml: 'text-red-400',
  yml: 'text-red-400',
  toml: 'text-red-400',
  sh: 'text-gray-400',
  lock: 'text-gray-500',
  env: 'text-red-300',
};

function getFileColor(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()?.toLowerCase() || '' : '';
  return FILE_COLORS[ext] || 'text-text-muted';
}

function TreeNode({
  node, depth = 0,
  onRequestNewFile,
  onRequestNewFolder,
}: {
  node: FileNode;
  depth?: number;
  onRequestNewFile: (parentPath: string) => void;
  onRequestNewFolder: (parentPath: string) => void;
}) {
  const { expandedPaths, selectedFile, toggleExpand, selectFile, openFile, refreshFileTree, sidecarPort } = useAppStore();
  const isExpanded = expandedPaths.has(node.path);
  const isSelected = selectedFile === node.path;
  const isModified = useAppStore((s) => s.modifiedFiles.has(node.path));
  const isAgentModified = useAppStore((s) => s.agentModifiedFiles.has(node.path));
  const [hovered, setHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = useCallback(() => {
    if (node.is_directory) {
      toggleExpand(node.path);
      if (node.children === null && !isExpanded) {
        loadSubDirectory(node.path);
      }
    } else {
      selectFile(node.path);
      openFile(node.path);
    }
  }, [node, isExpanded, toggleExpand, selectFile, openFile]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRename = useCallback(async () => {
    if (!sidecarPort || !renameValue.trim()) return;
    const newName = renameValue.trim();
    const sep = node.path.includes('/') ? '/' : '\\';
    const parentDir = node.path.substring(0, node.path.lastIndexOf(sep) + 1);
    const newPath = parentDir + newName;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.renameFile(node.path, newPath);
      if (data.success) {
        setRenaming(false);
        refreshFileTree();
      }
    } catch (err) {
      console.error('Failed to rename:', err);
    }
  }, [sidecarPort, renameValue, node.path, refreshFileTree]);

  const handleDelete = useCallback(async () => {
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.deleteFile(node.path);
      if (data.success) refreshFileTree();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  }, [sidecarPort, node.path, refreshFileTree]);

  const handleDuplicate = useCallback(async () => {
    if (!sidecarPort) return;
    try {
      const client = getSidecarClient(sidecarPort);
      const data = await client.duplicateFile(node.path);
      if (data.success) refreshFileTree();
    } catch (err) {
      console.error('Failed to duplicate:', err);
    }
  }, [sidecarPort, node.path, refreshFileTree]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(node.path);
    } catch (err) {
      console.error('Failed to copy path:', err);
    }
  }, [node.path]);

  const handleCopyName = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(node.name);
    } catch (err) {
      console.error('Failed to copy name:', err);
    }
  }, [node.name]);

  const handleNewFile = useCallback(() => {
    onRequestNewFile(node.path);
  }, [onRequestNewFile, node.path]);

  const handleNewFolder = useCallback(() => {
    onRequestNewFolder(node.path);
  }, [onRequestNewFolder, node.path]);

  const handleOpenContainingFolder = useCallback(() => {
    const dir = node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : node.path.substring(0, node.path.lastIndexOf('\\'));
    invoke('open', { path: dir }).catch(console.error);
  }, [node.path]);

  const contextItems: ContextMenuItem[] = [
    { id: 'open', label: node.is_directory ? 'Expand' : 'Open', icon: <File className="w-3.5 h-3.5" />, onClick: handleClick },
    { id: 'rename', label: 'Rename', icon: <Edit2 className="w-3.5 h-3.5" />, onClick: () => { setRenaming(true); setRenameValue(node.name); setTimeout(() => inputRef.current?.focus(), 0); } },
    { id: 'copy-path', label: 'Copy Path', icon: <Copy className="w-3.5 h-3.5" />, onClick: handleCopyPath },
    { id: 'copy-name', label: 'Copy Name', icon: <Copy className="w-3.5 h-3.5" />, onClick: handleCopyName },
  ];

  if (!node.is_directory) {
    contextItems.push({ id: 'duplicate', label: 'Duplicate', icon: <FilePlus className="w-3.5 h-3.5" />, onClick: handleDuplicate });
  }

  contextItems.push(
    { id: 'divider-delete', label: '', onClick: () => {} },
    { id: 'delete', label: 'Delete', icon: <Trash2 className="w-3.5 h-3.5" />, onClick: handleDelete, danger: true }
  );

  if (node.is_directory) {
    contextItems.push(
      { id: 'divider-new', label: '', onClick: () => {} },
      { id: 'new-file', label: 'New File', icon: <FilePlus className="w-3.5 h-3.5" />, onClick: handleNewFile },
      { id: 'new-folder', label: 'New Folder', icon: <FolderPlus className="w-3.5 h-3.5" />, onClick: handleNewFolder }
    );
  }

  return (
    <div>
      <div
        className={`group flex items-center h-6 cursor-pointer select-none text-sm rounded mx-1 ${
          isSelected
            ? 'bg-blue-600/30 text-blue-200'
            : hovered
            ? 'bg-white/5 text-text-primary'
            : 'text-text-secondary'
        }`}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        tabIndex={0}
        role="treeitem"
        aria-expanded={node.is_directory ? isExpanded : undefined}
        aria-selected={isSelected}
      >
        {/* Expand/collapse */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {node.is_directory ? (
            isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 opacity-70" />
            )
          ) : (
            <div className="w-3.5" />
          )}
        </div>

        {/* Icon */}
        <div className={`w-4 h-4 flex items-center justify-center flex-shrink-0 mr-1.5 ${node.is_directory ? 'text-blue-400' : getFileColor(node.name)}`}>
          {node.is_directory ? (
            isExpanded ? <FolderOpen className="w-4 h-4" /> : <Folder className="w-4 h-4" />
          ) : (
            <File className="w-4 h-4" />
          )}
        </div>

        {/* Name */}
        {renaming ? (
          <input
            ref={inputRef}
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename();
              if (e.key === 'Escape') { setRenaming(false); setRenameValue(node.name); }
            }}
            className="flex-1 bg-bg-primary border border-accent rounded px-1 text-sm outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-1">
          {isAgentModified && <span className="w-2 h-2 rounded-full bg-green-400" title="Modified by agent" />}
          {isModified && !isAgentModified && <span className="w-2 h-2 rounded-full bg-yellow-400" title="Modified externally" />}
          {node.is_directory && node.children === null && isExpanded && (
            <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Children */}
      {node.is_directory && isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1}
              onRequestNewFile={onRequestNewFile}
              onRequestNewFolder={onRequestNewFolder}
            />
          ))}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu items={contextItems} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}
    </div>
  );
}

// Lazy load subdirectory
async function loadSubDirectory(path: string) {
  const { sidecarPort, fileTree } = useAppStore.getState();
  if (!sidecarPort) return;

  try {
    const client = getSidecarClient(sidecarPort);
    const data = await client.getFileTree(path);
    if (data.tree) {
      const updateNodeChildren = (nodes: FileNode[]): FileNode[] =>
        nodes.map((n) =>
          n.path === path
            ? { ...n, children: data.tree }
            : n.is_directory && n.children
            ? { ...n, children: updateNodeChildren(n.children) }
            : n
        );
      useAppStore.setState({ fileTree: updateNodeChildren(fileTree) });
    }
  } catch (err) {
    console.error('Failed to load subdirectory:', err);
  }
}

// ── Text Input Dialog ──────────────────────────────────────────────────────
// Replaces unreliable window.prompt() in WKWebView.
// Renders a centered overlay with a single text input (dark theme).
// Accessible: role="dialog", aria-modal, focus trap, keyboard navigation.

interface TextInputDialogProps {
  title: string;
  placeholder: string;
  confirmLabel: string;
  errorMessage?: string;
  onConfirm: (value: string) => void;
  onError: (message: string) => void;
  onCancel: () => void;
}

function TextInputDialog({
  title,
  placeholder,
  confirmLabel,
  errorMessage,
  onConfirm,
  onError,
  onCancel,
}: TextInputDialogProps) {
  const [value, setValue] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input, button, [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && value.trim()) {
      onConfirm(value.trim());
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const overlay = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={handleTabKey}
        className="bg-bg-primary border border-white/10 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="dialog-title" className="text-sm font-semibold text-text-primary">
          {title}
        </h3>
        {errorMessage && (
          <p className="text-xs text-red-400">{errorMessage}</p>
        )}
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (errorMessage) onError('');
          }}
          onKeyDown={handleInputKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-xs bg-bg-secondary border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-blue-500/30"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs text-text-muted hover:text-text-primary rounded-lg hover:bg-bg-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => value.trim() && onConfirm(value.trim())}
            disabled={!value.trim()}
            className="px-4 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function FileExplorer() {
  const { fileTree, refreshFileTree, workingDir, loadFileTree, sidecarPort } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Dialog state for New File / New Folder (single owner — FINDING 2/5 fix)
  const [dialogConfig, setDialogConfig] = useState<{
    title: string;
    placeholder: string;
    confirmLabel: string;
    targetPath: string;
    isDirectory: boolean;
    errorMessage?: string;
  } | null>(null);

  const handleDialogCancel = useCallback(() => {
    setDialogConfig(null);
  }, []);

  useEffect(() => {
    if (workingDir) {
      loadFileTree(workingDir);
    }
  }, [workingDir, loadFileTree]);

  const filterTree = useCallback(
    (nodes: FileNode[], query: string): FileNode[] => {
      if (!query) return nodes;
      const q = query.toLowerCase();
      return nodes
        .map((node) => {
          if (node.name.toLowerCase().includes(q)) return node;
          if (node.is_directory && node.children) {
            const filteredChildren = filterTree(node.children, q);
            if (filteredChildren.length > 0) {
              return { ...node, children: filteredChildren, is_directory: true };
            }
          }
          return null;
        })
        .filter((n): n is FileNode => n !== null);
    },
    []
  );

  const filteredTree = filterTree(fileTree, searchQuery);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Callbacks for TreeNode to request dialog opening (FINDING 2/5 fix)
  const handleRequestNewFile = useCallback((parentPath: string) => {
    setDialogConfig({
      title: 'New File',
      placeholder: 'untitled.txt',
      confirmLabel: 'Create',
      targetPath: parentPath,
      isDirectory: false,
    });
  }, []);

  const handleRequestNewFolder = useCallback((parentPath: string) => {
    setDialogConfig({
      title: 'New Folder',
      placeholder: 'untitled-folder',
      confirmLabel: 'Create',
      targetPath: parentPath,
      isDirectory: true,
    });
  }, []);

  // Confirm handler executes against dialogConfig.targetPath (FINDING 3 fix)
  const handleDialogConfirm = useCallback((name: string) => {
    if (!dialogConfig || !sidecarPort) return;
    // Use targetPath from dialogConfig, not a closure variable (FINDING 3)
    const fullPath = dialogConfig.targetPath + '/' + name;
    getSidecarClient(sidecarPort)
      .createNewFile(fullPath, dialogConfig.isDirectory)
      .then((data) => {
        if (data.success) {
          setDialogConfig(null);
          refreshFileTree();
        }
      })
      .catch((_err) => {
        // Show error inline in dialog (FINDING 6)
        setDialogConfig((prev) =>
          prev ? { ...prev, errorMessage: 'Failed to create item.' } : null
        );
      });
  }, [dialogConfig, sidecarPort, refreshFileTree]);

  const handleDialogError = useCallback((msg: string) => {
    setDialogConfig((prev) => (prev ? { ...prev, errorMessage: msg } : null));
  }, []);

  const contextItems: ContextMenuItem[] = [
    { id: 'new-file', label: 'New File', icon: <FilePlus className="w-3.5 h-3.5" />, onClick: () => workingDir && handleRequestNewFile(workingDir) },
    { id: 'new-folder', label: 'New Folder', icon: <FolderPlus className="w-3.5 h-3.5" />, onClick: () => workingDir && handleRequestNewFolder(workingDir) },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Explorer</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowSearch(!showSearch);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
            title="Search files"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => workingDir && refreshFileTree()}
            className="p-1 rounded hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-2 py-1 border-b border-white/10">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter files..."
            className="w-full px-2 py-1 text-xs bg-bg-secondary border border-white/10 rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-blue-500/50"
          />
        </div>
      )}

      {/* Tree */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden py-1"
        role="tree"
        aria-label="File explorer"
        onContextMenu={handleContextMenu}
      >
        {filteredTree.length === 0 ? (
          <div className="px-3 py-4 text-xs text-text-muted text-center">
            {workingDir ? (searchQuery ? 'No files match' : 'Empty folder') : 'No project opened'}
          </div>
        ) : (
          filteredTree.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              onRequestNewFile={handleRequestNewFile}
              onRequestNewFolder={handleRequestNewFolder}
            />
          ))
        )}
      </div>

      {/* Context Menu for empty space */}
      {contextMenu && (
        <ContextMenu items={contextItems} x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} />
      )}

      {/* New File/Folder Input Dialog */}
      {dialogConfig && (
        <TextInputDialog
          title={dialogConfig.title}
          placeholder={dialogConfig.placeholder}
          confirmLabel={dialogConfig.confirmLabel}
          errorMessage={dialogConfig.errorMessage}
          onConfirm={handleDialogConfirm}
          onError={handleDialogError}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
}
