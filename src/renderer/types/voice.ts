/** Voice input configuration stored in ~/.pupcode_ide/voice.json */
export interface VoiceConfig {
  enabled: boolean;
  base_url: string;
  model: string;
  api_key: string;
  language: string;
  chunk_duration_seconds: number;
}
