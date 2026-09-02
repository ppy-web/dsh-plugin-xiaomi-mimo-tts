/** Settings namespace used by the Host and Web client. */
export const TTS_SETTINGS_NAMESPACE = 'xiaomi-mimo-tts'

/** Same-origin route used by the Web client to request synthesized audio. */
export const TTS_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize'

/** Same-origin route that proxies MiMo PCM16 server-sent audio chunks. */
export const TTS_STREAM_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize-stream'

/** Same-origin route that removes this plugin from the DSH Web profile. */
export const TTS_UNINSTALL_ROUTE = '/plugins/xiaomi-mimo-tts/uninstall'

/** Same-origin route that checks the published npm version. */
export const TTS_UPDATE_ROUTE = '/plugins/xiaomi-mimo-tts/update'

/** Keep the UI version visible without making the browser bundle load package.json. */
export const TTS_VERSION = '2.3.4'

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** Return true only when `candidate` is a strictly newer semantic version. */
export function isNewerTtsVersion(candidate: string, current: string): boolean {
  const left = SEMVER.exec(candidate.trim())
  const right = SEMVER.exec(current.trim())
  if (left === null || right === null) return false
  for (let index = 1; index <= 3; index++) {
    const difference = Number(left[index]) - Number(right[index])
    if (difference !== 0) return difference > 0
  }
  const leftPre = left[4]?.split('.') ?? []
  const rightPre = right[4]?.split('.') ?? []
  if (leftPre.length === 0 || rightPre.length === 0) return leftPre.length === 0 && rightPre.length > 0
  for (let index = 0; index < Math.max(leftPre.length, rightPre.length); index++) {
    const a = leftPre[index]
    const b = rightPre[index]
    if (a === undefined) return false
    if (b === undefined) return true
    if (a === b) continue
    const aNumber = /^\d+$/u.test(a)
    const bNumber = /^\d+$/u.test(b)
    if (aNumber && bNumber) return Number(a) > Number(b)
    if (aNumber !== bNumber) return !aNumber
    return a > b
  }
  return false
}

/** Same-origin route that reports API key configuration status without exposing the key. */
export const TTS_API_KEY_STATUS_ROUTE = '/plugins/xiaomi-mimo-tts/api-key-status'

/** Same-origin prefix used by the Web client to load voice-design preset icons. */
export const TTS_VOICE_DESIGN_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/voice-presets'

/** Same-origin prefix used by the Web client to load official built-in voice avatars. */
export const TTS_VOICE_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/voice-avatars'

/** Same-origin route used by the Web client to load the four-state character toggle sheet. */
export const TTS_TOGGLE_CHARACTER_ASSET_ROUTE = '/plugins/xiaomi-mimo-tts/toggle-characters.png'

/** Default Xiaomi endpoint for Token Plan API keys. */
export const TOKEN_PLAN_TTS_BASE_URL = 'https://token-plan-cn.xiaomimimo.com/v1'

/** Supported built-in Xiaomi MiMo voices. */
export const TTS_VOICES = ['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'] as const

/** Built-in voice metadata mirrored from Xiaomi MiMo's official selector. */
export const TTS_VOICE_PRESETS = [
  { id: 'bingtang', value: '冰糖', summary: '活泼少女' },
  { id: 'mia', value: 'Mia', summary: 'Lively girl' },
  { id: 'moli', value: '茉莉', summary: '知性女声' },
  { id: 'chloe', value: 'Chloe', summary: 'Witty Grace' },
  { id: 'suda', value: '苏打', summary: '阳光少年' },
  { id: 'milo', value: 'Milo', summary: 'Sunny boy' },
  { id: 'baihua', value: '白桦', summary: '成熟男声' },
  { id: 'dean', value: 'Dean', summary: 'Steady Gentle' },
] as const

/** TTS models supported by this plugin. */
export const TTS_MODELS = ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign', 'browser-local-fallback'] as const

export type TtsModel = typeof TTS_MODELS[number]

/** Browser-local speech orchestration strategies. */
export const TTS_LOCAL_SPEECH_MODES = ['auto', 'local-first', 'disabled'] as const

export type TtsLocalSpeechMode = typeof TTS_LOCAL_SPEECH_MODES[number]

