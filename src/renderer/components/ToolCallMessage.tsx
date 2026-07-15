import { Wrench, FileText, Terminal, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { ChatMessage } from '../store/useChatStore';

/** Convert snake_case agent name to Title Case, truncate to 30 chars. */
export function formatAgentName(agentName: string): string {
  const formatted = agentName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return formatted.length > 30 ? formatted.slice(0, 30) + '\u2026' : formatted;
}

function formatToolName(toolName?: string): string {
  if (!toolName) return 'unknown';
  return toolName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function ToolIcon({ toolName }: { toolName?: string }) {
  if (!toolName) return <Wrench className="w-3.5 h-3.5 text-text-muted" />;

  if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write') || toolName.includes('create') || toolName.includes('delete') || toolName.includes('replace')) {
    return <FileText className="w-3.5 h-3.5 text-blue-400" />;
  }
  if (toolName.includes('shell') || toolName.includes('command') || toolName.includes('run')) {
    return <Terminal className="w-3.5 h-3.5 text-yellow-400" />;
  }
  if (toolName.includes('grep') || toolName.includes('search')) {
    return <Search className="w-3.5 h-3.5 text-purple-400" />;
  }
  return <Wrench className="w-3.5 h-3.5 text-text-muted" />;
}

function ToolArgsPreview({ args, toolName }: { args: Record<string, any>; toolName?: string }) {
  if (!args || Object.keys(args).length === 0) return null;

  // Smart preview based on tool type
  if (toolName?.includes('file') || toolName?.includes('read') || toolName?.includes('write') || toolName?.includes('create') || toolName?.includes('delete') || toolName?.includes('replace')) {
    const filePath = args.file_path || args.path || args.source_path || args.old_path;
    if (filePath) {
      return (
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-secondary">
          <FileText className="w-3 h-3 text-blue-400/70" />
          <span className="truncate">{filePath}</span>
        </div>
      );
    }
  }

  if (toolName?.includes('shell') || toolName?.includes('command') || toolName?.includes('run')) {
    const cmd = args.command;
    if (cmd) {
      return (
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-secondary">
          <Terminal className="w-3 h-3 text-yellow-400/70" />
          <span className="truncate">{String(cmd).slice(0, 100)}</span>
        </div>
      );
    }
  }

  if (toolName?.includes('grep') || toolName?.includes('search')) {
    const searchStr = args.search_string || args.pattern || args.query;
    const dir = args.directory || args.path || '.';
    if (searchStr) {
      return (
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-secondary">
            <Search className="w-3 h-3 text-purple-400/70" />
            <span className="truncate">"{searchStr}"</span>
          </div>
          {dir !== '.' && (
            <div className="text-[10px] text-text-muted ml-4">in {dir}</div>
          )}
        </div>
      );
    }
  }

  // Generic fallback: show first few args
  return (
    <div className="space-y-0.5">
      {Object.entries(args)
        .filter(([k]) => !k.startsWith('_'))
        .slice(0, 3)
        .map(([k, v]) => (
          <div key={k} className="text-[10px] font-mono">
            <span className="text-text-muted">{k}:</span>{' '}
            <span className="text-text-secondary truncate">{String(v).slice(0, 80)}</span>
          </div>
        ))}
    </div>
  );
}

interface ToolCallMessageProps {
  message: ChatMessage;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export default function ToolCallMessage({ message, onContextMenu }: ToolCallMessageProps) {
  return (
    <div className="flex gap-2 animate-fade-in" onContextMenu={onContextMenu}>
      <span className="text-xs flex-shrink-0 mt-1"></span>
      <div className="max-w-[85%] rounded-lg border transition-colors duration-200 overflow-hidden"
        style={{
          borderColor: message.tool_status === 'error' ? 'rgba(239,68,68,0.3)' :
                       message.tool_status === 'success' ? 'rgba(34,197,94,0.3)' :
                       'rgba(100,116,139,0.2)',
          backgroundColor: 'rgba(0,0,0,0.2)',
        }}
      >
        {/* Header: tool name + status */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
          {/* Icon based on tool type */}
          <ToolIcon toolName={message.tool_name} />

          {/* Tool name */}
          <span className="text-xs font-semibold text-text-primary capitalize">
            {formatToolName(message.tool_name)}
          </span>

          {/* Status badge */}
          {message.tool_status === 'running' && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running...
            </span>
          )}
          {message.tool_status === 'success' && (
            <span className="flex items-center gap-1 text-[10px] text-green-400 ml-auto">
              <CheckCircle2 className="w-3 h-3" />
              {message.tool_duration_ms && `${Math.round(message.tool_duration_ms)}ms`}
            </span>
          )}
          {message.tool_status === 'error' && (
            <span className="flex items-center gap-1 text-[10px] text-red-400 ml-auto">
              <XCircle className="w-3 h-3" />
              Failed
            </span>
          )}
        </div>

        {/* Body: args + result */}
        <div className="px-3 py-2 space-y-1.5">
          {/* Tool args preview */}
          {message.tool_args && (
            <ToolArgsPreview args={message.tool_args} toolName={message.tool_name} />
          )}

          {/* Result summary */}
          {message.tool_result_summary && message.tool_status !== 'running' && (
            <div className="text-[11px] text-text-secondary font-mono mt-2 pt-2 border-t border-white/5">
              {message.tool_result_summary}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
