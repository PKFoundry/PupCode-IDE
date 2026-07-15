import { Loader2 } from 'lucide-react';
import useAppStore from '../store/useAppStore';

function LoadingOverlay() {
  const { showLoading, loadingMessage } = useAppStore();

  if (!showLoading) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 p-8 bg-bg-secondary rounded-xl border border-border shadow-2xl">
        <Loader2 className="w-10 h-10 text-accent animate-spin" />
        <p className="text-text-primary font-medium text-lg">{loadingMessage || 'Loading...'}</p>
      </div>
    </div>
  );
}

export default LoadingOverlay;
