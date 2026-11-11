import type { TtsFormat, TtsLocalSpeechMode, TtsLocalVoiceEngine, TtsModel, TtsReadScope, TtsVoiceDesignPlaybackMode } from './models.js'
import type { SoundPack } from './sound.js'
import type { DoubaoTtsModel, TtsProvider } from './providers.js'
import {
  DEFAULT_MAX_MP3_AUDIO_BYTES,
  DEFAULT_MAX_PAUSED_PCM_BYTES,
  DEFAULT_MAX_WAV_AUDIO_BYTES,
  DEFAULT_MOSS_BASE_URL,
  TOKEN_PLAN_TTS_BASE_URL,
} from '../constants.js'
import { DEFAULT_SOUND_SETTINGS } from './sound.js'

export const ANNOUNCEMENT_SOURCES = ['dsh-pet', 'dsh-whale-musume', 'question-titles', 'approvals', 'job-results'] as const
export type AnnouncementSourceId = typeof ANNOUNCEMENT_SOURCES[number]

export interface TtsSettings {
  showInSidebar?: boolean
  showInHostSettings?: boolean
  showFeatureGuide?: boolean
  acceptExternalProviders?: boolean
  qqbotEnabled?: boolean
  qqbotMaxAutoCharacters?: number
  qqbotMaxDurationSeconds?: number
  announcementSources?: AnnouncementSourceId[]
  provider?: TtsProvider
  doubaoEnabled?: boolean
  doubaoApiKey?: string
  doubaoModel?: DoubaoTtsModel
  doubaoVoice?: string
  doubaoClonedVoice?: string
  doubaoInstruction?: string
  breezeEnabled?: boolean
  breezeApiKey?: string
  breezeVoice?: string
  breezeInstruction?: string
  enabled?: boolean
  apiKey?: string
  baseURL?: string
  model?: TtsModel
  localSpeechMode?: TtsLocalSpeechMode
  localVoiceURI?: string
  localVoiceEngine?: TtsLocalVoiceEngine
  mossEnabled?: boolean
  mossBaseURL?: string
  mossVoice?: string
  mossVoiceName?: string
  voice?: string
  voiceDesignPrompt?: string
  voiceDesignCustomPrompt?: string
  presetStylePrompt?: string
  /** @deprecated Retained for Host/API compatibility; Web playback selects its transport automatically. */
  format?: TtsFormat
  /** @deprecated Retained for settings migration; use readScope for user-facing playback range. */
  voiceDesignPlaybackMode?: TtsVoiceDesignPlaybackMode
  readScope?: TtsReadScope | 'first-segment'
  autoPlay?: boolean
  voiceInputCompatibility?: boolean
  inputAvoidance?: boolean
  importantAnnouncementsFirst?: boolean
  instruction?: string
  maxTextLength?: number
  requestTimeoutMs?: number
  maxMp3AudioBytes?: number
  maxWavAudioBytes?: number
  maxPausedPcmBytes?: number
  voiceVolume?: number
  voiceRate?: number
  soundEnabled?: boolean
  soundVolume?: number
  soundPack?: SoundPack
  taskSounds?: boolean
  clickSounds?: boolean
}

export interface ResolvedTtsSettings {
  showInSidebar: boolean
  showInHostSettings: boolean
  showFeatureGuide: boolean
  acceptExternalProviders: boolean
  qqbotEnabled: boolean
  qqbotMaxAutoCharacters: number
  qqbotMaxDurationSeconds: number
  announcementSources: AnnouncementSourceId[]
  provider: TtsProvider
  doubaoEnabled: boolean
  doubaoApiKey: string
  doubaoModel: DoubaoTtsModel
  doubaoVoice: string
  doubaoClonedVoice: string
  doubaoInstruction: string
  breezeEnabled: boolean
  breezeApiKey: string
  breezeVoice: string
  breezeInstruction: string
  enabled: boolean
  apiKey: string
  baseURL: string
  model: TtsModel
  localSpeechMode: TtsLocalSpeechMode
  localVoiceURI: string
  localVoiceEngine: TtsLocalVoiceEngine
  mossEnabled: boolean
  mossBaseURL: string
  mossVoice: string
  mossVoiceName: string
  voice: string
  voiceDesignPrompt: string
  voiceDesignCustomPrompt: string
  presetStylePrompt: string
  format: TtsFormat
  voiceDesignPlaybackMode: TtsVoiceDesignPlaybackMode
  readScope: TtsReadScope
  autoPlay: boolean
  voiceInputCompatibility: boolean
  inputAvoidance: boolean
  importantAnnouncementsFirst: boolean
  instruction: string
  maxTextLength: number
  requestTimeoutMs: number
  maxMp3AudioBytes: number
  maxWavAudioBytes: number
  maxPausedPcmBytes: number
  voiceVolume: number
  voiceRate: number
  soundEnabled: boolean
  soundVolume: number
  soundPack: SoundPack
  taskSounds: boolean
  clickSounds: boolean
}

