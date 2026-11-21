import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { getWavFileInfo } from 'silk-wasm'
import type { SpeechSynthesisService } from '../host-api.js'
import {
  applyBreezeTtsPlaybackScope,
  applyTtsPlaybackScope,
  appendTtsSmartTruncationOutro,
  countTtsSpeechCharacters,
  splitBreezeTtsSegments,
  splitTtsSegments,
} from '../shared.js'
import type { ResolvedTtsSettings } from '../shared.js'
import { splitDeepseekText } from '../text/deepseek-limit.js'

/** The subset of the dsh-go native plugin protocol this plugin uses. */
export interface DshGoScope {
  sessionId?: string
  turnId?: string
  messageId?: string
  callId?: string
  /** The long-pressed reply's text, present because the manifest wants `message`. */
  message?: string
}

export interface DshGoInvokeEvent {
  locale?: string
  signal?: AbortSignal
}

export interface DshGoMediaEvent {
  key?: string
  locale?: string
  signal: AbortSignal
}

export interface DshGoCapabilityEvent {
  instance: string
  event: string
  reason?: string
  seq: number
  signal: AbortSignal
}

export interface DshGoMicroData {
  text?: string
  progress?: number | null
}

export type DshGoEffect =
  | { type: 'audio'; op: 'play'; instance: string; src: `media:${string}`; key?: string }
  | { type: 'audio'; op: 'pause' | 'resume' | 'stop'; instance: string }
  | { type: 'voice'; op: 'start' | 'stop'; instance: string }
  | { type: 'overlay'; op: 'show' | 'hide'; instance: string; id: string }

export interface DshGoService {
  on(id: string, handler: (scope: DshGoScope, event: DshGoInvokeEvent) => unknown): () => void
  media(id: string, handler: (scope: DshGoScope, event: DshGoMediaEvent) => Promise<{ body: Uint8Array; contentType: string }>): () => void
  micro(id: string, definition: { data: (scope: DshGoScope, emit: (data: DshGoMicroData) => void) => () => void }): () => void
  onCapability(handler: (scope: DshGoScope, event: DshGoCapabilityEvent) => void): () => void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshGo: DshGoService
  }
}

/** The spoken reply is kept under this id on the host until the app fetches it. */
const READING_MEDIA_ID = 'speech'
const CAPTION_CHANNEL = 'caption'
const SUBTITLE_OVERLAY = 'subtitle'

/** A stored reply lives long enough for a slow fetch, then is dropped. */
const READING_TTL_MS = 10 * 60_000
const MAX_READINGS = 16
/** The bridge caps one media response at 16 MiB; leave room for the WAV header. */
const MAX_MEDIA_BYTES = 16 * 1024 * 1024 - 4096
/** Guard the app's 30 s media budget: stop asking for more chunks before then. */
const MEDIA_BUDGET_MS = 22_000
/** Above this the reading is cut at a sentence boundary with a spoken closing cue. */
const MAX_SPEECH_CHARACTERS = 3000
const CAPTION_TEXT_LIMIT = 240
const CAPTION_TICK_MS = 400
const ESTIMATED_CHARACTERS_PER_SECOND = 4.2

interface Reading {
  key: string
  text: string
  sessionId?: string
  messageId?: string
  createdAt: number
  durationMs?: number
  startedAt?: number
}

/** Replies waiting to be fetched, bounded by count and age. */
class ReadingStore {
  private readonly entries = new Map<string, Reading>()

  add(text: string, scope: DshGoScope): Reading {
    this.prune()
    const reading: Reading = {
      key: randomUUID().replaceAll('-', ''),
      text,
      ...(scope.sessionId === undefined ? {} : { sessionId: scope.sessionId }),
      ...(scope.messageId === undefined ? {} : { messageId: scope.messageId }),
      createdAt: Date.now(),
    }
    this.entries.set(reading.key, reading)
    while (this.entries.size > MAX_READINGS) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return reading
  }

  get(key: string | undefined, sessionId: string | undefined): Reading | undefined {
    if (key === undefined) return undefined
    this.prune()
    const reading = this.entries.get(key)
    return reading?.sessionId === sessionId ? reading : undefined
  }

