import type { ReactElement } from 'react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  IconLoadingOutline16,
  IconPauseOutline16,
  IconPlayOutline16,
  IconChevronDownOutline14,
  Tooltip,
  extractMarkdownPlainText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContext, ConversationSnapshot, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import {
  TTS_ROUTE,
  TTS_STREAM_ROUTE,
  TTS_MODELS,
  TTS_SETTINGS_NAMESPACE,
  TTS_VOICES,
  TTS_VOICE_DESIGN_PRESETS,
  AbortableSentenceQueue,
  batchTtsStreamText,
  classifyLiveSpeechTransition,
  parseSseRecords,
  prepareTtsText,
  resolveTtsSettings,
  splitCompletedTtsSentences,
} from '../shared.js'
import type { LiveSpeechCursor, TtsFormat, TtsSettings } from '../shared.js'

/** Client services required by this plugin. */
export const inject = [
  'slots',
  'locale',
  'connection',
  'remote',
  'settingsScope',
]

const NS = 'xiaomi-mimo-tts'
type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

interface PlaybackView {
  messageId: string | null
  status: PlaybackStatus
  error: string | null
}

interface SynthesizedAudio {
  url: string
  audio: HTMLAudioElement
}

const zh = {
  'action.play': '朗读回复',
  'action.pause': '暂停朗读',
  'action.resume': '继续朗读',
  'action.loading': '正在生成语音',
  'action.retry': '重新生成语音',
  'error.noText': '这条回复没有可朗读的正文。',
  'error.request': '语音生成失败。',
  'error.play': '浏览器阻止了自动播放，请点击朗读按钮。',
  'settings.title': '语音朗读 (Xiaomi MiMo)',
  'settings.description': '在助手回复操作栏中使用 Xiaomi MiMo TTS 生成并播放语音。',
  'settings.enabled': '显示朗读按钮',
  'settings.enabledHint': '关闭后不会在助手回复操作栏显示朗读按钮，也不会自动播报。',
  'settings.apiKey': 'API Key',
  'settings.apiKeyHint': '密钥保存在 DSH 设置文件中，传到浏览器前会被脱敏。',
  'settings.apiKeyStatus': '只有输入新值并保存时才会替换现有密钥。',
  'settings.apiKeyConfigured': '已配置',
  'settings.getApiKey': '获取 API Key',
  'settings.autoPlay': '开启自动播报',
  'settings.autoPlayHint': '开启时会同步显示朗读按钮；浏览器也可能拒绝自动播放。',
  'settings.model': 'TTS 模型',
  'settings.presetModel': '预置音色模型',
  'settings.voiceDesignModel': '自定义音色模型',
  'settings.modelAutoPlayHintPreset': '预置音色模型支持实时流式播放。',
  'settings.modelAutoPlayHintVoiceDesign': '自定义音色仅支持在回复完成后自动播放。',
  'settings.voice': '内置音色',
  'settings.voiceDesignPrompt': '自定义音色描述',
  'settings.voiceDesignPromptHint': '按“年龄段 + 性别、声音质感、语速节奏、情绪底色”描述声音本身；不写场景或动作。',
  'settings.format': '音频格式',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.saved': '已保存',
  'settings.unsaved': '未保存',
  'settings.overridden': '已覆盖',
  'settings.reset': '恢复默认',
  'settings.discard': '放弃修改',
  'settings.failed': '保存失败，请重试。',
  'settings.readOnly': '当前 DSH 设置为只读。',
  'settings.secretPlaceholder': '输入新的 Xiaomi MiMo API Key',
  'settings.expand': '展开设置',
  'settings.collapse': '收起设置',
} as const

const en: Record<keyof typeof zh, string> = {
  'action.play': 'Read aloud',
  'action.pause': 'Pause speech',
  'action.resume': 'Resume speech',
  'action.loading': 'Generating speech',
  'action.retry': 'Generate speech again',
  'error.noText': 'This response has no readable body text.',
  'error.request': 'Speech generation failed.',
  'error.play': 'The browser blocked autoplay. Click Read aloud to play it.',
  'settings.title': 'Text To Speech (Xiaomi MiMo)',
  'settings.description': 'Generate and play Xiaomi MiMo TTS audio from assistant message actions.',
  'settings.enabled': 'Show read-aloud button',
  'settings.enabledHint': 'When disabled, the read-aloud button and automatic speech are both turned off.',
  'settings.apiKey': 'API Key',
  'settings.apiKeyHint': 'Stored in DSH settings and redacted before settings are sent to the browser.',
  'settings.apiKeyStatus': 'An existing key changes only when you save a new value.',
  'settings.apiKeyConfigured': 'Configured',
  'settings.getApiKey': 'Get API Key',
  'settings.autoPlay': 'Enable automatic read-aloud',
  'settings.autoPlayHint': 'Enabling it also shows the read-aloud button; the browser may reject autoplay.',
  'settings.model': 'TTS model',
  'settings.presetModel': 'Preset voices',
  'settings.voiceDesignModel': 'Custom voice design',
  'settings.modelAutoPlayHintPreset': 'Preset voices support realtime streaming playback.',
  'settings.modelAutoPlayHintVoiceDesign': 'Custom voice design supports automatic playback only after the reply is complete.',
  'settings.voice': 'Built-in voice',
  'settings.voiceDesignPrompt': 'Custom voice description',
  'settings.voiceDesignPromptHint': 'Describe the voice itself with age/gender, texture, pace, and emotional baseline; avoid scenes or actions.',
  'settings.format': 'Audio format',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.saved': 'Saved',
  'settings.unsaved': 'Unsaved',
  'settings.overridden': 'Overridden',
  'settings.reset': 'Restore default',
  'settings.discard': 'Discard changes',
  'settings.failed': 'Save failed. Try again.',
  'settings.readOnly': 'DSH settings are read-only.',
  'settings.secretPlaceholder': 'Enter a new Xiaomi MiMo API key',
  'settings.expand': 'Expand settings',
  'settings.collapse': 'Collapse settings',
}

type LocaleKey = keyof typeof zh

