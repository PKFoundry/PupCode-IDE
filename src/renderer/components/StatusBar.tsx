import { Wifi, WifiOff, GitBranch } from 'lucide-react';
import useAppStore from '../store/useAppStore';

function StatusBar() {
  const { sidecarConnected, activeModel, activeAgent, messages } = useAppStore();

  // Calculate total tokens from messages
  const totalTokens = messages.reduce((sum, msg) => {
    if (msg.usage) {
      return sum + msg.usage.input_tokens + msg.usage.output_tokens;
    }
    return sum;
  }, 0);

  return (
    <div className="h-6 bg-accent/10 border-t border-border flex items-center px-3 gap-4 text-[11px] text-text-muted select-none">
      {/* Connection Status */}
      <div className="flex items-center gap-1.5">
        {sidecarConnected ? (
          <>
            <Wifi className="w-3 h-3 text-green-400" />
            <span className="text-green-400">Connected</span>
          </>
        ) : (
          <>
            <WifiOff className="w-3 h-3 text-red-400" />
            <span className="text-red-400">Disconnected</span>
          </>
        )}
      </div>

      {/* Separator */}
      <div className="w-px h-3 bg-border/50" />

      {/* Model */}
      {activeModel && (
        <>
          <span>Model: {activeModel}</span>
          <div className="w-px h-3 bg-border/50" />
        </>
      )}

      {/* Agent */}
      {activeAgent && (
        <>
          <span>Agent: {activeAgent}</span>
          <div className="w-px h-3 bg-border/50" />
        </>
      )}

      {/* Token Count */}
      {totalTokens > 0 && (
        <>
          <span>Tokens: {totalTokens.toLocaleString()}</span>
          <div className="w-px h-3 bg-border/50" />
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Git Branch (placeholder) */}
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3 h-3" />
        <span>main</span>
      </div>

      {/* Version */}
      <span className="ml-2">v0.1.0</span>
    </div>
  );
}

export default StatusBar;
