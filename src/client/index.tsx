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

export const inject = [
  'slots',
  'locale',
  'connection',
  'remote',
  'settingsScope',
]

const NS = 'xiaomi-mimo-tts'
const SETTINGS_NAMESPACE = 'xiaomi-mimo-tts'
const TTS_ROUTE = '/plugins/xiaomi-mimo-tts/synthesize'

interface TtsSettings {
  apiKey?: string
  baseURL?: string
  model?: string
  voice?: string
  format?: 'mp3' | 'wav'
  autoPlay?: boolean
  instruction?: string
  maxTextLength?: number
  requestTimeoutMs?: number
}

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
  'settings.title': 'Xiaomi MiMo 语音朗读',
  'settings.description': '在助手回复操作栏中使用 Xiaomi MiMo TTS 生成并播放语音。',
  'settings.apiKey': 'API Key',
  'settings.apiKeyHint': '密钥保存在 DSH 设置文件中，传到浏览器前会被脱敏。',
  'settings.apiKeyStatus': '只有输入新值并保存时才会替换现有密钥。',
  'settings.autoPlay': '自动播报新回复',
  'settings.autoPlayHint': '浏览器可能因为自动播放策略而拒绝；拒绝后可手动点击朗读。',
  'settings.voice': '内置音色',
  'settings.format': '音频格式',
  'settings.instruction': '朗读风格指令',
  'settings.save': '保存',
  'settings.saving': '保存中…',
  'settings.saved': '已保存',
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
  'settings.title': 'Xiaomi MiMo text to speech',
  'settings.description': 'Generate and play Xiaomi MiMo TTS audio from assistant message actions.',
  'settings.apiKey': 'API Key',
  'settings.apiKeyHint': 'Stored in DSH settings and redacted before settings are sent to the browser.',
  'settings.apiKeyStatus': 'An existing key changes only when you save a new value.',
  'settings.autoPlay': 'Automatically read new responses',
  'settings.autoPlayHint': 'The browser may reject autoplay; use the message action if it does.',
  'settings.voice': 'Built-in voice',
  'settings.format': 'Audio format',
  'settings.instruction': 'Reading style instruction',
  'settings.save': 'Save',
  'settings.saving': 'Saving…',
  'settings.saved': 'Saved',
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
  if (typeof value.apiKey === 'string') decoded.apiKey = value.apiKey
  if (typeof value.baseURL === 'string') decoded.baseURL = value.baseURL
  if (typeof value.model === 'string') decoded.model = value.model
  if (typeof value.voice === 'string') decoded.voice = value.voice
  if (value.format === 'mp3' || value.format === 'wav') decoded.format = value.format
  if (typeof value.autoPlay === 'boolean') decoded.autoPlay = value.autoPlay
  if (typeof value.instruction === 'string') decoded.instruction = value.instruction
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

function safeSlotInject(
  ctx: ClientContext,
  name: 'conversation.chat.assistant-actions' | 'settings.plugin.item',
  register: () => (() => void) | Iterable<() => void>,
): void {
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
}

function messageText(snapshot: ConversationSnapshot, messageId: string): string {
  for (const node of snapshot.nodes) {
    if (node.kind !== 'assistant' || node.messageId !== messageId) continue
    const markdown = node.blocks
      .filter((block) => block.kind === 'text')
      .map((block) => block.text)
      .join('\n\n')
    return extractMarkdownPlainText(markdown).trim()
  }
  return ''
}

function messageTime(snapshot: ConversationSnapshot, messageId: string): number | null {
  for (const node of snapshot.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return node.time
  }
  return null
}

class PlaybackController {
  readonly autoPlayArmedAt = Date.now()
  private view: PlaybackView = { messageId: null, status: 'idle', error: null }
  private readonly listeners = new Set<() => void>()
  private current: SynthesizedAudio | null = null
  private request: AbortController | null = null
  private generation = 0

  get autoPlayArmed(): boolean {
    return Date.now() - this.autoPlayArmedAt < 30000
  }

  getSnapshot = (): PlaybackView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
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
        } catch {}
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

interface ReadAloudActionProps {
  messageId: string
  useSession: <T>(selector: (snapshot: ConversationSnapshot) => T) => T
  playback: PlaybackController
  settings: SettingsScope<TtsSettings>
  t: Translate
}

