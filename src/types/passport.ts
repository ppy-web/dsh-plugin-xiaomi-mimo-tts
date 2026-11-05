export interface PassportSettings {
  host: string
  port: number
  accessToken: string
  deviceId: string
  agentPreset: string
  sessionRevision: string
  cwd: string
  silenceMs: number
  minSpeechMs: number
  speechThreshold: number
  maxRecordingSeconds: number
  maxReplySeconds: number
  requestTimeoutMs: number
}

export const DEFAULT_PASSPORT_SETTINGS: Readonly<PassportSettings> = {
  host: '127.0.0.1', port: 3101, accessToken: '', deviceId: '', agentPreset: 'whale-girl', cwd: '~/.dsh-xiaomi-tts/passport/workspace',
  sessionRevision: '',
  silenceMs: 700, minSpeechMs: 200, speechThreshold: 0.015,
  maxRecordingSeconds: 30, maxReplySeconds: 60, requestTimeoutMs: 180000,
}

export const PASSPORT_NUMBER_FIELDS = {
  port: { min: 1, max: 65535, step: 1 },
  silenceMs: { min: 200, max: 3000, step: 20 },
  minSpeechMs: { min: 100, max: 1000, step: 20 },
  speechThreshold: { min: 0.001, max: 0.5, step: 0.001 },
  maxRecordingSeconds: { min: 1, max: 60, step: 'any' },
  maxReplySeconds: { min: 1, max: 120, step: 'any' },
  requestTimeoutMs: { min: 10000, max: 600000, step: 'any' },
} as const

export type PassportNumberField = keyof typeof PASSPORT_NUMBER_FIELDS
export const PASSPORT_STATUS_ROUTE = '/plugins/xiaomi-mimo-tts/passport-status'
export const PASSPORT_PRESETS_ROUTE = '/plugins/xiaomi-mimo-tts/passport-presets'
export interface PassportPreset { id: string; name?: string; unavailable?: boolean }

export interface PassportConnectionStatus {
  configured: boolean
  listening: boolean
  connected: boolean
  servicesReady: boolean
  recognitionReady: boolean
  host: string
  port: number
  addresses: Array<{ name: string; address: string }>
  error?: string
  sessionError?: string
}

/** Numeric pairing codes admit only local/private IPv4 peers. */
export function isPassportLanAddress(address: string): boolean {
  if (address === '::1') return true
  const parts = address.replace(/^::ffff:/u, '').split('.')
  if (parts.length !== 4 || parts.some(part => !/^\d{1,3}$/u.test(part) || Number(part) > 255)) return false
  const [first, second] = parts.map(Number)
  return first === 10 || first === 127 || first === 192 && second === 168 || first === 172 && second! >= 16 && second! <= 31
}

/** Four-digit pairing is the default; existing long credentials remain usable. */
export function isPassportAccessToken(value: string): boolean {
  return /^\d{4}$/u.test(value) || value.length >= 24 && value.length <= 192 && !/\s/u.test(value)
}
