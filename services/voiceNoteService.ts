/**
 * Voice Note Service
 * Records audio, transcribes via backend (OpenAI Whisper), and provides playback.
 */

import AudioRecorderPlayer, {
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncoderAudioQualityIOSType,
  AVEncodingOption,
  OutputFormatAndroidType,
} from 'react-native-audio-recorder-player';
import { Platform, PermissionsAndroid } from 'react-native';
import RNFS from 'react-native-fs';

const BASE_URL = 'https://dishitout-imageinhancer.onrender.com';

const audioRecorderPlayer = new AudioRecorderPlayer();

/**
 * Request microphone permission (Android only — iOS handled via Info.plist)
 */
export const requestMicrophonePermission = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: 'Microphone Permission',
          message: 'Forkful needs access to your microphone to record voice notes.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.error('❌ VoiceNote: Permission error:', err);
      return false;
    }
  }
  return true; // iOS permission handled automatically on first record
};

/**
 * Start recording audio
 * Returns the file path where audio will be saved
 */
export const startRecording = async (): Promise<string> => {
  const hasPermission = await requestMicrophonePermission();
  if (!hasPermission) {
    throw new Error('Microphone permission not granted');
  }

  // On iOS, let the library pick the default path (avoids file path issues)
  // On Android, specify the cache directory
  const filePath = Platform.OS === 'android'
    ? `${RNFS.CachesDirectoryPath}/voice_note_${Date.now()}.mp4`
    : undefined; // undefined = library uses default temp path on iOS

  console.log('🎙️ VoiceNote: Starting recording, path:', filePath || 'default (iOS)');

  // Lower bitrate for faster upload — voice is fine at 32kbps mono
  const audioSet = Platform.OS === 'android'
    ? {
        AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
        AudioSourceAndroid: AudioSourceAndroidType.MIC,
        OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
        AudioSamplingRateAndroid: 16000,
        AudioChannelsAndroid: 1,
        AudioEncodingBitRateAndroid: 32000,
      }
    : {
        AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.medium,
        AVNumberOfChannelsKeyIOS: 1,
        AVFormatIDKeyIOS: AVEncodingOption.aac,
        AVSampleRateKeyIOS: 16000,
        AVEncoderBitRateKeyIOS: 32000,
      };

  const result = await audioRecorderPlayer.startRecorder(filePath, audioSet);
  console.log('🎙️ VoiceNote: Recording started at:', result);

  return result; // The library returns the actual file path used
};

/**
 * Stop recording and return the file path
 */
export const stopRecording = async (): Promise<string> => {
  const result = await audioRecorderPlayer.stopRecorder();
  audioRecorderPlayer.removeRecordBackListener();
  console.log('🎙️ VoiceNote: Recording stopped:', result);
  return result;
};

/**
 * Start playback of a recorded file
 */
export const startPlayback = async (filePath: string): Promise<void> => {
  console.log('🔊 VoiceNote: Starting playback:', filePath);
  await audioRecorderPlayer.startPlayer(filePath);
};

/**
 * Stop playback
 */
export const stopPlayback = async (): Promise<void> => {
  console.log('🔊 VoiceNote: Stopping playback');
  await audioRecorderPlayer.stopPlayer();
  audioRecorderPlayer.removePlayBackListener();
};

/**
 * Subscribe to recording progress (elapsed time)
 */
export const onRecordProgress = (callback: (seconds: number) => void) => {
  audioRecorderPlayer.addRecordBackListener((e) => {
    callback(Math.floor(e.currentPosition / 1000));
  });
};

/**
 * Subscribe to playback progress
 */
export const onPlaybackProgress = (callback: (current: number, duration: number) => void) => {
  audioRecorderPlayer.addPlayBackListener((e) => {
    callback(
      Math.floor(e.currentPosition / 1000),
      Math.floor(e.duration / 1000)
    );
  });
};

/**
 * Transcribe an audio file via the backend (OpenAI Whisper)
 */
export interface TranscriptionResult {
  transcript: string;
  bulletPoints?: string;
}

export const transcribeVoiceNote = async (filePath: string): Promise<TranscriptionResult | null> => {
  try {
    console.log('🎙️ VoiceNote: Transcribing:', filePath);

    const formData = new FormData();
    formData.append('audio', {
      uri: Platform.OS === 'ios' ? filePath : `file://${filePath}`,
      type: 'audio/m4a',
      name: 'voice_note.m4a',
    } as any);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout (Whisper only + cold start)

    const response = await fetch(`${BASE_URL}/transcribe-voice-note`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ VoiceNote: Transcription HTTP error:', response.status, errorText);
      throw new Error(`Transcription failed: ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.transcript) {
      console.log('✅ VoiceNote: Transcript:', result.transcript);
      if (result.bullet_points) {
        console.log('✅ VoiceNote: Bullets:', result.bullet_points);
      }
      return {
        transcript: result.transcript,
        bulletPoints: result.bullet_points || undefined,
      };
    } else {
      console.error('❌ VoiceNote: Transcription failed:', result.error);
      return null;
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error('❌ VoiceNote: Transcription timed out');
    } else {
      console.error('❌ VoiceNote: Transcription error:', error);
    }
    return null;
  }
};

/**
 * Clean up a recorded file
 */
export const deleteRecording = async (filePath: string): Promise<void> => {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
      console.log('🗑️ VoiceNote: Deleted recording:', filePath);
    }
  } catch (e) {
    console.warn('⚠️ VoiceNote: Failed to delete recording:', e);
  }
};