/** Voice-design descriptions adapted from the reference voice-definition page. */
export const TTS_VOICE_DESIGN_PRESETS = [
  { id: 'energetic-girl', label: '鲸鱼娘', summary: '爱吃白米饭', prompt: '年轻女性16-22岁，标准普通话，清透甜美的中高音，音色明亮而不尖锐，带一点轻盈柔软的空气感；吐字清楚、节奏灵动，语速中等偏快，语调自然上扬，情绪开朗亲切又略带俏皮，整体听感温柔、有陪伴感。' },
  { id: 'liang-wenfeng', label: '梁文峰', summary: '理性克制', prompt: '成年男性 35–40 岁，普通话，温和克制的中低音，声线清晰自然，声音偏亮不沉闷，略带书卷气和理工感，语速中等偏慢，停顿审慎，表达理性简洁，情绪稳定，不夸张。' },
  { id: 'asmr-whisper', label: '沈听澜', summary: 'ASMR低语', prompt: '女性18-20岁，轻柔耳语带微弱气息，普通话，声线细腻清晰，私密温柔感，安静平和带轻柔低语，语速缓慢音量很轻，私密低语场景。' },
  { id: 'young-man', label: '江予辰', summary: '阳光少年', prompt: '男性青年16-22岁，清亮干净的中高音带少年感，普通话标准无口音，轻快明亮的活力声线，气息轻盈吐字利索，语速偏快语调自然上扬，情绪积极阳光带朝气，广告旁白或轻松解说场景。' },
  { id: 'gentle-girlfriend', label: '张子苜', summary: '温柔陪伴', prompt: '年轻女性16-22岁，声线柔软细腻，低饱和带微微暖意，标准普通话，温柔亲密的邻家风格，语速偏慢，语调轻柔连贯，气息自然流畅，安静私密陪伴场景。' },
  { id: 'tech-explainer', label: '周砚川', summary: '科技解说', prompt: '成年男性25-35岁，清晰利落中音、干净偏冷，标准普通话，精准干练的都市精英感，语速中等偏快、语调平稳，理性简洁、逻辑感强，现代资讯播报或商业讲解场景。' },
  { id: 'girl-next-door', label: '陈念安', summary: '邻家甜声', prompt: '年轻女性20-25岁，柔润清甜带撒娇感，普通话，清澈明亮的少女音，轻松温柔的亲近感，轻松平缓带温柔，中等偏快语速中等音量，生活分享场景。' },
  { id: 'documentary-narrator', label: '陆远山', summary: '纪录片旁白', prompt: '男性40-50岁，低沉醇厚有胸腔共鸣，普通话，稳重可靠的叙事者风格，语速中等偏慢，语调沉稳克制带叙事纵深感，气息舒展停顿有留白，纪录片旁白或深度访谈场景。' },
  { id: 'news-anchor', label: '顾知微', summary: '沉稳播报', prompt: '专业新闻播音女主持，成年女性30-40岁，普通话标准无口音，声线中低音区饱满清晰，端庄知性沉稳，语气克制权威，语速从容均匀，音量适中稳定，新闻播报与专题解说场景。' },
  { id: 'suspense-narrator', label: '裴沉舟', summary: '悬疑旁白', prompt: '男性中年30-40岁，低沉沉稳带神秘磁性，普通话，压抑克制的叙事风格，语速缓慢均匀，语调低沉平稳，情绪冷静悬疑，旁白解说场景。' },
] as const

/** Supported audio formats. */
export const TTS_FORMATS = ['pcm', 'mp3', 'wav'] as const

export type TtsFormat = typeof TTS_FORMATS[number]

/** Voice-design playback strategies. Segmented playback keeps each upstream request short. */
export const TTS_VOICE_DESIGN_PLAYBACK_MODES = ['complete', 'segmented'] as const

export type TtsVoiceDesignPlaybackMode = typeof TTS_VOICE_DESIGN_PLAYBACK_MODES[number]

export const DEFAULT_TTS_SEGMENT_CHARACTERS = 120
export const MAX_TTS_SEGMENT_CHARACTERS = 180
export const MIN_TTS_SEGMENT_CHARACTERS = 40

/** Minimum spoken characters to accumulate before starting one PCM stream request. */
export const MIN_TTS_STREAM_CHARACTERS = 20

