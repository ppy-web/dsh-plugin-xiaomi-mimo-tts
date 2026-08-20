/** Settings namespace used by the Host and Web client. */
export const TTS_SETTINGS_NAMESPACE = 'xiaomi-mimo-tts'

/** Same-origin route used by the Web client to request synthesized audio. */
export const TTS_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize'

/** Supported built-in Xiaomi MiMo voices. */
export const TTS_VOICES = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'] as const

/** Supported audio formats. */
export const TTS_FORMATS = ['mp3', 'wav'] as const

export type TtsFormat = typeof TTS_FORMATS[number]

export interface TtsSettings {
  enabled?: boolean
  apiKey?: string
  baseURL?: string
  model?: string
  voice?: string
  format?: TtsFormat
  autoPlay?: boolean
  instruction?: string
  maxTextLength?: number
  requestTimeoutMs?: number
}

export interface ResolvedTtsSettings {
  enabled: boolean
  apiKey: string
  baseURL: string
  model: string
  voice: string
  format: TtsFormat
  autoPlay: boolean
  instruction: string
  maxTextLength: number
  requestTimeoutMs: number
}

/** Defaults shared by the Schemastery config and the Web settings form. */
export const DEFAULT_TTS_SETTINGS: ResolvedTtsSettings = {
  enabled: true,
  apiKey: '',
  baseURL: 'https://api.xiaomimimo.com/v1',
  model: 'mimo-v2.5-tts',
  voice: '冰糖',
  format: 'mp3',
  autoPlay: true,
  instruction: '请用自然、清晰、语速适中的语气朗读。',
  maxTextLength: 12000,
  requestTimeoutMs: 120000,
}

/** Resolve an optional settings snapshot into the values used by the form. */
export function resolveTtsSettings(value: TtsSettings | undefined): ResolvedTtsSettings {
  const resolved = { ...DEFAULT_TTS_SETTINGS, ...value }
  return {
    ...resolved,
    autoPlay: resolved.enabled ? resolved.autoPlay : false,
  }
}
