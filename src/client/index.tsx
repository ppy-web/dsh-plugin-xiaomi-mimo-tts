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
  TTS_SETTINGS_NAMESPACE,
  TTS_VOICES,
  resolveTtsSettings,
} from '../shared.js'
import type { TtsFormat, TtsSettings } from '../shared.js'

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
  'settings.autoPlay': '开启自动播报',
  'settings.autoPlayHint': '开启时会同步显示朗读按钮；浏览器也可能拒绝自动播放。',
  'settings.voice': '内置音色',
  'settings.format': '音频格式',
  'settings.instruction': '朗读风格指令',
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
  'settings.autoPlay': 'Enable automatic read-aloud',
  'settings.autoPlayHint': 'Enabling it also shows the read-aloud button; the browser may reject autoplay.',
  'settings.voice': 'Built-in voice',
  'settings.format': 'Audio format',
  'settings.instruction': 'Reading style instruction',
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

function registerSlotContribution(
  ctx: ClientContext,
  name: 'conversation.chat.assistant-actions' | 'settings.plugin.item',
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

function ReadAloudAction({ messageId, useSession, playback, settings, t }: ReadAloudActionProps): ReactElement | null {
  const message = useSession((snapshot) => ({
    text: messageText(snapshot, messageId),
    time: messageTime(snapshot, messageId),
  }))
  const text = message.text
  const settingsSnapshot = useSettingsSnapshot(settings)
  const view = useSyncExternalStore(playback.subscribe, playback.getSnapshot, playback.getSnapshot)
  const autoPlayed = useRef(false)

  useEffect(() => {
    if (autoPlayed.current || settingsSnapshot.value?.enabled !== true || settingsSnapshot.value?.autoPlay !== true || message.time === null || message.time < playback.autoPlayArmedAt) return
    autoPlayed.current = true
    const cancel = window.setTimeout(() => {
      if (playback.autoPlayArmed) void playback.toggle(messageId, text, true)
    }, 0)
    return () => window.clearTimeout(cancel)
  }, [message.time, messageId, playback, settingsSnapshot.value?.autoPlay, settingsSnapshot.value?.enabled, text])

  if (settingsSnapshot.value?.enabled !== true) return null

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

type EditableSettingField = 'enabled' | 'autoPlay' | 'voice' | 'format' | 'instruction'
type SettingField = EditableSettingField | 'apiKey'
type DraftChange = { kind: 'set' } | { kind: 'clear' }
type DraftChanges = Partial<Record<SettingField, DraftChange>>
type ResolvedSettings = ReturnType<typeof resolveTtsSettings>
type DraftSettings = Pick<ResolvedSettings, EditableSettingField>

const EDITABLE_SETTING_FIELDS: EditableSettingField[] = ['enabled', 'autoPlay', 'voice', 'format', 'instruction']

function layerSettings(value: unknown): TtsSettings | undefined {
  return isRecord(value) ? value as TtsSettings : undefined
}

function hasLayerField(value: unknown, field: string): boolean {
  return isRecord(value) && Object.hasOwn(value, field)
}

interface SettingFieldHeadingProps {
  label: string
  overriddenLabel: string
  resetLabel?: string
  overridden: boolean
  resettable: boolean
  disabled: boolean
  onReset?: () => void
}

function SettingFieldHeading({ label, overriddenLabel, resetLabel, overridden, resettable, disabled, onReset }: SettingFieldHeadingProps): ReactElement {
  return (
    <span className="xmimo-tts-field-heading">
      <span>{label}</span>
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
  const [voice, setVoice] = useState(initial.voice)
  const [format, setFormat] = useState<TtsFormat>(initial.format)
  const [instruction, setInstruction] = useState(initial.instruction)
  const [changes, setChanges] = useState<DraftChanges>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [open, setOpen] = useState(false)

  const accepted = resolveTtsSettings(value)
  const base = resolveTtsSettings(layerSettings(snapshot.base))
  const draft: DraftSettings = { enabled, autoPlay: enabled && autoPlay, voice, format, instruction }
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
    setVoice(next.voice)
    setFormat(next.format)
    setInstruction(next.instruction)
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
    if (field === 'voice') setVoice(base.voice)
    if (field === 'format') setFormat(base.format)
    if (field === 'instruction') setInstruction(base.instruction)
  }

  const discard = (): void => {
    const next = resolveTtsSettings(scope.getSnapshot().value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setVoice(next.voice)
    setFormat(next.format)
    setInstruction(next.instruction)
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
          <SettingFieldHeading label={t('settings.apiKey')} overriddenLabel={t('settings.apiKeyConfigured')} overridden={fieldOverridden('apiKey')} resettable={false} disabled={!snapshot.writable} />
          <input
            type="password"
            value={apiKey}
            autoComplete="off"
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
        <div className="xmimo-tts-instruction">
          <SettingFieldHeading label={t('settings.instruction')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('instruction')} resettable disabled={!snapshot.writable} onReset={() => { resetField('instruction') }} />
          <textarea value={instruction} rows={6} disabled={!snapshot.writable} onChange={(event) => { setInstruction(event.target.value); markChange('instruction') }} />
        </div>
        <div className="xmimo-tts-select-column">
          <div>
            <SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={false} resettable={false} disabled={!snapshot.writable} onReset={() => { resetField('voice') }} />
            <select value={voice} disabled={!snapshot.writable} onChange={(event) => { setVoice(event.target.value); markChange('voice') }}>
              {TTS_VOICES.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
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

  ctx.effect(() => () => playback.dispose(), 'xiaomi-mimo-tts: playback')

  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.plugin = NS
    style.textContent = `
      .xmimo-tts-action{width:28px;height:28px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:transparent;border:none;border-radius:28px;justify-content:center;align-items:center;padding:6px;display:inline-flex}.xmimo-tts-action:hover{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover,#f3f4f6);color:var(--dsw-alias-label-secondary,#5f6875)}.xmimo-tts-action:disabled{cursor:default;opacity:.45}.xmimo-tts-spin{animation:xmimo-spin 1s linear infinite}@keyframes xmimo-spin{to{transform:rotate(360deg)}}
      .xmimo-tts-inline-error{max-width:220px;color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px}
      .xmimo-tts-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-3,#fff);overflow:hidden;transition:border-color 160ms ease,background 160ms ease}.xmimo-tts-card:hover{border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-open{background:var(--dsw-alias-bg-layer-2,#f7f8fa);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-card-header{appearance:none;display:flex;width:100%;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border:0;border-radius:12px;color:inherit;text-align:left;background:transparent;font:inherit;cursor:pointer}.xmimo-tts-card-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:-2px}.xmimo-tts-card-head-text{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px}.xmimo-tts-card-title{font-size:15px;font-weight:600}.xmimo-tts-card-description{color:var(--dsw-alias-label-tertiary,#8b93a1);font-size:13px;line-height:18px}.xmimo-tts-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#8b93a1);transition:transform 160ms ease}.xmimo-tts-chevron-open{transform:rotate(180deg)}.xmimo-tts-pending{flex:none;border-radius:999px;padding:1px 8px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;font-weight:500;line-height:17px}.xmimo-tts-card-body{border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);margin:0 16px;padding:0 0 16px}
      .xmimo-tts-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px 14px;margin-top:16px;align-items:start}.xmimo-tts-grid label,.xmimo-tts-api-key,.xmimo-tts-instruction,.xmimo-tts-select-column>div{display:flex;min-width:0;flex-direction:column;gap:6px;font-size:13px}.xmimo-tts-grid input,.xmimo-tts-grid select,.xmimo-tts-grid textarea{box-sizing:border-box;width:100%;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:8px;padding:8px 10px;color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-2,#f3f4f6);font:inherit}.xmimo-tts-grid select{color-scheme:light dark}.xmimo-tts-grid select option{color:var(--dsw-alias-label-primary,#1f2328);background:var(--dsw-alias-bg-layer-1,#fff)}.xmimo-tts-grid select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4f6ef7);outline-offset:1px}.xmimo-tts-grid small{color:var(--dsw-alias-label-tertiary,#8b93a1);line-height:17px}.xmimo-tts-field-heading{display:flex;min-width:0;min-height:20px;flex-direction:row!important;align-items:center;justify-content:space-between;gap:8px}.xmimo-tts-field-badges{display:flex!important;flex:none;flex-direction:row!important;align-items:center;gap:8px}.xmimo-tts-overridden{border-radius:999px;padding:1px 7px;color:var(--dsw-alias-label-secondary,#5f6875);background:var(--dsw-alias-bg-module-platform,#eef0f3);font-size:11px;line-height:17px}.xmimo-tts-reset{padding:0;border:0;color:var(--dsw-alias-label-secondary,#5f6875);background:transparent;font:inherit;font-size:12px;cursor:pointer}.xmimo-tts-reset:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328)}.xmimo-tts-reset:disabled{cursor:not-allowed;opacity:.45}.xmimo-tts-api-key-hints{display:flex;min-width:0;gap:8px;align-items:center}.xmimo-tts-api-key-hints small{min-width:0;white-space:nowrap}.xmimo-tts-wide{grid-column:1/-1}.xmimo-tts-switch-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px}.xmimo-tts-checkbox-row{flex-direction:row!important;align-items:flex-start!important}.xmimo-tts-checkbox-row input{width:auto!important;flex:none;margin-top:3px}.xmimo-tts-checkbox-row span{display:flex;min-width:0;flex-direction:column;gap:4px}.xmimo-tts-select-column{display:flex;min-width:0;flex-direction:column;gap:16px}
      .xmimo-tts-card-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#e5e7eb);font-size:12px;color:var(--dsw-alias-label-tertiary,#8b93a1)}.xmimo-tts-card-actions button{border:1px solid var(--dsw-alias-brand-primary,#4f6ef7);border-radius:8px;padding:5px 14px;color:var(--dsw-alias-bg-layer-1,#fff);background:var(--dsw-alias-brand-primary,#4f6ef7);cursor:pointer;font:inherit}.xmimo-tts-card-actions button:hover:not(:disabled){filter:brightness(1.08)}.xmimo-tts-card-actions button:disabled{cursor:not-allowed;color:var(--dsw-alias-label-dimmed,#9ca3af);background:var(--dsw-alias-bg-layer-2,#f3f4f6);border-color:var(--dsw-alias-border-l2,#e5e7eb);opacity:1}.xmimo-tts-card-actions .xmimo-tts-discard{border-color:var(--dsw-alias-border-l2,#e5e7eb);color:var(--dsw-alias-label-secondary,#5f6875);background:transparent}.xmimo-tts-card-actions .xmimo-tts-discard:hover:not(:disabled){color:var(--dsw-alias-label-primary,#1f2328);border-color:var(--dsw-alias-label-dimmed,#c8ccd4)}.xmimo-tts-failed{color:var(--dsw-alias-state-error-primary,#dc2626)}
      @media(max-width:720px){.xmimo-tts-grid{grid-template-columns:1fr}.xmimo-tts-wide{grid-column:auto}.xmimo-tts-switch-row{grid-template-columns:1fr}.xmimo-tts-instruction,.xmimo-tts-select-column{grid-column:auto}.xmimo-tts-api-key-hints{flex-wrap:wrap}.xmimo-tts-api-key-hints small{white-space:normal}}
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, 'xiaomi-mimo-tts: styles')

  registerSlotContribution(ctx, 'conversation.chat.assistant-actions', () => ctx.slots.register({
    name: 'conversation.chat.assistant-actions',
    id: 'xiaomi-mimo-tts',
    order: 20,
    locale: NS,
    inject: () => ({ playback, settings: scope, t }),
  }, ReadAloudAction))

  registerSlotContribution(ctx, 'settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: TTS_SETTINGS_NAMESPACE,
    locale: NS,
    inject: () => ({ scope, t }),
  }, SettingsCard))
}