/** Maximum decoded complete MP3 payload accepted from Xiaomi MiMo. */
export const DEFAULT_MAX_MP3_AUDIO_BYTES = 32 * 1024 * 1024

/** Maximum decoded complete WAV payload accepted from Xiaomi MiMo. */
export const DEFAULT_MAX_WAV_AUDIO_BYTES = 128 * 1024 * 1024
export const DEFAULT_MAX_PAUSED_PCM_BYTES = 32 * 1024 * 1024

/** Extra JSON envelope allowance around a Base64 audio payload. */
export const TTS_AUDIO_RESPONSE_JSON_OVERHEAD_BYTES = 1024 * 1024

const TTS_PUNCTUATION: Record<string, string> = {
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '；': ';',
  '、': ',',
  '（': ',',
  '）': ',',
  '　': ' ',
}

/** Decorative punctuation can make TTS emit non-speech artifacts, so omit it entirely. */
const TTS_NON_SPEECH_PUNCTUATION = /[()\[\]【】［］〔〕〖〗{}｛｝「」『』《》〈〉“”‘’"'`<>：…—–－～]/gu

const TTS_URL_PATTERN = /\b(?:https?|ftp):\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|cn|net|org|io|ai|dev|me|co|edu|gov|xyz|tech|info|app|site|link)(?:[/:?#][^\s<>()]*)?/giu
const TTS_WINDOWS_PATH_PATTERN = /(?:\b[A-Za-z]:[\\/]|\\\\)(?:[A-Za-z0-9._ -]+[\\/])+(?:[A-Za-z0-9._ -]+)/gu
const TTS_UNIX_PATH_PATTERN = /\/(?:[A-Za-z0-9._-]+\/)+(?:[A-Za-z0-9._-]+)/gu
const TTS_RELATIVE_PATH_PATTERN = /(?:\.\.?[\\/])(?:[A-Za-z0-9._-]+[\\/])*(?:[A-Za-z0-9._-]+(?:\.[A-Za-z0-9_-]+)?)/gu
const TTS_PROJECT_PATH_PATTERN = /\b(?:[A-Za-z0-9_-]+[\\/])+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu

/** Combined Markdown syntax and path removal in a single pass. */
const MARKDOWN_CODE_BLOCK_RE = /```[\s\S]*?```|~~~[\s\S]*?~~~/g
const MARKDOWN_INDENTED_CODE_RE = /(^|\n)(?: {4}|\t)[^\n]*(?=\n|$)/g
const MARKDOWN_IMAGE_RE = /!\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g
const MARKDOWN_LINK_RE = /\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g
const MARKDOWN_HTML_TAG_RE = /<[^>\r\n]*>/g
const MARKDOWN_HEADING_RE = /(^|\n)\s{0,3}#{1,6}\s+/g
const MARKDOWN_LIST_RE = /(^|\n)\s*(?:[-*+]|\d+[.)])\s+/g
const MARKDOWN_BLOCKQUOTE_RE = /(^|\n)\s*>\s?/g
const MARKDOWN_INLINE_FORMAT_RE = /`+|[*_~]{1,3}/g
const MARKDOWN_TABLE_SEP_RE = /[|]/g

function removeTtsPaths(value: string): string {
  return value
    .replace(TTS_WINDOWS_PATH_PATTERN, ' ')
    .replace(TTS_RELATIVE_PATH_PATTERN, ' ')
    .replace(TTS_PROJECT_PATH_PATTERN, ' ')
    .replace(TTS_UNIX_PATH_PATTERN, ' ')
}

function removeTtsMarkup(value: string): string {
  let text = value
    .replace(MARKDOWN_CODE_BLOCK_RE, ' ')
    .replace(MARKDOWN_INDENTED_CODE_RE, '$1')
    .replace(MARKDOWN_IMAGE_RE, ' ')
    .replace(MARKDOWN_LINK_RE, '$1')
    .replace(MARKDOWN_HTML_TAG_RE, ' ')
    .replace(MARKDOWN_HEADING_RE, '$1')
    .replace(MARKDOWN_LIST_RE, '$1')
    .replace(MARKDOWN_BLOCKQUOTE_RE, '$1')
    .replace(MARKDOWN_INLINE_FORMAT_RE, '')
    .replace(MARKDOWN_TABLE_SEP_RE, ' ')

  text = text.replace(TTS_URL_PATTERN, ' ')
  return removeTtsPaths(text)
}

function removeTtsSymbols(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g, ' ')
    .replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{So}|\uFE0E|\uFE0F|\u200D|\u20E3)/gu, ' ')
}

/** Combined punctuation normalization: collapse adjacent punctuation, remove non-speech characters, and normalize Chinese punctuation. */
function normalizeTtsPunctuation(value: string): string {
  return value
    .replace(TTS_NON_SPEECH_PUNCTUATION, '')
    .replace(/[，。！？；、（）　]/gu, (character) => TTS_PUNCTUATION[character] ?? character)
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

/** Locate fenced code blocks in raw streaming text so their content is never read aloud. */
function findFencedCodeRegions(value: string): { regions: Array<[number, number]>; pendingStart: number | null } {
  const regions: Array<[number, number]> = []
  let pendingStart: number | null = null
  const fence = /(^|\n)[ \t]{0,3}(`{3,}|~{3,})[^\r\n]*/g
  let open: { start: number; char: string } | null = null
  for (const match of value.matchAll(fence)) {
    const lineStart = match.index + (match[1] === '\n' ? 1 : 0)
    const char = match[2][0]
    if (open === null) {
      open = { start: lineStart, char }
    } else if (open.char === char) {
      regions.push([open.start, match.index + match[0].length])
      open = null
    }
  }
  if (open !== null) pendingStart = open.start
  return { regions, pendingStart }
}