  latest(sessionId: string | undefined): Reading | undefined {
    this.prune()
    return [...this.entries.values()].filter(reading => reading.sessionId === sessionId).at(-1)
  }

  delete(key: string): void { this.entries.delete(key) }

  clear(sessionId: string | undefined): void {
    for (const [key, reading] of this.entries) {
      if (reading.sessionId === sessionId) this.entries.delete(key)
    }
  }

  dispose(): void { this.entries.clear() }

  private prune(): void {
    const cutoff = Date.now() - READING_TTL_MS
    for (const [key, reading] of this.entries) {
      if (reading.createdAt >= cutoff) continue
      this.entries.delete(key)
    }
  }
}

interface CaptionChunk { text: string; end: number }

function scopeKey(scope: DshGoScope): string {
  return scope.sessionId ?? ''
}

/** Split a spoken reply into caption-sized pieces no longer than the micro limit. */
export function captionChunks(text: string): CaptionChunk[] {
  // Provider text preparation may normalize CJK punctuation to ASCII periods.
  const sentences = text.match(/[^。！？!?；;.\n]+[。！？!?；;.\n]*|[。！？!?；;.\n]+/gu) ?? [text]
  const chunks: CaptionChunk[] = []
  let current = ''
  let end = 0
  const push = (): void => {
    const spoken = current.trim()
    current = ''
    if (spoken.length === 0) return
    end += [...spoken].length
    chunks.push({ text: spoken, end })
  }
  for (const sentence of sentences) {
    let rest = sentence
    while ([...rest].length > 0) {
      const room = CAPTION_TEXT_LIMIT - [...current].length
      if (room <= 0) { push(); continue }
      const points = [...rest]
      current += points.slice(0, room).join('')
      rest = points.slice(room).join('')
      if ([...current].length >= CAPTION_TEXT_LIMIT) push()
    }
  }
  push()
  return chunks.length > 0 ? chunks : [{ text: text.slice(0, CAPTION_TEXT_LIMIT), end: text.length }]
}

function chunkAt(chunks: readonly CaptionChunk[], progress: number): string {
  const total = chunks.at(-1)?.end ?? 1
  const position = Math.min(total, Math.max(0, progress * total))
  return chunks.find(chunk => position <= chunk.end)?.text ?? chunks.at(-1)?.text ?? ''
}

/** Speak the configured range, trimming very long replies with the web player's cue. */
export function nativeReadingText(value: string, settings: ResolvedTtsSettings): string {
  const scoped = settings.provider === 'breeze'
    ? applyBreezeTtsPlaybackScope(value, settings.readScope, false)
    : applyTtsPlaybackScope(value, settings.readScope, false)
  const text = scoped.trim()
  if (countTtsSpeechCharacters(text) <= MAX_SPEECH_CHARACTERS) return text
  const segments = settings.provider === 'breeze' ? splitBreezeTtsSegments(text) : splitTtsSegments(text)
  let spoken = ''
  for (const segment of segments) {
    if (countTtsSpeechCharacters(spoken + segment) > MAX_SPEECH_CHARACTERS) break
    spoken += segment
  }
  if (spoken.trim().length === 0) spoken = [...text].slice(0, MAX_SPEECH_CHARACTERS).join('')
  return appendTtsSmartTruncationOutro(text, spoken)
}

/** Provider-sized pieces; each is synthesized as WAV and joined before delivery. */
function synthesisChunks(text: string, provider: string, maximum: number): string[] {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('invalid-text-limit')
  const pieces = provider === 'breeze' ? splitBreezeTtsSegments(text, maximum) : splitTtsSegments(text)
  return pieces.flatMap(piece => splitDeepseekText(piece, maximum)).filter(piece => piece.trim().length > 0)
}

interface WavPcm { formatCode: number; channels: number; sampleRate: number; bytesPerSec: number; blockAlign: number; bitsPerSample: number; data: Buffer }

