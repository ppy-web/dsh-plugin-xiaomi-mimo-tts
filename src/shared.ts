/** Settings namespace used by the Host and Web client. */
export const TTS_SETTINGS_NAMESPACE = 'xiaomi-mimo-tts'

/** Same-origin route used by the Web client to request synthesized audio. */
export const TTS_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize'

/** Same-origin route that proxies MiMo PCM16 server-sent audio chunks. */
export const TTS_STREAM_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize-stream'

/** Supported built-in Xiaomi MiMo voices. */
export const TTS_VOICES = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'] as const

/** TTS models supported by this plugin. */
export const TTS_MODELS = ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign'] as const

export type TtsModel = typeof TTS_MODELS[number]

/** Voice-design descriptions adapted from the reference voice-definition page. */
export const TTS_VOICE_DESIGN_PRESETS = [
  { label: '元气少女', prompt: '元气少女音色，明亮、轻快、笑意明显，语速偏快，句尾灵动，适合轻松内容和年轻化短视频。' },
  { label: '邻家女孩', prompt: '年轻女性，声音甜美、软萌、亲近，语速轻快，带一点黏人感和撒娇气质，但保持清晰可懂，适合轻松日常、聊天向内容。' },
  { label: '新闻播报', prompt: '专业新闻播报音色，中性偏成熟，吐字标准，节奏平稳，情绪克制，适合公告、新闻和正式说明。' },
  { label: '温柔客服', prompt: '温柔客服女声，亲切、耐心、清晰，语速适中，句尾轻微上扬，听起来可靠且不机械。' },
  { label: '温柔女友', prompt: '年轻女性，声音温柔、柔软、低饱和，语速偏慢，带轻微耳语感和亲密感，适合情感、治愈和晚间陪伴内容。' },
  { label: 'ASMR低语', prompt: '年轻女性，声音极度轻柔，像在耳边说话，呼吸感明显，语速慢，适合哄睡、放松和沉浸式内容。' },
  { label: '少年感男声', prompt: '年轻男性，声音干净明亮，有少年感，语速略快，语气轻松自然，适合短视频口播和产品介绍。' },
  { label: '纪录片男声', prompt: '成熟男性，低沉稳重，气息稳定，语速中等偏慢，像纪录片旁白，带一点故事感但不过分夸张。' },
  { label: '古风说书男声', prompt: '古风说书人音色，成熟、有韵味，语速从容，语调起伏带叙事感，适合历史、武侠和传统故事。' },
  { label: '科技解说男声', prompt: '清晰、理性、现代，语速中等偏快，语气专业但不生硬，适合产品演示和技术说明。' },
  { label: '电台夜谈男声', prompt: '电台夜谈男声，温暖、低缓、松弛，带轻微气声，语速偏慢，适合情感电台、睡前故事和长篇陪伴内容。' },
  { label: '悬疑旁白男声', prompt: '悬疑故事旁白，声线偏低，语速克制，停顿明显，带一点紧张感和神秘感，适合悬疑、案件和氛围叙述。' },
] as const

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
        .replace(/\r\n?|\n/g, '.'),
    ),
  )

  return text.replace(/\s+/g, ' ').trim()
}

/** Split an accumulated model delta at completed sentence-ending punctuation. */
export function splitCompletedTtsSentences(value: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = []
  const boundary = /[。！？!?；;\n]+(?:[”’）】》〕\]}'"]*\s*)/gu
  let start = 0
  for (const match of value.matchAll(boundary)) {
    const end = match.index + match[0].length
    sentences.push(value.slice(start, end))
    start = end
  }
  return { sentences, remainder: value.slice(start) }
}

/** Parse complete SSE records while retaining the final partial record for the next network chunk. */
export function parseSseRecords(value: string): { events: string[]; remainder: string } {
  const records = value.split(/\r?\n\r?\n/u)
  const remainder = records.pop() ?? ''
  const events = records
    .map((record) => record.split(/\r?\n/u)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n'))
    .filter((record) => record.length > 0)
  return { events, remainder }
}

/** Serializes sentence requests and makes cancellation independent from the playback backend. */
export class AbortableSentenceQueue {
  private readonly pending: string[] = []
  private current: AbortController | null = null
  private revision = 0

  constructor(private readonly start: (sentence: string, signal: AbortSignal) => Promise<void>) {}

  enqueue(sentence: string): void {
    this.pending.push(sentence)
    void this.pump()
  }

  cancel(): void {
    this.revision += 1
    this.pending.length = 0
    this.current?.abort()
    this.current = null
  }

  private async pump(): Promise<void> {
    if (this.current !== null) return
    const sentence = this.pending.shift()
    if (sentence === undefined) return
    const revision = this.revision
    const controller = new AbortController()
    this.current = controller
    try {
      await this.start(sentence, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      if (this.current === controller) this.current = null
      if (revision === this.revision) void this.pump()
    }
  }
}

export interface TtsSettings {
  enabled?: boolean
  apiKey?: string
  baseURL?: string
  model?: TtsModel
  voice?: string
  voiceDesignPrompt?: string
  voiceDesignCustomPrompt?: string
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
  model: TtsModel
  voice: string
  voiceDesignPrompt: string
  voiceDesignCustomPrompt: string
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
  voiceDesignPrompt: '青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。',
  voiceDesignCustomPrompt: '青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。',
  format: 'mp3',
  autoPlay: true,
  instruction: '请用自然、清晰、语速适中的语气朗读。',
  maxTextLength: 12000,
  requestTimeoutMs: 120000,
}

/** Resolve an optional settings snapshot into the values used by the form. */
export function resolveTtsSettings(value: TtsSettings | undefined): ResolvedTtsSettings {
  const resolved = { ...DEFAULT_TTS_SETTINGS, ...value }
  const voiceDesignCustomPrompt = typeof value?.voiceDesignCustomPrompt === 'string'
    ? value.voiceDesignCustomPrompt
    : TTS_VOICE_DESIGN_PRESETS.some((item) => item.prompt === resolved.voiceDesignPrompt)
      ? DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt
      : resolved.voiceDesignPrompt
  return {
    ...resolved,
    voiceDesignCustomPrompt,
    autoPlay: resolved.enabled ? resolved.autoPlay : false,
  }
}