export interface TtsSentenceSplit {
  sentences: string[]
  remainder: string
  /** How many characters of the input were consumed (sentences plus skipped code blocks). */
  consumed: number
  /** True when the remainder is an unclosed code block that must not be read aloud. */
  inCode: boolean
}

/** Split an accumulated model delta at completed sentence-ending punctuation, skipping fenced code blocks whole. */
export function splitCompletedTtsSentences(value: string): TtsSentenceSplit {
  const { regions, pendingStart } = findFencedCodeRegions(value)
  const limit = pendingStart ?? value.length
  const boundary = /[。！？!?；;\n]+(?:[”’）】》〕\]}'"]*\s*)/gu
  const sentences: string[] = []
  let sentenceStart = 0
  let consumed = 0

  const splitSegment = (from: number, to: number): void => {
    boundary.lastIndex = from
    let match: RegExpExecArray | null
    while ((match = boundary.exec(value)) !== null) {
      const end = match.index + match[0].length
      if (end > to) break
      // A boundary match that is only whitespace (e.g. a lone newline after a code
      // fence) must not become a sentence of its own, or TTS would read a stray dot.
      const sentence = value.slice(sentenceStart, end)
      if (sentence.trim().length > 0) sentences.push(sentence)
      sentenceStart = end
      consumed = end
    }
  }

  let pos = 0
  for (const [start, end] of regions) {
    if (start >= limit) break
    if (pos < start) splitSegment(pos, Math.min(start, limit))
    sentenceStart = Math.max(sentenceStart, end)
    consumed = Math.max(consumed, end)
    pos = end
  }
  if (pos < limit) splitSegment(pos, limit)

  if (pendingStart !== null) {
    // An unclosed fence must stay buffered until it closes; never read it aloud.
    return { sentences, remainder: value.slice(pendingStart), consumed: pendingStart, inCode: true }
  }
  return { sentences, remainder: value.slice(consumed), consumed, inCode: false }
}

/** Count text-bearing characters only, excluding punctuation and whitespace. */
export function countTtsSpeechCharacters(value: string): number {
  return (value.match(/[\p{L}\p{N}]/gu) ?? []).length
}