function readWavPcm(audio: Buffer): WavPcm {
  const info = getWavFileInfo(audio)
  if (info.fmt.formatCode !== 1 || info.fmt.bytesPerSec <= 0 || info.fmt.numberOfChannels <= 0) throw new Error('invalid-audio-format')
  const chunks = info.chunkInfo.filter(chunk => chunk.chunkId === 'data')
  if (chunks.length === 0) throw new Error('invalid-audio-format')
  return {
    formatCode: info.fmt.formatCode,
    channels: info.fmt.numberOfChannels,
    sampleRate: info.fmt.sampleRate,
    bytesPerSec: info.fmt.bytesPerSec,
    blockAlign: info.fmt.bytesPerFrame,
    bitsPerSample: info.fmt.bitsPerSample,
    data: Buffer.concat(chunks.map(chunk => audio.subarray(chunk.dataOffset, chunk.dataOffset + chunk.dataLength))),
  }
}

function wavHeader(pcm: WavPcm, dataBytes: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + dataBytes, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(pcm.formatCode, 20)
  header.writeUInt16LE(pcm.channels, 22)
  header.writeUInt32LE(pcm.sampleRate, 24)
  header.writeUInt32LE(pcm.bytesPerSec, 28)
  header.writeUInt16LE(pcm.blockAlign, 32)
  header.writeUInt16LE(pcm.bitsPerSample, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(dataBytes, 40)
  return header
}

/** Join provider WAVs into one PCM WAV the app can play without gaps. */
export function combineWav(parts: readonly Buffer[]): { data: Buffer; durationMs: number } {
  if (parts.length === 0) throw new Error('invalid-audio-format')
  const first = readWavPcm(parts[0])
  const samples = parts.map((part, index) => {
    const pcm = index === 0 ? first : readWavPcm(part)
    if (pcm.channels !== first.channels || pcm.sampleRate !== first.sampleRate || pcm.bitsPerSample !== first.bitsPerSample) {
      throw new Error('invalid-audio-format')
    }
    return pcm.data
  })
  const data = Buffer.concat(samples)
  return { data: Buffer.concat([wavHeader(first, data.length), data]), durationMs: data.length / first.bytesPerSec * 1000 }
}

function localize(locale: string | undefined, zh: string, en: string): string {
  return (locale ?? '').toLowerCase().startsWith('en') ? en : zh
}

export interface DshGoRegistration {
  dshGo: DshGoService
  speech: SpeechSynthesisService
  current: () => ResolvedTtsSettings
}

/**
 * Native read-aloud for the dsh-go app (protocol v1.2): a reply's long-press
 * menu synthesizes on this host and the app fetches and plays the result.
 * Without the bridge this never runs; the web player is unaffected.
 */
export function registerDshGo({ dshGo, speech, current }: DshGoRegistration): () => void {
  const readings = new ReadingStore()
  const captions = new Map<string, () => void>()

  const stopCaption = (scope: DshGoScope): void => {
    const key = scopeKey(scope)
    captions.get(key)?.()
    captions.delete(key)
  }

  const disposeRead = dshGo.on('read', (scope, event) => {
    const settings = current()
    if (!settings.enabled) return { toast: localize(event?.locale, '语音播报已关闭', 'Voice reading is off') }
    const capabilities = speech.capabilities()
    const active = capabilities.engine ?? capabilities.providers.find(provider => provider.id === capabilities.provider)
    if (active !== undefined && !active.ready) {
      return { toast: localize(event?.locale, '语音服务还没有配置好，请先在网页版设置密钥', 'Voice service is not set up yet; set its key on the web') }
    }
    const text = typeof scope.message === 'string' ? scope.message : ''
    const spoken = nativeReadingText(text, settings)
    if (countTtsSpeechCharacters(spoken) === 0) return { toast: localize(event?.locale, '这条回复没有可读的文字', 'Nothing to read in this reply') }
    stopCaption(scope)
    readings.clear(scope.sessionId)
    const reading = readings.add(spoken, scope)
    const instance = `r${reading.key}`
    const effects: DshGoEffect[] = [
      { type: 'audio', op: 'play', instance, src: `media:${READING_MEDIA_ID}`, key: reading.key },
    ]
    if (settings.showReadingCaptions) effects.push({ type: 'overlay', op: 'show', instance, id: SUBTITLE_OVERLAY })
    return effects
  })

  const disposeMedia = dshGo.media(READING_MEDIA_ID, async (scope, event) => {
    const reading = readings.get(event.key, scope.sessionId)
    if (reading === undefined) throw new Error('reading-not-found')
    const settings = current()
    const formats = speech.capabilities().formats
    if (!formats.includes('wav')) {
      const audio = await speech.synthesize({ text: reading.text, format: 'mp3', signal: event.signal })
      if (audio.data.length > MAX_MEDIA_BYTES) throw new Error('audio-too-large')
      if (audio.durationMs !== undefined) reading.durationMs = audio.durationMs
      reading.startedAt = Date.now()
      return { body: audio.data, contentType: 'audio/mpeg' }
    }
    const parts: Buffer[] = []
    const deadline = Date.now() + MEDIA_BUDGET_MS
    let bytes = 0
    const capabilities = speech.capabilities()
    const active = capabilities.engine ?? capabilities.providers.find(provider => provider.id === capabilities.provider)
    const limit = Math.min(settings.maxTextLength, active?.maxTextLength ?? settings.maxTextLength)
    for (const chunk of synthesisChunks(reading.text, settings.provider, limit)) {
      if (event.signal.aborted) throw event.signal.reason ?? new Error('tts-canceled')
      if (parts.length > 0 && (Date.now() >= deadline || bytes >= MAX_MEDIA_BYTES)) throw new Error('audio-too-large-or-timeout')
      const audio = await speech.synthesize({ text: chunk, format: 'wav', signal: event.signal })
      parts.push(audio.data)
      bytes += audio.data.length
    }
    const combined = combineWav(parts)
    if (combined.data.length > MAX_MEDIA_BYTES) throw new Error('audio-too-large')
    reading.durationMs = combined.durationMs
    reading.startedAt = Date.now()
    return { body: combined.data, contentType: 'audio/wav' }
  })

  const disposeMicro = dshGo.micro(CAPTION_CHANNEL, {
    data: (scope, emit) => {
      const reading = readings.latest(scope.sessionId)
      if (reading === undefined) return () => {}
      const chunks = captionChunks(reading.text)
      const settings = current()
      const estimated = countTtsSpeechCharacters(reading.text) / (ESTIMATED_CHARACTERS_PER_SECOND * Math.max(0.5, settings.voiceRate)) * 1000
      captions.get(scopeKey(scope))?.()
      emit({ text: chunks[0]?.text ?? '', progress: 0 })
      const timer = setInterval(() => {
        if (reading.startedAt === undefined) return
        const duration = Math.max(800, reading.durationMs ?? estimated)
        const progress = Math.min(1, (Date.now() - reading.startedAt) / duration)
        emit({ text: chunkAt(chunks, progress), progress })
        if (progress >= 1) {
          clearInterval(timer)
          captions.delete(scopeKey(scope))
        }
      }, CAPTION_TICK_MS)
      timer.unref()
      const key = scopeKey(scope)
      captions.get(key)?.()
      const stop = () => {
        clearInterval(timer)
        if (captions.get(key) === stop) captions.delete(key)
      }
      captions.set(key, stop)
      return stop
    },
  })

  const disposeCapability = dshGo.onCapability((scope, event) => {
    const reading = readings.latest(scope.sessionId)
    if (reading === undefined || event.instance !== `r${reading.key}`) return
    if (event.event === 'audio.ended' || event.event === 'audio.stopped' || event.event === 'audio.error'
      || event.event === 'overlay.closed') {
      stopCaption(scope)
    }
    if (event.event.startsWith('audio.')) readings.delete(reading.key)
  })

  return () => {
    disposeCapability()
    disposeMicro()
    disposeMedia()
    disposeRead()
    for (const stop of captions.values()) stop()
    captions.clear()
    readings.dispose()
  }
}