type Translate = (key: LocaleKey) => string

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'xiaomi-mimo-tts': LocaleKey
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function decodeSettings(value: unknown): TtsSettings | undefined {
  if (!isRecord(value)) return undefined
  const decoded: TtsSettings = {}
  if (typeof value.enabled === 'boolean') decoded.enabled = value.enabled
  if (typeof value.apiKey === 'string') decoded.apiKey = value.apiKey
  if (typeof value.baseURL === 'string') decoded.baseURL = value.baseURL
  if (TTS_MODELS.includes(value.model as typeof TTS_MODELS[number])) decoded.model = value.model as typeof TTS_MODELS[number]
  if (typeof value.voice === 'string') decoded.voice = value.voice
  if (typeof value.voiceDesignPrompt === 'string') decoded.voiceDesignPrompt = value.voiceDesignPrompt
  if (typeof value.voiceDesignCustomPrompt === 'string') decoded.voiceDesignCustomPrompt = value.voiceDesignCustomPrompt
  if (value.format === 'mp3' || value.format === 'wav') decoded.format = value.format
  if (typeof value.autoPlay === 'boolean') decoded.autoPlay = value.autoPlay
  if (typeof value.maxTextLength === 'number') decoded.maxTextLength = value.maxTextLength
  if (typeof value.requestTimeoutMs === 'number') decoded.requestTimeoutMs = value.requestTimeoutMs
  return decoded
}

function useSettingsSnapshot<T>(scope: SettingsScope<T>) {
  return useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
    () => scope.getSnapshot(),
  )
}

function formatStartupError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function registerSlotContribution(
  ctx: ClientContext,
  name: 'conversation.input.dock' | 'conversation.chat.assistant-actions' | 'settings.plugin.item',
  register: () => (() => void) | Iterable<() => void>,
): void {
  ctx.effect(() => {
    try {
      ctx.slots.inject(name, () => {
        try {
          return register()
        } catch (error) {
          ctx.logger.error(`dsh-xiaomi-tts: ${name} contribution disabled: ${formatStartupError(error)}`)
          return () => {}
        }
      })
    } catch (error) {
      ctx.logger.error(`dsh-xiaomi-tts: ${name} injection disabled: ${formatStartupError(error)}`)
    }
    return () => {}
  }, `xiaomi-mimo-tts: ${name}`)
}

function messageText(snapshot: ConversationSnapshot, messageId: string): string {
  for (const node of snapshot.nodes) {
    if (node.kind !== 'assistant' || node.messageId !== messageId) continue
    const markdown = node.blocks
      .filter((block) => block.kind === 'text')
      .map((block) => block.text)
      .join('\n\n')
    return extractMarkdownPlainText(prepareTtsText(markdown)).trim()
  }
  return ''
}

function messageTime(snapshot: ConversationSnapshot, messageId: string): number | null {
  for (const node of snapshot.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return node.time
  }
  return null
}

function latestAssistantMessageId(snapshot: ConversationSnapshot): string | null {
  for (let index = snapshot.nodes.length - 1; index >= 0; index -= 1) {
    const node = snapshot.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined) return node.messageId
  }
  return null
}

function assistantText(blocks: readonly { kind: string; text?: string }[]): string {
  return blocks
    .filter((block): block is { kind: 'text'; text: string } => block.kind === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n\n')
}

interface LiveMessageIdentity {
  messageId: string
  turn: number
  step: number
  text: string
  interrupted: boolean
}

function finalLiveMessage(snapshot: ConversationSnapshot, turn: number, step: number): LiveMessageIdentity | null {
  for (let index = snapshot.nodes.length - 1; index >= 0; index -= 1) {
    const node = snapshot.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined && node.turn === turn && node.step === step) {
      return {
        messageId: node.messageId,
        turn: node.turn,
        step: node.step,
        text: assistantText(node.blocks),
        interrupted: node.interrupted === true,
      }
    }
  }
  return null
}

function messageLiveIdentity(snapshot: ConversationSnapshot, messageId: string): Pick<LiveMessageIdentity, 'turn' | 'step'> | null {
  for (const node of snapshot.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return { turn: node.turn, step: node.step }
  }
  return null
}

function pcmDeltaFromSse(data: string): string | null {
  if (data === '[DONE]') return null
  try {
    const value = JSON.parse(data) as { choices?: Array<{ delta?: { audio?: { data?: unknown } } }> }
    const pcm = value.choices?.[0]?.delta?.audio?.data
    return typeof pcm === 'string' && pcm.length > 0 ? pcm : null
  } catch {
    return null
  }
}

class PcmAudioQueue {
  private context: AudioContext | null = null
  private scheduledAt = 0
  private readonly sources = new Set<AudioBufferSourceNode>()
  private revision = 0
  private chain: Promise<void> = Promise.resolve()

  constructor(private readonly onStateChange: (status: PlaybackStatus) => void) {}

  enqueue(base64: string): Promise<void> {
    const revision = this.revision
    this.chain = this.chain.then(() => this.schedule(base64, revision)).catch(() => {})
    return this.chain
  }

  stop(): void {
    this.revision += 1
    this.scheduledAt = 0
    for (const source of this.sources) source.stop()
    this.sources.clear()
    this.onStateChange('idle')
  }

  pause(): void {
    if (this.context?.state === 'running') {
      void this.context.suspend()
      this.onStateChange('paused')
    }
  }

  resume(): void {
    if (this.context !== null && this.context.state !== 'running') {
      void this.context.resume()
      this.onStateChange('playing')
    }
  }

  async dispose(): Promise<void> {
    this.stop()
    const context = this.context
    this.context = null
    if (context !== null && context.state !== 'closed') await context.close()
  }