/** Split cleaned speech text on natural boundaries while bounding VoiceDesign requests. */
export function splitTtsSegments(value: string, target = DEFAULT_TTS_SEGMENT_CHARACTERS, maximum = MAX_TTS_SEGMENT_CHARACTERS): string[] {
  const text = prepareTtsText(value)
  if (text.length === 0) return []
  const preferred = Math.max(MIN_TTS_SEGMENT_CHARACTERS, Math.min(target, maximum))
  const pieces = text.match(/[^.!?;]+[.!?;]*|[.!?;]+/gu) ?? [text]
  const segments: string[] = []
  let pending = ''
  const append = (piece: string): void => {
    const candidate = `${pending}${piece}`.trim()
    if (candidate.length === 0) return
    if (countTtsSpeechCharacters(candidate) <= maximum) {
      pending = candidate
      if (countTtsSpeechCharacters(pending) >= preferred) {
        segments.push(pending)
        pending = ''
      }
      return
    }
    if (pending.length > 0) {
      segments.push(pending)
      pending = ''
    }
    let rest = piece.trim()
    while (countTtsSpeechCharacters(rest) > maximum) {
      let cut = Math.min(rest.length, maximum)
      const boundary = Math.max(rest.lastIndexOf(',', cut), rest.lastIndexOf(' ', cut), rest.lastIndexOf(':', cut))
      if (boundary >= MIN_TTS_SEGMENT_CHARACTERS) cut = boundary + 1
      segments.push(rest.slice(0, cut).trim())
      rest = rest.slice(cut).trim()
    }
    pending = rest
  }
  for (const piece of pieces) append(piece)
  if (pending.length > 0) {
    const last = segments.at(-1)
    if (last !== undefined && countTtsSpeechCharacters(pending) < MIN_TTS_SEGMENT_CHARACTERS && countTtsSpeechCharacters(`${last}${pending}`) <= maximum) segments[segments.length - 1] = `${last}${pending}`
    else segments.push(pending)
  }
  return segments
}

/** Return the exact decoded size of canonical padded Base64, or null when invalid. */
export function strictBase64DecodedLength(value: string): number | null {
  if (value.length === 0 || value.length % 4 !== 0) return null
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return null
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0
  return (value.length / 4) * 3 - padding
}

/** Accumulate short sentences so a PCM stream has enough text to sound natural. */
export function batchTtsStreamText(pending: string, next: string, flush: boolean): { pending: string; request: string | null } {
  const combined = `${pending}${next}`
  if (countTtsSpeechCharacters(combined) >= MIN_TTS_STREAM_CHARACTERS || (flush && combined.trim().length > 0)) {
    return { pending: '', request: combined }
  }
  return { pending: combined, request: null }
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

export interface LiveSpeechCursor {
  sessionId: string
  turn: number
  step: number
}

export type LiveSpeechTransition = 'same-step' | 'same-turn' | 'new-turn'

/** Decide whether a live assistant update extends one message, advances within a turn, or starts a new turn. */
export function classifyLiveSpeechTransition(current: LiveSpeechCursor | null, next: LiveSpeechCursor): LiveSpeechTransition {
  if (current === null || current.sessionId !== next.sessionId || current.turn !== next.turn) return 'new-turn'
  return current.step === next.step ? 'same-step' : 'same-turn'
}

/** Serializes sentence requests and makes cancellation independent from the playback backend. */
export interface AbortableSentenceQueueOptions {
  onBusyChange?: (busy: boolean) => void
  onError?: (error: unknown) => void
}

export class AbortableSentenceQueue {
  private readonly pending: string[] = []
  private current: AbortController | null = null
  private revision = 0
  private busy = false

  constructor(
    private readonly start: (sentence: string, signal: AbortSignal) => Promise<void>,
    private readonly options: AbortableSentenceQueueOptions = {},
  ) {}

  enqueue(sentence: string): void {
    this.pending.push(sentence)
    this.setBusy(true)
    void this.pump()
  }

  cancel(): void {
    this.revision += 1
    this.pending.length = 0
    this.current?.abort()
    this.current = null
    this.setBusy(false)
  }

  private async pump(): Promise<void> {
    if (this.current !== null) return
    const sentence = this.pending.shift()
    if (sentence === undefined) {
      this.setBusy(false)
      return
    }
    const revision = this.revision
    const controller = new AbortController()
    this.current = controller
    try {
      await this.start(sentence, controller.signal)
    } catch (error) {
      if (!controller.signal.aborted && revision === this.revision) {
        this.pending.length = 0
        this.revision += 1
        this.options.onError?.(error)
      }
    } finally {
      if (this.current === controller) this.current = null
      if (revision === this.revision) {
        if (this.pending.length > 0) void this.pump()
        else this.setBusy(false)
      } else {
        this.setBusy(false)
      }
    }
  }

  private setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    this.options.onBusyChange?.(busy)
  }
}

