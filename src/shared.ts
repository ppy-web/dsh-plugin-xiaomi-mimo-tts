/** Settings namespace used by the Host and Web client. */
export const TTS_SETTINGS_NAMESPACE = 'xiaomi-mimo-tts'

/** Same-origin route used by the Web client to request synthesized audio. */
export const TTS_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize'

/** Supported built-in Xiaomi MiMo voices. */
export const TTS_VOICES = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'] as const

/** Supported audio formats. */
export const TTS_FORMATS = ['mp3', 'wav'] as const

export type TtsFormat = typeof TTS_FORMATS[number]

const TTS_PUNCTUATION: Record<string, string> = {
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '：': ':',
  '；': ';',
  '、': ',',
  '（': '(',
  '）': ')',
  '【': '[',
  '】': ']',
  '［': '[',
  '］': ']',
  '“': '"',
  '”': '"',
  '‘': "'",
  '’': "'",
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '《': '"',
  '》': '"',
  '〈': '"',
  '〉': '"',
  '…': '...',
  '—': '-',
  '–': '-',
  '－': '-',
  '～': '~',
  '　': ' ',
}

const TTS_URL_PATTERN = /\b(?:https?|ftp):\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|cn|net|org|io|ai|dev|me|co|edu|gov|xyz|tech|info|app|site|link)(?:[/:?#][^\s<>()]*)?/giu
const TTS_WINDOWS_PATH_PATTERN = /(?:\b[A-Za-z]:[\\/]|\\\\)(?:[A-Za-z0-9._ -]+[\\/])*(?:[A-Za-z0-9._ -]+)/gu
const TTS_UNIX_PATH_PATTERN = /\/(?:[A-Za-z0-9._-]+\/)*(?:[A-Za-z0-9._-]+)/gu
const TTS_RELATIVE_PATH_PATTERN = /(?:\.\.?[\\/])(?:[A-Za-z0-9._-]+[\\/])*(?:[A-Za-z0-9._-]+(?:\.[A-Za-z0-9_-]+)?)/gu
const TTS_PROJECT_PATH_PATTERN = /\b(?:[A-Za-z0-9_-]+[\\/])+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu

function removeTtsPaths(value: string): string {
  return value
    .replace(TTS_WINDOWS_PATH_PATTERN, ' ')
    .replace(TTS_RELATIVE_PATH_PATTERN, ' ')
    .replace(TTS_PROJECT_PATH_PATTERN, ' ')
    .replace(TTS_UNIX_PATH_PATTERN, ' ')
}

function removeTtsMarkup(value: string): string {
  let text = value
    .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, ' ')
    .replace(/(^|\n)(?: {4}|\t)[^\n]*(?=\n|$)/g, '$1')
    .replace(/!\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g, ' ')
    .replace(/\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g, '$1')
    .replace(/<[^>\r\n]*>/g, ' ')
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, '$1')
    .replace(/(^|\n)\s*(?:[-*+]|\d+[.)])\s+/g, '$1')
    .replace(/(^|\n)\s*>\s?/g, '$1')
    .replace(/`+/g, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/[|]/g, ' ')

  text = text.replace(TTS_URL_PATTERN, ' ')
  return removeTtsPaths(text)
}

function removeTtsSymbols(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g, ' ')
    .replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{So}|\uFE0E|\uFE0F|\u200D|\u20E3)/gu, ' ')
}

function normalizeTtsPunctuation(value: string): string {
  return value
    .replace(/[，。！？：；、（）【】［］“”‘’「」『』《》〈〉…—–－～　]/gu, (character) => TTS_PUNCTUATION[character] ?? character)
    .replace(/\(\s*\)|\[\s*\]|\{\s*\}/g, ' ')
    .replace(/(^|\s)[,;:!?]+(?=\s|$)/g, '$1')
    .replace(/([,;:])\s*([.!?])/g, '$2')
    .replace(/\s+([,.;:!?])/g, '$1')
}

/**
 * Prepare assistant text for speech synthesis without changing the chat transcript.
 *
 * @param value Raw assistant text or Markdown-derived text.
 * @returns Text with non-speech content removed and punctuation normalized.
 */
export function prepareTtsText(value: string): string {
  if (value.length === 0) return ''

  const text = normalizeTtsPunctuation(
    removeTtsSymbols(
      removeTtsMarkup(value)
        .replace(/\\[rn]|\/n/gi, ' ')
        .replace(/\r\n?/g, '\n'),
    ),
  )

  return text.replace(/\s+/g, ' ').trim()
}

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