  private async schedule(base64: string, revision: number): Promise<void> {
    if (revision !== this.revision) return
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    if (bytes.byteLength < 2) return
    const context = this.getContext()
    if (context.state !== 'running') await context.resume()
    if (revision !== this.revision) return

    const sampleCount = Math.floor(bytes.byteLength / 2)
    const buffer = context.createBuffer(1, sampleCount, 24000)
    const channel = buffer.getChannelData(0)
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    for (let index = 0; index < sampleCount; index += 1) channel[index] = pcm.getInt16(index * 2, true) / 0x8000

    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    const startAt = Math.max(context.currentTime + 0.03, this.scheduledAt)
    this.scheduledAt = startAt + buffer.duration
    this.sources.add(source)
    source.addEventListener('ended', () => {
      if (revision !== this.revision) return
      this.sources.delete(source)
      if (this.sources.size === 0) this.onStateChange('idle')
    }, { once: true })
    source.start(startAt)
    this.onStateChange('playing')
  }

  private getContext(): AudioContext {
    if (this.context === null) this.context = new AudioContext()
    return this.context
  }
}

class LiveSpeechController {
  private readonly audio = new PcmAudioQueue((status) => this.setStatus(status))
  private streamGeneration = 0
  private queue = this.createQueue()
  private active: LiveSpeechCursor | null = null
  private observed = ''
  private consumed = 0
  private pendingText = ''
  private handled = new Set<string>()
  private messageId: string | null = null
  private status: PlaybackStatus = 'idle'
  private onStateChange: ((messageId: string, status: PlaybackStatus) => void) | null = null

  setStateChangeListener(listener: (messageId: string, status: PlaybackStatus) => void): void {
    this.onStateChange = listener
  }

  observe(sessionId: string, turn: number, step: number, text: string): void {
    const next = { sessionId, turn, step }
    const transition = classifyLiveSpeechTransition(this.active, next)
    if (transition === 'new-turn' || (transition === 'same-step' && !text.startsWith(this.observed))) this.reset(next)
    else if (transition === 'same-turn') this.advanceSegment(next)
    this.observed = text
    this.drain(false)
  }

  finish(sessionId: string, final: LiveMessageIdentity): void {
    const key = `${sessionId}:${final.turn}:${final.step}`
    if (this.active === null || this.cursorKey(this.active) !== key) return
    if (final.interrupted) {
      this.cancelSession(sessionId)
      return
    }
    if (final.text.startsWith(this.observed)) this.observed = final.text
    this.messageId = final.messageId
    this.reportStatus()
    this.drain(true)
    this.handled.add(key)
  }

  toggle(messageId: string): boolean {
    if (this.messageId !== messageId || (this.status !== 'playing' && this.status !== 'paused')) return false
    if (this.status === 'playing') this.audio.pause()
    else this.audio.resume()
    return true
  }

  hasHandled(sessionId: string, identity: Pick<LiveMessageIdentity, 'turn' | 'step'> | null): boolean {
    return identity !== null && this.handled.has(`${sessionId}:${identity.turn}:${identity.step}`)
  }

  cancelSession(sessionId: string): void {
    if (this.active?.sessionId === sessionId) this.cancel()
  }

  cancel(): void {
    this.replaceQueue()
    this.audio.stop()
    this.active = null
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
    this.messageId = null
    this.status = 'idle'
  }

  async dispose(): Promise<void> {
    this.cancel()
    this.handled.clear()
    await this.audio.dispose()
  }

  private reset(next: LiveSpeechCursor): void {
    this.replaceQueue()
    this.audio.stop()
    this.beginSegment(next)
    this.status = 'idle'
  }

  private advanceSegment(next: LiveSpeechCursor): void {
    this.drain(true)
    this.beginSegment(next)
  }

  private beginSegment(next: LiveSpeechCursor): void {
    this.active = next
    this.observed = ''
    this.consumed = 0
    this.pendingText = ''
    this.messageId = null
  }

  private cursorKey(cursor: LiveSpeechCursor): string {
    return `${cursor.sessionId}:${cursor.turn}:${cursor.step}`
  }

  private drain(flush: boolean): void {
    const { sentences, remainder } = splitCompletedTtsSentences(this.observed.slice(this.consumed))
    const ready = flush && remainder.trim().length > 0 ? [...sentences, remainder] : sentences
    this.consumed += sentences.join('').length
    if (flush) this.consumed = this.observed.length
    for (const sentence of ready) this.stageSentence(sentence, false)
    if (flush) this.stageSentence('', true)
  }

  private stageSentence(sentence: string, flush: boolean): void {
    const text = extractMarkdownPlainText(prepareTtsText(sentence)).trim()
    const batch = batchTtsStreamText(this.pendingText, text, flush)
    this.pendingText = batch.pending
    if (batch.request !== null) this.queue.enqueue(batch.request)
  }

  private createQueue(): AbortableSentenceQueue {
    const generation = this.streamGeneration
    return new AbortableSentenceQueue((sentence, signal) => this.stream(sentence, signal, generation))
  }

  private replaceQueue(): void {
    this.streamGeneration += 1
    this.queue.cancel()
    this.queue = this.createQueue()
  }

  private isCurrentStream(generation: number, signal: AbortSignal): boolean {
    return generation === this.streamGeneration && !signal.aborted
  }