function ReadAloudAction({ messageId, useSession, playback, settings, t }: ReadAloudActionProps): ReactElement {
  const message = useSession((snapshot) => ({
    text: messageText(snapshot, messageId),
    time: messageTime(snapshot, messageId),
  }))
  const text = message.text
  const settingsSnapshot = useSettingsSnapshot(settings)
  const view = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)
  const autoPlayed = useRef(false)

  useEffect(() => {
    if (autoPlayed.current || settingsSnapshot.value?.autoPlay !== true || message.time === null || message.time < playback.autoPlayArmedAt) return
    autoPlayed.current = true
    const cancel = window.setTimeout(() => {
      if (playback.autoPlayArmed) void playback.toggle(messageId, text, true)
    }, 0)
    return () => window.clearTimeout(cancel)
  }, [message.time, messageId, playback, settingsSnapshot.value?.autoPlay, text])
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
          onClick={() => { void playback.toggle(messageId, text, false) }}
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

function SettingsCard({ scope, t }: SettingsCardProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const value = snapshot.value
  const [apiKey, setApiKey] = useState('')
  const [autoPlay, setAutoPlay] = useState(value?.autoPlay ?? false)
  const [voice, setVoice] = useState(value?.voice ?? '冰糖')
  const [format, setFormat] = useState<'mp3' | 'wav'>(value?.format ?? 'mp3')
  const [instruction, setInstruction] = useState(value?.instruction ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (value === undefined) return
    setAutoPlay(value.autoPlay ?? false)
    setVoice(value.voice ?? '冰糖')
    setFormat(value.format ?? 'mp3')
    setInstruction(value.instruction ?? '')
  }, [value])

  if (snapshot.status === 'unavailable') return null

  const save = async (): Promise<void> => {
    setState('saving')
    try {
      await scope.set('autoPlay', autoPlay)
      await scope.set('voice', voice)
      await scope.set('format', format)
      await scope.set('instruction', instruction)
      if (apiKey.trim().length > 0) await scope.set('apiKey', apiKey.trim())
      setApiKey('')
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
        <IconChevronDownOutline14 className={open ? 'xmimo-tts-chevron xmimo-tts-chevron-open' : 'xmimo-tts-chevron'} />
      </button>
      {open ? <div className="xmimo-tts-card-body">
        <div className="xmimo-tts-grid">
        <label>
          <span>{t('settings.apiKey')}</span>
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
            placeholder={t('settings.secretPlaceholder')}
            disabled={!snapshot.writable}
            onChange={(event) => { setApiKey(event.target.value); setState('idle') }}
          />
          <small>{t('settings.apiKeyStatus')}</small>
          <small>{t('settings.apiKeyHint')}</small>
        </label>
        <label className="xmimo-tts-checkbox-row">
          <input
            type="checkbox"
            checked={autoPlay}
            disabled={!snapshot.writable}
            onChange={(event) => { setAutoPlay(event.target.checked); setState('idle') }}
          />
          <span>
            <strong>{t('settings.autoPlay')}</strong>
            <small>{t('settings.autoPlayHint')}</small>
          </span>
        </label>
        <label>
          <span>{t('settings.voice')}</span>
          <select value={voice} disabled={!snapshot.writable} onChange={(event) => { setVoice(event.target.value); setState('idle') }}>
            {['冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'].map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>{t('settings.format')}</span>
          <select value={format} disabled={!snapshot.writable} onChange={(event) => { setFormat(event.target.value as 'mp3' | 'wav'); setState('idle') }}>
            <option value="mp3">MP3</option>
            <option value="wav">WAV</option>
          </select>
        </label>
        <label className="xmimo-tts-wide">
          <span>{t('settings.instruction')}</span>
          <textarea value={instruction} rows={3} disabled={!snapshot.writable} onChange={(event) => { setInstruction(event.target.value); setState('idle') }} />
        </label>
        </div>
        <div className="xmimo-tts-card-actions">
          {!snapshot.writable ? <span>{t('settings.readOnly')}</span> : null}
          {state === 'saved' ? <span>{t('settings.saved')}</span> : null}
          {state === 'failed' ? <span className="xmimo-tts-failed">{t('settings.failed')}</span> : null}
          <button type="button" disabled={!snapshot.writable || state === 'saving'} onClick={() => { void save() }}>
            {state === 'saving' ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div> : null}
    </li>
  )
}

export function apply(ctx: ClientContext): void {
  const locale = ctx.locale as unknown as {
    bind(namespace: string): Translate
    register(namespace: string, dictionaries: { zh: typeof zh; en: typeof en }): () => void
  }
  const t = locale.bind(NS)
  ctx.effect(() => locale.register(NS, { zh, en }), 'xiaomi-mimo-tts: dictionaries')

  const scope = ctx.settingsScope.bind<TtsSettings>({
    namespace: SETTINGS_NAMESPACE,
    decode: decodeSettings,
  })
  const playback = new PlaybackController()

  ctx.effect(() => () => playback.dispose(), 'xiaomi-mimo-tts: playback')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.textContent = `
      .xmimo-tts-action{display:inline-flex;flex:0 0 28px;align-items:center;justify-content:center;width:28px;height:28px;box-sizing:border-box;padding:0;border:0;border-radius:6px;color:var(--dsw-alias-label-tertiary);background:transparent;cursor:pointer}
      .xmimo-tts-action:hover,.xmimo-tts-action[aria-pressed=true]{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-fill-l2)}
      .xmimo-tts-action:disabled{cursor:wait;opacity:.65}.xmimo-tts-spin{animation:xmimo-spin 1s linear infinite}@keyframes xmimo-spin{to{transform:rotate(360deg)}}
      .xmimo-tts-inline-error{max-width:220px;color:var(--dsw-alias-state-danger-primary);font-size:12px}
      .xmimo-tts-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-l1);overflow:hidden}.xmimo-tts-card-header{display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;color:inherit;text-align:left;background:transparent;font:inherit;cursor:pointer}.xmimo-tts-card-header:hover{background:var(--dsw-alias-interactive-bg-hover)}.xmimo-tts-card-head-text{display:flex;min-width:0;flex-direction:column;gap:4px}.xmimo-tts-card-title{font-size:15px;font-weight:600}.xmimo-tts-card-description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:18px}.xmimo-tts-chevron{flex:none;color:var(--dsw-alias-label-tertiary);transition:transform 160ms ease}.xmimo-tts-chevron-open{transform:rotate(180deg)}.xmimo-tts-card-body{padding:0 16px 16px}
      .xmimo-tts-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}.xmimo-tts-grid label{display:flex;min-width:0;flex-direction:column;gap:6px;font-size:13px}.xmimo-tts-grid input,.xmimo-tts-grid select,.xmimo-tts-grid textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-l2);font:inherit}.xmimo-tts-grid small{color:var(--dsw-alias-label-tertiary)}
      .xmimo-tts-wide{grid-column:1/-1}.xmimo-tts-checkbox-row{flex-direction:row!important;align-items:flex-start!important}.xmimo-tts-checkbox-row input{width:auto!important;margin-top:3px}.xmimo-tts-checkbox-row span{display:flex;flex-direction:column;gap:4px}
      .xmimo-tts-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:16px;font-size:12px;color:var(--dsw-alias-label-tertiary)}.xmimo-tts-card-actions button{border:0;border-radius:8px;padding:8px 14px;color:var(--dsw-alias-label-on-color);background:var(--dsw-alias-state-business-primary);cursor:pointer}.xmimo-tts-card-actions button:disabled{cursor:not-allowed;opacity:.55}.xmimo-tts-failed{color:var(--dsw-alias-state-danger-primary)}
      @media(max-width:720px){.xmimo-tts-grid{grid-template-columns:1fr}.xmimo-tts-wide{grid-column:auto}}
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, 'xiaomi-mimo-tts: styles')

  safeSlotInject(ctx, 'conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'xiaomi-mimo-tts',
    order: 20,
    locale: NS,
    inject: () => ({ playback, settings: scope, t }),
  }, ReadAloudAction))

  safeSlotInject(ctx, 'settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: SETTINGS_NAMESPACE,
    locale: NS,
    inject: () => ({ scope, t }),
  }, SettingsCard))
}