/** Defaults shared by the Schemastery config and the Web settings form. */
export const DEFAULT_TTS_SETTINGS: ResolvedTtsSettings = {
  showInSidebar: false,
  showInHostSettings: true,
  showFeatureGuide: true,
  acceptExternalProviders: true,
  qqbotEnabled: false,
  qqbotMaxAutoCharacters: 0,
  qqbotMaxDurationSeconds: 0,
  announcementSources: ['dsh-whale-musume', 'question-titles'],
  provider: 'xiaomi',
  doubaoEnabled: true,
  doubaoApiKey: '',
  doubaoModel: 'seed-tts-2.0',
  doubaoVoice: 'zh_female_vv_uranus_bigtts',
  doubaoClonedVoice: '',
  doubaoInstruction: '',
  breezeEnabled: false,
  breezeApiKey: '',
  breezeVoice: 'voc_rh6e8hdbraz6',
  breezeInstruction: '',
  enabled: true,
  apiKey: '',
  baseURL: 'https://api.xiaomimimo.com/v1',
  model: 'mimo-v2.5-tts',
  localSpeechMode: 'auto',
  localVoiceURI: '',
  localVoiceEngine: 'browser',
  mossEnabled: false,
  mossBaseURL: DEFAULT_MOSS_BASE_URL,
  mossVoice: '',
  mossVoiceName: '',
  voice: '冰糖',
  voiceDesignPrompt: '青年女性,声线清亮、亲切自然,吐字清楚,语速适中,情绪温柔克制。',
  voiceDesignCustomPrompt: '青年女性,声线清亮、亲切自然,吐字清楚,语速适中,情绪温柔克制。',
  presetStylePrompt: '',
  format: 'pcm',
  voiceDesignPlaybackMode: 'complete',
  readScope: 'smart',
  autoPlay: false,
  voiceInputCompatibility: true,
  inputAvoidance: false,
  importantAnnouncementsFirst: false,
  instruction: '',
  maxTextLength: 12000,
  requestTimeoutMs: 120000,
  maxMp3AudioBytes: DEFAULT_MAX_MP3_AUDIO_BYTES,
  maxWavAudioBytes: DEFAULT_MAX_WAV_AUDIO_BYTES,
  maxPausedPcmBytes: DEFAULT_MAX_PAUSED_PCM_BYTES,
  voiceVolume: 1,
  voiceRate: 1,
  ...DEFAULT_SOUND_SETTINGS,
}

/** Select the Xiaomi endpoint from the API key while preserving custom settings for other keys. */
export function resolveTtsBaseURL(apiKey: string, configuredBaseURL: string): string {
  return apiKey.trim().startsWith('tp-')
    ? TOKEN_PLAN_TTS_BASE_URL
    : configuredBaseURL
}

/** Whether an API key selects one of the Xiaomi endpoints supported by this plugin. */
export function isSupportedTtsApiKey(apiKey: string, provider: TtsProvider = 'xiaomi'): boolean {
  const normalized = apiKey.trim()
  if (provider === 'doubao' || provider === 'breeze') return normalized.length > 0 && !/[\r\n]/u.test(normalized)
  return normalized.startsWith('sk-') || normalized.startsWith('tp-')
}