  private async stream(sentence: string, signal: AbortSignal, generation: number): Promise<void> {
    if (!this.isCurrentStream(generation, signal)) return
    this.setStatus('loading')
    try {
      const response = await fetch(TTS_STREAM_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: sentence }),
        signal,
      })
      if (!this.isCurrentStream(generation, signal)) return
      if (!response.ok) throw new Error(`stream-request-${response.status}`)
      if (response.body === null) throw new Error('stream-response-empty')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let pending = ''
      try {
        while (this.isCurrentStream(generation, signal)) {
          const result = await reader.read()
          if (result.done || !this.isCurrentStream(generation, signal)) break
          pending += decoder.decode(result.value, { stream: true })
          const parsed = parseSseRecords(pending)
          pending = parsed.remainder
          for (const event of parsed.events) {
            if (!this.isCurrentStream(generation, signal)) return
            const pcm = pcmDeltaFromSse(event)
            if (pcm !== null) {
              await this.audio.enqueue(pcm)
              if (!this.isCurrentStream(generation, signal)) return
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (!this.isCurrentStream(generation, signal)) return
      this.setStatus('error')
      throw error
    }
  }

  private setStatus(status: PlaybackStatus): void {
    this.status = status
    this.reportStatus()
  }

  private reportStatus(): void {
    if (this.messageId !== null) this.onStateChange?.(this.messageId, this.status)
  }
}

class PlaybackController {
  readonly autoPlayArmedAt = Date.now()
  private view: PlaybackView = { messageId: null, status: 'idle', error: null }
  private readonly listeners = new Set<() => void>()
  private readonly automaticallyPlayed = new Set<string>()
  private readonly liveSessions = new Set<string>()
  private readonly completedSessions = new Set<string>()
  private readonly completedMessages = new Map<string, string>()
  private current: SynthesizedAudio | null = null
  private request: AbortController | null = null
  private generation = 0

  getSnapshot = (): PlaybackView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  observeSession(sessionId: string, running: boolean, latestMessageId: string | null): void {
    if (running) {
      this.liveSessions.add(sessionId)
      this.completedSessions.delete(sessionId)
      this.completedMessages.delete(sessionId)
      return
    }

    if (this.liveSessions.delete(sessionId)) {
      this.completedSessions.add(sessionId)
    }
    if (this.completedSessions.has(sessionId) && latestMessageId !== null) {
      this.completedMessages.set(sessionId, latestMessageId)
    }
  }

  claimAutomaticPlayback(sessionId: string, messageId: string): boolean {
    const key = `${sessionId}:${messageId}`
    if (this.completedMessages.get(sessionId) !== messageId) return false
    if (this.automaticallyPlayed.has(key)) return false
    this.automaticallyPlayed.add(key)
    this.completedSessions.delete(sessionId)
    this.completedMessages.delete(sessionId)
    return true
  }

  updateLivePlayback(messageId: string, status: PlaybackStatus): void {
    if (this.view.messageId === messageId || status !== 'idle') this.publish({ messageId, status, error: status === 'error' ? 'play-failed' : null })
  }

  async toggle(messageId: string, text: string, automatic: boolean): Promise<void> {
    if (this.view.messageId === messageId && this.current !== null) {
      if (this.current.audio.paused) {
        try {
          await this.current.audio.play()
          this.publish({ messageId, status: 'playing', error: null })
        } catch {
          this.publish({ messageId, status: 'paused', error: automatic ? 'autoplay-blocked' : 'play-failed' })
        }
      } else {
        this.current.audio.pause()
        this.publish({ messageId, status: 'paused', error: null })
      }
      return
    }

    if (text.length === 0) {
      this.publish({ messageId, status: 'error', error: 'no-text' })
      return
    }

    this.stopCurrent()
    const generation = ++this.generation
    const controller = new AbortController()
    this.request = controller
    this.publish({ messageId, status: 'loading', error: null })

    try {
      const response = await fetch(TTS_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })
      if (!response.ok) {
        let message = `${response.status}`
        try {
          const body = await response.json() as { message?: unknown; error?: unknown }
          if (typeof body.message === 'string') message = body.message
          else if (typeof body.error === 'string') message = body.error
        } catch {
          // Non-JSON error bodies leave the HTTP status as the fallback message.
        }
        throw new Error(message)
      }

      const blob = await response.blob()
      if (generation !== this.generation) return
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      this.current = { url, audio }
      this.request = null
      audio.addEventListener('ended', () => {
        if (this.current?.audio === audio) this.publish({ messageId, status: 'idle', error: null })
      })
      audio.addEventListener('error', () => {
        if (this.current?.audio === audio) this.publish({ messageId, status: 'error', error: 'play-failed' })
      })

      try {
        await audio.play()
        this.publish({ messageId, status: 'playing', error: null })
      } catch {
        this.publish({ messageId, status: 'paused', error: automatic ? 'autoplay-blocked' : 'play-failed' })
      }
    } catch (error) {
      if (controller.signal.aborted || generation !== this.generation) return
      this.request = null
      this.publish({
        messageId,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  dispose(): void {
    this.generation += 1
    this.stopCurrent()
    this.liveSessions.clear()
    this.completedSessions.clear()
    this.completedMessages.clear()
    this.listeners.clear()
  }

  private stopCurrent(): void {
    this.request?.abort()
    this.request = null
    if (this.current !== null) {
      this.current.audio.pause()
      this.current.audio.removeAttribute('src')
      URL.revokeObjectURL(this.current.url)
      this.current = null
    }
  }

  private publish(view: PlaybackView): void {
    this.view = view
    for (const listener of this.listeners) listener()
  }
}

interface AutoPlayRunObserverProps {
  sessionId: string
  session: ConversationSnapshot
  playback: PlaybackController
}

/** Track live turn completion separately from finalized-message rendering. */
function AutoPlayRunObserver({ sessionId, session, playback }: AutoPlayRunObserverProps): null {
  const latestMessageId = latestAssistantMessageId(session)

  useEffect(() => {
    playback.observeSession(sessionId, session.running, latestMessageId)
  }, [latestMessageId, playback, session.running, sessionId])

  return null
}

interface LiveSpeechObserverProps {
  sessionId: string
  session: ConversationSnapshot
  live: LiveSpeechController
  settings: SettingsScope<TtsSettings>
}

/** Feed the public `ConversationSnapshot.partial` projection into sentence-level realtime speech. */
function LiveSpeechObserver({ sessionId, session, live, settings }: LiveSpeechObserverProps): null {
  const settingsSnapshot = useSettingsSnapshot(settings)
  const resolvedSettings = resolveTtsSettings(settingsSnapshot.value)
  const active = useRef<{ turn: number; step: number } | null>(null)
  const wasRunning = useRef(session.running)
  const partial = session.partial
  const partialText = partial === null ? '' : assistantText(partial.blocks)

  useEffect(() => {
    const beganRun = session.running && !wasRunning.current
    wasRunning.current = session.running
    if (!resolvedSettings.enabled || !resolvedSettings.autoPlay || resolvedSettings.model !== 'mimo-v2.5-tts') {
      live.cancelSession(sessionId)
      active.current = null
      return
    }
    if (beganRun) {
      live.cancelSession(sessionId)
      active.current = null
    }
    if (partial !== null) {
      if (active.current !== null && (active.current.turn !== partial.turn || active.current.step !== partial.step)) {
        const previous = finalLiveMessage(session, active.current.turn, active.current.step)
        if (previous !== null) live.finish(sessionId, previous)
      }
      active.current = { turn: partial.turn, step: partial.step }
      live.observe(sessionId, partial.turn, partial.step, partialText)
      return
    }
    if (active.current !== null) {
      const final = finalLiveMessage(session, active.current.turn, active.current.step)
      if (final !== null) live.finish(sessionId, final)
      else if (!session.running) live.cancelSession(sessionId)
      active.current = null
    }
  }, [live, partial, partialText, resolvedSettings.autoPlay, resolvedSettings.enabled, resolvedSettings.model, session, sessionId, session.running])

  useEffect(() => () => live.cancelSession(sessionId), [live, sessionId])
  return null
}

interface ReadAloudActionProps {
  sessionId: string
  messageId: string
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  playback: PlaybackController
  live: LiveSpeechController
  settings: SettingsScope<TtsSettings>
  t: Translate
}

function ReadAloudAction({ sessionId, messageId, useSession, playback, live, settings, t }: ReadAloudActionProps): ReactElement | null {
  const message = useSession((snapshot) => ({
    text: messageText(snapshot, messageId),
    time: messageTime(snapshot, messageId),
    latestMessageId: latestAssistantMessageId(snapshot),
    identity: messageLiveIdentity(snapshot, messageId),
    running: snapshot.running,
  }))
  const text = message.text
  const settingsSnapshot = useSettingsSnapshot(settings)
  const view = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)

  useEffect(() => {
    if (text.length === 0 || settingsSnapshot.value?.enabled !== true || settingsSnapshot.value?.autoPlay !== true || live.hasHandled(sessionId, message.identity) || message.running || message.latestMessageId !== messageId || message.time === null || message.time < playback.autoPlayArmedAt) return
    const cancel = window.setTimeout(() => {
      if (!live.hasHandled(sessionId, message.identity) && playback.claimAutomaticPlayback(sessionId, messageId)) void playback.toggle(messageId, text, true)
    }, 0)
    return () => window.clearTimeout(cancel)
  }, [live, message.identity, message.latestMessageId, message.running, message.time, messageId, playback, sessionId, settingsSnapshot.value?.autoPlay, settingsSnapshot.value?.enabled, text])

  if (settingsSnapshot.value?.enabled !== true || text.length === 0) return null

  const mine = view.messageId === messageId
  const status = mine ? view.status : 'idle'
  const label = status === 'loading'
    ? t('action.loading')
    : status === 'playing'
      ? t('action.pause')
      : status === 'paused'
        ? t('action.resume')
        : status === 'error'
          ? t('action.retry')
          : t('action.play')
  const error = mine ? view.error : null
  const errorText = error === null
    ? null
    : error === 'no-text'
      ? t('error.noText')
      : error === 'autoplay-blocked' || error === 'play-failed'
        ? t('error.play')
        : t('error.request')

  return (
    <>
      <Tooltip label={label} side="bottom">
        <button
          type="button"
          className="xmimo-tts-action"
          aria-label={label}
          aria-pressed={status === 'playing'}
          disabled={status === 'loading'}
          onClick={() => {
            if (!live.toggle(messageId)) {
              live.cancel()
              void playback.toggle(messageId, text, false)
            }
          }}
        >
          {status === 'loading'
            ? <IconLoadingOutline16 className="xmimo-tts-spin" />
            : status === 'playing'
              ? <IconPauseOutline16 />
              : <IconPlayOutline16 />}
        </button>
      </Tooltip>
      {errorText === null ? null : <span className="xmimo-tts-inline-error" role="status">{errorText}</span>}
    </>
  )
}

interface SettingsCardProps {
  scope: SettingsScope<TtsSettings>
  t: Translate
}

type EditableSettingField = 'enabled' | 'autoPlay' | 'model' | 'voice' | 'voiceDesignPrompt' | 'voiceDesignCustomPrompt' | 'format'
type SettingField = EditableSettingField | 'apiKey'
type DraftChange = { kind: 'set' } | { kind: 'clear' }
type DraftChanges = Partial<Record<SettingField, DraftChange>>
type ResolvedSettings = ReturnType<typeof resolveTtsSettings>
type DraftSettings = Pick<ResolvedSettings, EditableSettingField>

const EDITABLE_SETTING_FIELDS: EditableSettingField[] = ['enabled', 'autoPlay', 'model', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt', 'format']

const CUSTOM_VOICE_DESIGN_OPTION = '__custom__'

function isPresetVoiceDesignPrompt(value: string): boolean {
  return TTS_VOICE_DESIGN_PRESETS.some((item) => item.prompt === value)
}

function layerSettings(value: unknown): TtsSettings | undefined {
  return isRecord(value) ? value as TtsSettings : undefined
}

function hasLayerField(value: unknown, field: string): boolean {
  return isRecord(value) && Object.hasOwn(value, field)
}

interface SettingFieldHeadingProps {
  label: string
  suffix?: ReactElement
  overriddenLabel: string
  resetLabel?: string
  overridden: boolean
  resettable: boolean
  disabled: boolean
  onReset?: () => void
}

function SettingFieldHeading({ label, suffix, overriddenLabel, resetLabel, overridden, resettable, disabled, onReset }: SettingFieldHeadingProps): ReactElement {
  return (
    <span className="xmimo-tts-field-heading">
      <span className="xmimo-tts-field-label">
        <span>{label}</span>
        {suffix}
      </span>
      {overridden ? <span className="xmimo-tts-field-badges">
        <small className="xmimo-tts-overridden">{overriddenLabel}</small>
        {resettable && onReset !== undefined && resetLabel !== undefined ? <button type="button" className="xmimo-tts-reset" disabled={disabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReset() }}>{resetLabel}</button> : null}
      </span> : null}
    </span>
  )
}

function SettingsCard({ scope, t }: SettingsCardProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const value = snapshot.value
  const initial = resolveTtsSettings(value)
  const [apiKey, setApiKey] = useState('')
  const [enabled, setEnabled] = useState(initial.enabled)
  const [autoPlay, setAutoPlay] = useState(initial.autoPlay)
  const [model, setModel] = useState(initial.model)
  const [voice, setVoice] = useState(initial.voice)
  const [voiceDesignPrompt, setVoiceDesignPrompt] = useState(initial.voiceDesignPrompt)
  const [voiceDesignCustomPrompt, setVoiceDesignCustomPrompt] = useState(initial.voiceDesignCustomPrompt)
  const [format, setFormat] = useState<TtsFormat>(initial.format)
  const [changes, setChanges] = useState<DraftChanges>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [open, setOpen] = useState(false)

  const accepted = resolveTtsSettings(value)
  const base = resolveTtsSettings(layerSettings(snapshot.base))
  const draft: DraftSettings = { enabled, autoPlay: enabled && autoPlay, model, voice, voiceDesignPrompt, voiceDesignCustomPrompt, format }
  const acceptedValue = (field: EditableSettingField): ResolvedSettings[typeof field] => {
    const raw = value?.[field]
    return (raw === undefined ? accepted[field] : raw) as ResolvedSettings[typeof field]
  }
  const hasOverride = (field: SettingField): boolean => hasLayerField(snapshot.user, field)
  const fieldOverridden = (field: SettingField): boolean => {
    const change = changes[field]
    if (change?.kind === 'clear') return false
    if (change?.kind === 'set') return field === 'apiKey' ? apiKey.trim().length > 0 : true
    return hasOverride(field)
  }
  const fieldDirty = (field: EditableSettingField): boolean => {
    const change = changes[field]
    if (change === undefined) return false
    if (change.kind === 'clear') return hasOverride(field)
    return !Object.is(draft[field], acceptedValue(field))
  }
  const apiKeyDirty = changes.apiKey?.kind === 'clear'
    ? hasOverride('apiKey')
    : changes.apiKey?.kind === 'set' && apiKey.trim().length > 0
  const dirty = EDITABLE_SETTING_FIELDS.some(fieldDirty) || apiKeyDirty === true

  useEffect(() => {
    if (dirty) return
    const next = resolveTtsSettings(value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setModel(next.model)
    setVoice(next.voice)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setFormat(next.format)
    setChanges({})
  }, [dirty, value])

  if (snapshot.status === 'unavailable') return null

  const markChange = (field: SettingField, kind: DraftChange['kind'] = 'set'): void => {
    setChanges((current) => ({ ...current, [field]: { kind } }))
    setState('idle')
  }

  const resetField = (field: EditableSettingField): void => {
    markChange(field, 'clear')
    if (field === 'enabled') setEnabled(base.enabled)
    if (field === 'autoPlay') setAutoPlay(base.autoPlay)
    if (field === 'model') setModel(base.model)
    if (field === 'voice') setVoice(base.voice)
    if (field === 'voiceDesignPrompt') setVoiceDesignPrompt(base.voiceDesignPrompt)
    if (field === 'voiceDesignCustomPrompt') setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt)
    if (field === 'format') setFormat(base.format)
  }

  const discard = (): void => {
    const next = resolveTtsSettings(scope.getSnapshot().value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setModel(next.model)
    setVoice(next.voice)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setFormat(next.format)
    setApiKey('')
    setChanges({})
    setState('idle')
  }

  const save = async (): Promise<void> => {
    setState('saving')
    try {
      for (const field of EDITABLE_SETTING_FIELDS) {
        const change = changes[field]
        if (change === undefined) continue
        if (change.kind === 'clear') {
          if (hasOverride(field)) await scope.unset(field)
        } else if (!Object.is(draft[field], acceptedValue(field))) {
          await scope.set(field, draft[field])
        }
      }
      const apiKeyChange = changes.apiKey
      if (apiKeyChange?.kind === 'clear') {
        if (hasOverride('apiKey')) await scope.unset('apiKey')
      } else if (apiKeyChange?.kind === 'set' && apiKey.trim().length > 0) {
        await scope.set('apiKey', apiKey.trim())
      }
      setApiKey('')
      setChanges({})
      setState('saved')
    } catch {
      setState('failed')
    }
  }

  return (
    <li className={open ? 'xmimo-tts-card xmimo-tts-card-open' : 'xmimo-tts-card'}>
      <button
        type="button"
        className="xmimo-tts-card-header"
        aria-expanded={open}
        aria-label={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${t('settings.title')}`}
        onClick={() => { setOpen((current) => !current) }}
      >
        <span className="xmimo-tts-card-head-text">
          <span className="xmimo-tts-card-title">{t('settings.title')}</span>
          <span className="xmimo-tts-card-description">{t('settings.description')}</span>
        </span>
        {dirty ? <span className="xmimo-tts-pending" role="status">{t('settings.unsaved')}</span> : null}
        <IconChevronDownOutline14 className={open ? 'xmimo-tts-chevron xmimo-tts-chevron-open' : 'xmimo-tts-chevron'} />
      </button>
      {open ? <div className="xmimo-tts-card-body">
        <div className="xmimo-tts-grid">
        <div className="xmimo-tts-api-key xmimo-tts-wide">
          <SettingFieldHeading
            label={t('settings.apiKey')}
            suffix={<a className="xmimo-tts-api-key-link" href="https://platform.xiaomimimo.com/console/api-keys" target="_blank" rel="noopener noreferrer">{t('settings.getApiKey')}</a>}
            overriddenLabel={t('settings.apiKeyConfigured')}
            overridden={fieldOverridden('apiKey')}
            resettable={false}
            disabled={!snapshot.writable}
          />
          <input
            type="password"
            value={apiKey}
            name="xmimo-tts-api-key"
            autoComplete="new-password"
            autoCorrect="off"
            spellCheck={false}
            aria-autocomplete="none"
            data-1p-ignore="true"
            data-bwignore="true"
            data-lpignore="true"
            placeholder={t('settings.secretPlaceholder')}
            disabled={!snapshot.writable}
            onChange={(event) => { setApiKey(event.target.value); markChange('apiKey') }}
          />
          <span className="xmimo-tts-api-key-hints">
            <small>{t('settings.apiKeyStatus')}</small>
            <small>{t('settings.apiKeyHint')}</small>
          </span>
        </div>
        <div className="xmimo-tts-switch-row xmimo-tts-wide">
          <label className="xmimo-tts-checkbox-row">
            <input
              type="checkbox"
              checked={enabled}
              disabled={!snapshot.writable}
              onChange={(event) => {
                const next = event.target.checked
                setEnabled(next)
                if (!next) {
                  setAutoPlay(false)
                  setChanges((current) => ({ ...current, enabled: { kind: 'set' }, autoPlay: { kind: 'set' } }))
                } else markChange('enabled')
                setState('idle')
              }}
            />
            <span>
              <SettingFieldHeading label={t('settings.enabled')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('enabled') }} />
              <small>{t('settings.enabledHint')}</small>
            </span>
          </label>
          <label className="xmimo-tts-checkbox-row">
            <input
              type="checkbox"
              checked={enabled && autoPlay}
              disabled={!snapshot.writable}
              onChange={(event) => {
                const next = event.target.checked
                setAutoPlay(next)
                if (next) {
                  setEnabled(true)
                  setChanges((current) => ({ ...current, autoPlay: { kind: 'set' }, enabled: { kind: 'set' } }))
                } else markChange('autoPlay')
                setState('idle')
              }}
            />
            <span>
              <SettingFieldHeading label={t('settings.autoPlay')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('autoPlay') }} />
              <small>{t('settings.autoPlayHint')}</small>
            </span>
          </label>
        </div>
        <div className="xmimo-tts-model xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.model')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('model')} resettable disabled={!snapshot.writable} onReset={() => { resetField('model') }} />
          <select value={model} disabled={!snapshot.writable} onChange={(event) => { setModel(event.target.value as typeof TTS_MODELS[number]); markChange('model') }}>
            <option value="mimo-v2.5-tts">{t('settings.presetModel')}</option>
            <option value="mimo-v2.5-tts-voicedesign">{t('settings.voiceDesignModel')}</option>
          </select>
          {enabled && autoPlay ? <small>{t(model === 'mimo-v2.5-tts' ? 'settings.modelAutoPlayHintPreset' : 'settings.modelAutoPlayHintVoiceDesign')}</small> : null}
        </div>
        {model === 'mimo-v2.5-tts-voicedesign' ? <div className="xmimo-tts-voice-design-prompt xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.voiceDesignPrompt')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceDesignPrompt')} resettable disabled={!snapshot.writable} onReset={() => { resetField('voiceDesignPrompt') }} />
          <select
            value={isPresetVoiceDesignPrompt(voiceDesignPrompt) ? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION}
            disabled={!snapshot.writable}
            aria-label={t('settings.voiceDesignPrompt')}
            onChange={(event) => {
              const next = event.target.value === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : event.target.value
              setVoiceDesignPrompt(next)
              markChange('voiceDesignPrompt')
            }}
          >
            <option value={CUSTOM_VOICE_DESIGN_OPTION}>自定义</option>
            {TTS_VOICE_DESIGN_PRESETS.map((item) => <option key={item.label} value={item.prompt}>{item.label}</option>)}
          </select>
          <textarea
            value={voiceDesignPrompt}
            rows={4}
            disabled={!snapshot.writable}
            placeholder={t('settings.voiceDesignPromptHint')}
            onChange={(event) => {
              const next = event.target.value
              setVoiceDesignPrompt(next)
              setVoiceDesignCustomPrompt(next)
              setChanges((current) => ({ ...current, voiceDesignPrompt: { kind: 'set' }, voiceDesignCustomPrompt: { kind: 'set' } }))
              setState('idle')
            }}
          />
          <small>{t('settings.voiceDesignPromptHint')}</small>
        </div> : null}
        <div className={model === 'mimo-v2.5-tts' ? 'xmimo-tts-select-column xmimo-tts-wide' : 'xmimo-tts-select-column'}>
          {model === 'mimo-v2.5-tts' ? <div>
            <SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('voice') }} />
            <select value={voice} disabled={!snapshot.writable} onChange={(event) => { setVoice(event.target.value); markChange('voice') }}>
              {TTS_VOICES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div> : null}
          <div>
            <SettingFieldHeading label={t('settings.format')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('format') }} />
            <select value={format} disabled={!snapshot.writable} onChange={(event) => { setFormat(event.target.value as 'mp3' | 'wav'); markChange('format') }}>
              <option value="mp3">MP3</option>
              <option value="wav">WAV</option>
            </select>
          </div>
        </div>
        </div>
        <div className="xmimo-tts-card-actions">
          {!snapshot.writable ? <span>{t('settings.readOnly')}</span> : null}
          {state === 'saved' && !dirty ? <span role="status">{t('settings.saved')}</span> : null}
          {state === 'failed' ? <span className="xmimo-tts-failed" role="status">{t('settings.failed')}</span> : null}
          <button type="button" className="xmimo-tts-discard" disabled={!snapshot.writable || !dirty || state === 'saving'} onClick={discard}>
            {t('settings.discard')}
          </button>
          <button type="button" disabled={!snapshot.writable || !dirty || state === 'saving'} onClick={() => { void save() }}>
            {state === 'saving' ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div> : null}
    </li>
  )
}

/** Register the Web action, settings card, locale dictionaries, and styles. */
export function apply(ctx: ClientContext): void {
  const locale = ctx.locale as unknown as {
    bind(namespace: string): Translate
    register(namespace: string, dictionaries: { zh: typeof zh; en: typeof en }): () => void
  }
  const t = locale.bind(NS)
  ctx.effect(() => locale.register(NS, { zh, en }), 'xiaomi-mimo-tts: dictionaries')

  const scope = ctx.settingsScope.bind<TtsSettings>({
    namespace: TTS_SETTINGS_NAMESPACE,
    decode: decodeSettings,
  })
  const playback = new PlaybackController()
  const live = new LiveSpeechController()
  live.setStateChangeListener((messageId, status) => playback.updateLivePlayback(messageId, status))

  ctx.effect(() => () => playback.dispose(), 'xiaomi-mimo-tts: playback')
  ctx.effect(() => () => { void live.dispose() }, 'xiaomi-mimo-tts: live playback')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.textContent = `
      .xmimo-tts-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.xmimo-tts-action:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action:disabled{cursor:default;opacity:.45}.xmimo-tts-spin{animation:xmimo-spin 1s linear infinite}@keyframes xmimo-spin{to{transform:rotate(360deg)}}
      .xmimo-tts-inline-error{max-width:220px;color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px}
      .xmimo-tts-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-3,#fff);overflow:hidden;transition:border-color 160ms ease,background 160ms ease}.xmimo-tts-card:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-open{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-header{appearance:none;display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;border-radius:12px;color:inherit;text-align:left;background:transparent;font:inherit;cursor:pointer}.xmimo-tts-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}.xmimo-tts-card-head-text{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.xmimo-tts-card-title{font-size:15px;font-weight:600}.xmimo-tts-card-description{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:18px}.xmimo-tts-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform 160ms ease}.xmimo-tts-chevron-open{transform:rotate(180deg)}.xmimo-tts-pending{flex:none;border-radius:999px;padding:1px 8px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;font-weight:500;line-height:17px}.xmimo-tts-card-body{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding:0 0 16px}
      .xmimo-tts-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 14px;margin-top:16px;align-items:start}.xmimo-tts-grid label,.xmimo-tts-api-key,.xmimo-tts-model,.xmimo-tts-voice-design-prompt,.xmimo-tts-select-column>div{display:flex;min-width:0;flex-direction:column;gap:6px;font-size:13px}.xmimo-tts-grid input,.xmimo-tts-grid select,.xmimo-tts-grid textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,#f3f4f6);font:inherit}.xmimo-tts-grid select{color-scheme:light dark}.xmimo-tts-grid select option{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-1,#fff)}.xmimo-tts-grid select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:1px}.xmimo-tts-grid small{color:var(--dsw-alias-label-tertiary,#8b93a1);line-height:17px}.xmimo-tts-field-heading{display:flex;min-width:0;min-height:20px;flex-direction:row!important;align-items:center;justify-content:space-between;gap:8px}.xmimo-tts-field-label{display:inline-flex;min-width:0;align-items:center;gap:8px}.xmimo-tts-api-key-link{color:var(--dsw-alias-brand-primary,#4f6ef7);font-size:12px;text-decoration:none}.xmimo-tts-api-key-link:hover{text-decoration:underline}.xmimo-tts-field-badges{display:flex!important;flex:none;flex-direction:row!important;align-items:center;gap:8px}.xmimo-tts-overridden{border-radius:999px;padding:1px 7px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;line-height:17px}.xmimo-tts-reset{padding:0;border:0;color:var(--dsw-alias-label-secondary,#5f6875);background:transparent;font:inherit;font-size:12px;cursor:pointer}.xmimo-tts-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328)}.xmimo-tts-reset:disabled{cursor:not-allowed;opacity:.45}.xmimo-tts-api-key-hints{display:flex;min-width:0;gap:8px;align-items:center}.xmimo-tts-api-key-hints small{min-width:0;white-space:nowrap}.xmimo-tts-wide{grid-column:1/-1}.xmimo-tts-switch-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.xmimo-tts-checkbox-row{flex-direction:row!important;align-items:flex-start!important}.xmimo-tts-checkbox-row input{width:auto!important;flex:none;margin-top:3px}.xmimo-tts-checkbox-row span{display:flex;min-width:0;flex-direction:column;gap:4px}.xmimo-tts-select-column{display:flex;min-width:0;flex-direction:row;gap:16px}.xmimo-tts-select-column>div{flex:1}
      .xmimo-tts-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);font-size:12px;color:var(--dsw-alias-label-tertiary,#8b93a1)}.xmimo-tts-card-actions button{border:1px solid var(--dsw-alias-brand-primary,#4f6ef7);border-radius:8px;padding:5px 14px;color:var(--dsw-alias-bg-layer-1,#fff);background:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer;font:inherit}.xmimo-tts-card-actions button:hover:not(:disabled){filter:brightness(1.08)}.xmimo-tts-card-actions button:disabled{cursor:not-allowed;color:var(--dsw-alias-label-dimmed,#9ca3af);background:var(--dsw-alias-bg-layer-2,#f3f4f6);border-color:var(--dsw-alias-border-l2,#e5e7eb);opacity:1}.xmimo-tts-card-actions .xmimo-tts-discard{border-color:var(--dsw-alias-border-l2,#e5e7eb);color:var(--dsw-alias-label-secondary,#5f6875);background:transparent}.xmimo-tts-card-actions .xmimo-tts-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-failed{color:var(--dsw-alias-state-error-primary,#dc2626)}
      @media(max-width:720px){.xmimo-tts-grid{grid-template-columns:1fr}.xmimo-tts-wide{grid-column:auto}.xmimo-tts-switch-row{grid-template-columns:1fr}.xmimo-tts-select-column{grid-column:auto;flex-direction:column}.xmimo-tts-api-key-hints{flex-wrap:wrap}.xmimo-tts-api-key-hints small{white-space:normal}}
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, 'xiaomi-mimo-tts: styles')

  registerSlotContribution(ctx, 'conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'xiaomi-mimo-tts-autoplay-observer',
    order: 999,
    inject: () => ({ playback }),
  }, AutoPlayRunObserver))

  registerSlotContribution(ctx, 'conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'xiaomi-mimo-tts-live-observer',
    order: 998,
    inject: () => ({ live, settings: scope }),
  }, LiveSpeechObserver))

  registerSlotContribution(ctx, 'conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'xiaomi-mimo-tts',
    order: 20,
    locale: NS,
    inject: () => ({ playback, live, settings: scope, t }),
  }, ReadAloudAction))

  registerSlotContribution(ctx, 'settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: TTS_SETTINGS_NAMESPACE,
    locale: NS,
    inject: () => ({ scope, t }),
  }, SettingsCard))
}
