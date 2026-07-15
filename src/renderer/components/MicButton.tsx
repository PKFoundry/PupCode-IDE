import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { getSidecarClient } from '../services/sidecar';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

export default function MicButton() {
  const { voiceConfig, isStreaming } = useAppStore();
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const recordingRef = useRef({ isRecording: false, startRecording: null as any, stopRecording: null as any });

  const handleRecordingComplete = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    setTranscribeError(null);

    try {
      const { sidecarPort } = useAppStore.getState();
      if (!sidecarPort) throw new Error('Sidecar not running');

      // Send as multipart/form-data with the audio file
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');

      const client = getSidecarClient(sidecarPort);
      const data = await client.transcribeAudio(formData);
      const transcript = data.text?.trim();

      if (!transcript) {
        throw new Error('Could not detect speech. Try again in a quieter environment.');
      }

      // Auto-send through normal chat flow
      useAppStore.getState().sendMessage(transcript);
    } catch (err: any) {
      setTranscribeError(err.message || 'Transcription failed');
      console.error('Voice transcription error:', err);
    } finally {
      setTranscribing(false);
    }
  }, []);

  const {
    isRecording,
    hasPermission,
    duration,
    error: recordingError,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    onRecordingComplete: handleRecordingComplete,
    onError: (err) => setTranscribeError(err),
  });

  // Keep ref up-to-date for keyboard shortcut handler
  recordingRef.current = { isRecording, startRecording, stopRecording };

  // Listen for Ctrl+M toggle event
  useEffect(() => {
    const handler = () => {
      const { isRecording, startRecording, stopRecording } = recordingRef.current;
      if (!startRecording || !stopRecording) return;
      if (isRecording) {
        stopRecording();
      } else if (!transcribing && !isStreaming) {
        startRecording();
      }
    };
    window.addEventListener('toggle-voice-recording', handler);
    return () => window.removeEventListener('toggle-voice-recording', handler);
  }, [transcribing, isStreaming]);

  // Don't render if voice is disabled
  if (!voiceConfig.enabled) return null;

  const handleClick = () => {
    if (isRecording) {
      stopRecording();
    } else if (!transcribing && !isStreaming) {
      startRecording();
    }
  };

  const isDisabled = transcribing || isStreaming || hasPermission === false;
  const formattedDuration = `${Math.floor(duration / 60).toString().padStart(2, '0')}:${(duration % 60).toString().padStart(2, '0')}`;

  return (
    <div className="relative">
      <button
        onClick={handleClick}
        disabled={isDisabled}
        className={`p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
          isRecording
            ? 'bg-red-500 text-white animate-pulse-slow'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
        }`}
        title={
          isStreaming
            ? 'Wait for response to finish'
            : isRecording
            ? 'Click to stop recording'
            : transcribing
            ? 'Transcribing...'
            : hasPermission === false
            ? 'Microphone access denied'
            : 'Voice input'
        }
      >
        {transcribing ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isRecording ? (
          <Square className="w-4 h-4 fill-current" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
      </button>

      {/* Duration display */}
      {isRecording && (
        <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-text-muted font-mono whitespace-nowrap">
          {formattedDuration}
        </span>
      )}

      {/* Error tooltip */}
      {(recordingError || transcribeError) && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-red-500/90 text-white text-[10px] rounded whitespace-nowrap max-w-48">
          {recordingError || transcribeError}
        </div>
      )}
    </div>
  );
}
