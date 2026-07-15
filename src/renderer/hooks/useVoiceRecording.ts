/**
 * Hook for recording audio via the browser's MediaRecorder API.
 *
 * Handles microphone permission, recording lifecycle, and audio blob creation.
 * Does NOT handle transcription — that's the caller's responsibility.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVoiceRecordingOptions {
  /** Called when recording stops with the audio blob */
  onRecordingComplete: (blob: Blob) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
}

export function useVoiceRecording({ onRecordingComplete, onError }: UseVoiceRecordingOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null); // null = unknown
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setHasPermission(true);

      // Determine supported mime type
      const mimeTypes = ['audio/webm', 'audio/ogg', 'audio/mp4'];
      let selectedMime = '';
      for (const mime of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mime)) {
          selectedMime = mime;
          break;
        }
      }

      // Start recording
      const options = selectedMime ? { mimeType: selectedMime } : {};
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: selectedMime || 'audio/webm',
        });
        onRecordingComplete(blob);
        resetState();
      };

      mediaRecorder.onerror = () => {
        setError('Recording error occurred');
        onError?.('Recording error occurred');
        stopRecording();
      };

      mediaRecorder.start(100); // Collect data every 100ms
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start duration timer
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setHasPermission(false);
        setError('Microphone access denied. Enable in browser settings.');
        onError?.('Microphone access denied');
      } else if (err.name === 'NotFoundError') {
        setError('No microphone detected. Connect a microphone to use voice input.');
        onError?.('No microphone detected');
      } else {
        setError('Failed to access microphone: ' + (err.message || 'Unknown error'));
        onError?.(err.message || 'Failed to access microphone');
      }
    }
  }, [onRecordingComplete, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanup();
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const resetState = useCallback(() => {
    setDuration(0);
    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    isRecording,
    hasPermission,
    duration,
    error,
    startRecording,
    stopRecording,
  };
}