export interface TtsSettings {
  enabled?: boolean
  apiKey?: string
  baseURL?: string
  model?: TtsModel
  localSpeechMode?: TtsLocalSpeechMode
  localVoiceURI?: string
  voice?: string
  voiceDesignPrompt?: string
  voiceDesignCustomPrompt?: string
  presetStylePrompt?: string
  format?: TtsFormat
  voiceDesignPlaybackMode?: TtsVoiceDesignPlaybackMode
  autoPlay?: boolean
  instruction?: string
  maxTextLength?: number
  requestTimeoutMs?: number
  maxMp3AudioBytes?: number
  maxWavAudioBytes?: number
  maxPausedPcmBytes?: number
}

export interface ResolvedTtsSettings {
  enabled: boolean
  apiKey: string
  baseURL: string
  model: TtsModel
  localSpeechMode: TtsLocalSpeechMode
  localVoiceURI: string
  voice: string
  voiceDesignPrompt: string
  voiceDesignCustomPrompt: string
  presetStylePrompt: string
  format: TtsFormat
  voiceDesignPlaybackMode: TtsVoiceDesignPlaybackMode
  autoPlay: boolean
  instruction: string
  maxTextLength: number
  requestTimeoutMs: number
  maxMp3AudioBytes: number
  maxWavAudioBytes: number
  maxPausedPcmBytes: number
}

/** Defaults shared by the Schemastery config and the Web settings form. */
export const DEFAULT_TTS_SETTINGS: ResolvedTtsSettings = {
  enabled: true,
  apiKey: '',
  baseURL: 'https://api.xiaomimimo.com/v1',
  model: 'mimo-v2.5-tts',
  localSpeechMode: 'auto',
  localVoiceURI: '',
  voice: '冰糖',
  voiceDesignPrompt: '青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。',
  voiceDesignCustomPrompt: '青年女性，声线清亮、亲切自然，吐字清楚，语速适中，情绪温柔克制。',
  presetStylePrompt: '使用清晰、自然、准确的声音朗读，语速适中，停顿自然，语气平和克制，避免夸张表达。',
  format: 'pcm',
  voiceDesignPlaybackMode: 'complete',
  autoPlay: true,
  instruction: '请忠实朗读原文，根据文本语气自然表达，不添加或改写内容。',
  maxTextLength: 12000,
  requestTimeoutMs: 120000,
  maxMp3AudioBytes: DEFAULT_MAX_MP3_AUDIO_BYTES,
  maxWavAudioBytes: DEFAULT_MAX_WAV_AUDIO_BYTES,
  maxPausedPcmBytes: DEFAULT_MAX_PAUSED_PCM_BYTES,
}

/** Select the Xiaomi endpoint from the API key while preserving custom settings for other keys. */
export function resolveTtsBaseURL(apiKey: string, configuredBaseURL: string): string {
  return apiKey.trim().startsWith('tp-')
    ? TOKEN_PLAN_TTS_BASE_URL
    : configuredBaseURL
}

/** Whether an API key selects one of the Xiaomi endpoints supported by this plugin. */
export function isSupportedTtsApiKey(apiKey: string): boolean {
  const normalized = apiKey.trim()
  return normalized.startsWith('sk-') || normalized.startsWith('tp-')
}

/** Resolve an optional settings snapshot into the values used by the form. */
export function resolveTtsSettings(value: TtsSettings | undefined): ResolvedTtsSettings {
  const resolved = { ...DEFAULT_TTS_SETTINGS, ...value }
  const model = resolved.model === 'browser-local-fallback' ? 'mimo-v2.5-tts' : resolved.model
  const voiceDesignCustomPrompt = typeof value?.voiceDesignCustomPrompt === 'string'
    ? value.voiceDesignCustomPrompt
    : TTS_VOICE_DESIGN_PRESETS.some((item) => item.prompt === resolved.voiceDesignPrompt)
      ? DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt
      : resolved.voiceDesignPrompt
  return {
    ...resolved,
    model,
    voiceDesignCustomPrompt,
    autoPlay: resolved.enabled ? resolved.autoPlay : false,
  }
}
