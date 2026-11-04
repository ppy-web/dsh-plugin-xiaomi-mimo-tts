/**
 * DSH Go native half.
 *
 * The DSH Go app never runs this package's Web client: it draws plugin UI from
 * JSON views and calls back into this module through the `dshGo` service. This
 * file therefore carries the parts that must work without the Web page:
 *
 * - `message.actions` "朗读": read a reply with the Host TTS engine, stop when
 *   the person starts talking (the app owns that), and follow the sound with a
 *   floating caption.
 * - `panels` "settings": enter the provider API key and the few settings that
 *   matter on a phone, because the app's generic config form cannot write
 *   `role('secret')` fields.
 * - `composer.strip`: one line that says whether reading is ready.
 *
 * Protocol notes (dsh-go docs/plugins): `ctx.inject(['dshGo'])` is only entered
 * on hosts with the bridge; `on` must answer within 3 s, so the slow synthesis
 * lives in `media` (30 s budget).
 */
import type { Context } from '@deepseek-ai/cordis'
import { randomBytes } from 'node:crypto'
import type { SettingsPathOp } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-settings'
import { TTS_SETTINGS_NAMESPACE } from './constants.js'
import { prepareTtsText } from './text/normalize.js'
import { splitTtsSegments } from './text/segment.js'
import { applyTtsReadScope, resolveTtsReadScope } from './text/scope.js'
import { TTS_READ_SCOPES, isSupportedTtsApiKey } from './types/index.js'
import type { TtsProvider, TtsReadScope } from './types/index.js'
import type { ResolvedTtsSettings } from './shared.js'

/** Cordis plugin identifier for the native row. */
export const name = 'xiaomi-mimo-tts-dsh-go'

/** The bridge enforces this on caption text; keep our own frames inside it. */
const MAX_CAPTION_CHARACTERS = 240
/** Request WAV when it stays comfortably below the 16 MiB media cap. */
const WAV_CHARACTER_LIMIT = 1800

const PROVIDERS: readonly TtsProvider[] = ['xiaomi', 'doubao', 'breeze']

const PROVIDER_LABELS: Record<TtsProvider, string> = {
  xiaomi: '小米 MiMo',
  doubao: '豆包 Seed',
  breeze: 'Breeze Blue',
}

const PROVIDER_FIELDS: Record<TtsProvider, { voice: keyof ResolvedTtsSettings; key: keyof ResolvedTtsSettings; enabled?: keyof ResolvedTtsSettings }> = {
  xiaomi: { voice: 'voice', key: 'apiKey' },
  doubao: { voice: 'doubaoVoice', key: 'doubaoApiKey', enabled: 'doubaoEnabled' },
  breeze: { voice: 'breezeVoice', key: 'breezeApiKey', enabled: 'breezeEnabled' },
}

const DEFAULT_PROVIDER_VOICE: Record<TtsProvider, string> = {
  xiaomi: '冰糖',
  doubao: 'zh_female_vv_uranus_bigtts',
  breeze: 'voc_rh6e8hdbraz6',
}

/** View caps handed to view/data functions by the bridge. */
interface ViewCaps {
  protocol?: number
  app?: string
  locale?: string
  surfaces?: readonly string[]
  components?: readonly string[]
}

interface ActionEvent {
  surface?: string
  id?: string
  action?: string
  value?: unknown
  locale?: string
}

interface InvokeScope {
  sessionId?: string
  turnId?: string
  messageId?: string
  callId?: string
  message?: unknown
  draft?: string
  clipboard?: string
}

type Effect = Record<string, unknown>
type Emit = (value: unknown) => void

/** The subset of the bridge service this plugin uses. */
interface DshGoService {
  on(id: string, handler: (scope: InvokeScope, event: ActionEvent) => unknown): void
  media(id: string, handler: (scope: InvokeScope, options: { key?: string; signal?: AbortSignal }) => unknown): void
  micro(id: string, spec: { data: (scope: InvokeScope, emit: Emit) => (() => void) | void }): void
  panel(id: string, definition: {
    view: (scope: InvokeScope, caps?: ViewCaps) => unknown
    data?: (scope: InvokeScope, emit: Emit, caps?: ViewCaps) => (() => void) | void
    actions?: Record<string, (scope: InvokeScope, event: ActionEvent) => unknown>
  }): void
  strip(id: string, data: (scope: InvokeScope, emit: Emit, caps?: ViewCaps) => (() => void) | void): void
  onCapability(handler: (scope: InvokeScope, event: { event: string; reason?: string }) => void): void
  refresh(id?: string): void
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    dshGo: DshGoService
  }
}

interface Clause {
  text: string
  length: number
}

interface Reading {
  key: string
  text: string
  clauses: Clause[]
  characters: number
  estimatedMs: number
  durationMs?: number
  startedAt?: number
  done: boolean
  timer: ReturnType<typeof setInterval> | undefined
}

/** A tap on 朗读 fills this; `media` fills the duration and starts the caption. */
function createReadings(now: () => number = Date.now) {
  const readings = new Map<string, Reading>()
  const viewers = new Map<string, Set<Emit>>()

  const keyOf = (scope: InvokeScope) => scope.sessionId ?? '-'

  function stopTicker(reading: Reading | undefined): void {
    if (reading?.timer) clearInterval(reading.timer)
    if (reading) reading.timer = undefined
  }

  function captionAt(reading: Reading, elapsed: number): { text: string; progress: number } | undefined {
    if (reading.clauses.length === 0) return undefined
    const total = reading.durationMs ?? reading.estimatedMs
    if (!Number.isFinite(total) || total <= 0) return undefined
    const progress = Math.min(1, Math.max(0, elapsed / total))
    let consumed = 0
    for (const clause of reading.clauses) {
      const share = clause.length / Math.max(1, reading.characters)
      if (progress < consumed + share || clause === reading.clauses.at(-1)) {
        const within = Math.min(1, Math.max(0, (progress - consumed) / share))
        const characters = [...clause.text]
        const shown = Math.max(1, Math.min(characters.length, Math.ceil(characters.length * within)))
        return { text: characters.slice(0, Math.min(MAX_CAPTION_CHARACTERS, shown)).join(''), progress: Math.round(progress * 100) / 100 }
      }
      consumed += share
    }
    return undefined
  }

  function tick(key: string): void {
    const reading = readings.get(key)
    const emits = viewers.get(key)
    if (!reading || reading.startedAt === undefined || reading.done || !emits?.size) {
      stopTicker(reading)
      return
    }
    const elapsed = Math.max(0, now() - reading.startedAt)
    const value = captionAt(reading, elapsed)
    if (value) for (const emit of emits) emit(value)
    if (elapsed >= (reading.durationMs ?? reading.estimatedMs)) stopTicker(reading)
  }

  function start(key: string): void {
    const reading = readings.get(key)
    if (!reading || reading.timer || reading.done || reading.startedAt === undefined || !viewers.get(key)?.size) return
    reading.timer = setInterval(() => tick(key), 100)
    reading.timer.unref?.()
    tick(key)
  }

  return {
    /** Record what will be read for this conversation; returns the media key. */
    begin(scope: InvokeScope, text: string): string {
      const key = scope.sessionId ?? '-'
      const previous = readings.get(key)
      stopTicker(previous)
      const clauses = splitTtsSegments(text)
        .map(clause => clause.trim())
        .filter(clause => clause.length > 0)
        .map(clause => ({ text: clause, length: [...clause].length }))
      const characters = clauses.reduce((sum, clause) => sum + clause.length, 0)
      const reading: Reading = {
        key: randomBytes(9).toString('base64url'),
        text,
        clauses,
        characters,
        estimatedMs: Math.max(600, Math.round(characters * 190)),
        done: false,
        timer: undefined,
      }
      readings.set(key, reading)
      return reading.key
    },

    /** Mark the moment the app starts playing, and (when known) the real length. */
    startPlaying(scope: InvokeScope, key: string | undefined, durationMs: number | undefined): void {
      const reading = readings.get(keyOf(scope))
      if (!reading || reading.key !== key) return
      reading.durationMs = durationMs ?? reading.estimatedMs
      reading.startedAt = now() + 150
      start(keyOf(scope))
    },

    /** Sound ended, was stopped, or the person spoke: the caption stops too. */
    end(scope: InvokeScope): void {
      const reading = readings.get(keyOf(scope))
      if (!reading) return
      reading.done = true
      stopTicker(reading)
    },

    /** The app's caption subscription. */
    watch(scope: InvokeScope, emit: Emit): () => void {
      const key = keyOf(scope)
      if (!viewers.has(key)) viewers.set(key, new Set())
      viewers.get(key)!.add(emit)
      start(key)
      return () => {
        const emits = viewers.get(key)
        emits?.delete(emit)
        if (!emits?.size) {
          viewers.delete(key)
          stopTicker(readings.get(key))
        }
      }
    },

    /** Test seam. */
    get(scope: InvokeScope): Reading | undefined {
      return readings.get(keyOf(scope))
    },
  }
}

function isZh(caps: ViewCaps | undefined): boolean {
  return (caps?.locale ?? '').toLowerCase().startsWith('zh')
}

/** v2 form components are negotiated; older apps get a read-only fallback view. */
function supportsInputs(caps: ViewCaps | undefined): boolean {
  const components = caps?.components
  return Array.isArray(components) && components.includes('form') && components.includes('textField')
}

function providerLabel(provider: TtsProvider): string {
  return PROVIDER_LABELS[provider] ?? provider
}

function apiKeyOf(settings: ResolvedTtsSettings): string {
  const field = PROVIDER_FIELDS[settings.provider].key
  const value = settings[field]
  return typeof value === 'string' ? value.trim() : ''
}

function voiceOf(settings: ResolvedTtsSettings): string {
  const field = PROVIDER_FIELDS[settings.provider].voice
  const value = settings[field]
  return typeof value === 'string' ? value : ''
}

/** Turn a Markdown reply into the text this plugin is willing to speak. */
export function spokenText(markdown: unknown, settings: ResolvedTtsSettings): string {
  if (typeof markdown !== 'string' || markdown.trim().length === 0) return ''
  const prepared = prepareTtsText(markdown)
  if (!prepared) return ''
  const scoped = applyTtsReadScope(prepared, resolveTtsReadScope(settings.readScope, false))
  const characters = [...scoped]
  const limit = Number.isFinite(settings.maxTextLength) && settings.maxTextLength > 0
    ? Math.floor(settings.maxTextLength)
    : characters.length
  if (characters.length <= limit) return scoped
  const cut = characters.slice(0, Math.max(1, limit)).join('')
  const boundary = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('！'), cut.lastIndexOf('？'), cut.lastIndexOf('.'))
  const head = boundary > limit * 0.6 ? cut.slice(0, boundary + 1) : cut
  return `${head}。后面还有内容，请查看文字回复。`
}

export function apply(ctx: Context): void {
  ctx.inject(['dshGo', 'speechSynthesis', 'xiaomiTtsSettings', 'settings'], (ctx) => {
    const dshGo = ctx.dshGo
    const readings = createReadings()
    const current = () => ctx.xiaomiTtsSettings.current()

    dshGo.on('read', (scope) => {
      const settings = current()
      if (!settings.enabled) return { toast: '朗读已关闭，先到「朗读设置」里打开。' }
      const text = spokenText(scope.message, settings)
      if (!text) return { toast: '这条回复没有可朗读的文字' }
      const key = readings.begin(scope, text)
      return [
        { type: 'audio', op: 'play', instance: 'reading', src: 'media:speech', key },
        { type: 'voice', op: 'start', instance: 'reading' },
        { type: 'overlay', op: 'show', instance: 'reading', id: 'subtitle' },
      ] satisfies Effect[]
    })

    dshGo.media('speech', async (scope, { key, signal }) => {
      const reading = readings.get(scope)
      if (!reading || reading.key !== key) throw new Error('no such reading')
      const settings = current()
      if (!apiKeyOf(settings)) throw new Error('还没有配置 API Key，先长按打开「朗读设置」填一个。')
      const format = [...reading.text].length <= WAV_CHARACTER_LIMIT ? 'wav' : 'mp3'
      let audio
      try {
        audio = await ctx.speechSynthesis.synthesize({ text: reading.text, format, ...(signal ? { signal } : {}) })
      } catch (error) {
        signal?.throwIfAborted()
        if (format !== 'wav') throw error
        audio = await ctx.speechSynthesis.synthesize({ text: reading.text, format: 'mp3', ...(signal ? { signal } : {}) })
      }
      readings.startPlaying(scope, key, audio.durationMs)
      return { body: audio.data, contentType: audio.contentType }
    })

    dshGo.micro('caption', { data: (scope, emit) => readings.watch(scope, emit) })

    dshGo.onCapability((scope, event) => {
      if (event.event === 'voice.speechStart' || event.event.startsWith('audio.')) readings.end(scope)
    })

    dshGo.strip('status', (_scope, emit, caps) => {
      const zh = isZh(caps)
      const push = () => {
        const settings = current()
        const ready = apiKeyOf(settings).length > 0
        emit({
          text: `${providerLabel(settings.provider)} · ${ready ? (zh ? '朗读就绪' : 'ready') : (zh ? '待填密钥' : 'needs key')}`,
          icon: 'speaker',
          tone: ready ? 'good' : 'warn',
        })
      }
      push()
      return ctx.xiaomiTtsSettings.updates(push)
    })

    dshGo.panel('settings', {
      view: (_scope, caps) => settingsView(isZh(caps), supportsInputs(caps)),
      data: (_scope, emit, caps) => {
        const zh = isZh(caps)
        const push = () => emit(settingsData(zh))
        push()
        return ctx.xiaomiTtsSettings.updates(push)
      },
      actions: {
        save: async (_scope, event) => saveSettings(event),
      },
    })

    function settingsData(zh: boolean) {
      const settings = current()
      const key = apiKeyOf(settings)
      const summary = key
        ? (zh
            ? `已就绪：${providerLabel(settings.provider)} · ${voiceOf(settings) || '默认音色'}`
            : `Ready: ${providerLabel(settings.provider)} · ${voiceOf(settings) || 'default voice'}`)
        : (zh
            ? '还没有 API Key。填好下面这一项并保存，长按回复就能朗读。'
            : 'No API key yet. Fill in the field below and save, then long-press a reply to read it aloud.')
      return {
        form: {
          enabled: settings.enabled,
          provider: settings.provider,
          voice: voiceOf(settings),
          apiKey: '',
          volume: settings.voiceVolume,
          rate: settings.voiceRate,
          readScope: settings.readScope,
        },
        status: {
          ready: key.length > 0,
          summary,
          provider: providerLabel(settings.provider),
        },
      }
    }

    async function saveSettings(event: ActionEvent): Promise<unknown> {
      const values = (event.value as { values?: Record<string, unknown> } | undefined)?.values ?? {}
      const read = (field: string) => values[`data.form.${field}`]
      const ops: SettingsPathOp[] = []
      const providerValue = read('provider')
      const settings = current()
      const provider: TtsProvider = typeof providerValue === 'string' && (PROVIDERS as readonly string[]).includes(providerValue)
        ? providerValue as TtsProvider
        : settings.provider
      const fields = PROVIDER_FIELDS[provider]

      const enabled = read('enabled')
      if (typeof enabled === 'boolean') ops.push({ op: 'set', path: ['enabled'], value: enabled })
      if (provider !== settings.provider) {
        ops.push({ op: 'set', path: ['provider'], value: provider })
        if (fields.enabled) ops.push({ op: 'set', path: [fields.enabled], value: true })
      }

      const voice = read('voice')
      const currentVoice = settings[fields.voice]
      const targetVoice = typeof currentVoice === 'string' ? currentVoice : ''
      if (voice !== undefined && typeof voice !== 'string') return { toast: '音色格式不对' }
      if (typeof voice === 'string' && voice.length > 200) return { toast: '音色不能超过 200 字' }
      let nextVoice = typeof voice === 'string' ? voice.trim() : ''
      if (!nextVoice && provider !== settings.provider) nextVoice = targetVoice || DEFAULT_PROVIDER_VOICE[provider]
      if (nextVoice && nextVoice !== targetVoice) ops.push({ op: 'set', path: [fields.voice], value: nextVoice })

      const apiKey = read('apiKey')
      if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
        const trimmed = apiKey.trim()
        if (/[\r\n]/u.test(trimmed) || trimmed.length > 512) return { toast: 'API Key 格式不对' }
        if (!isSupportedTtsApiKey(trimmed, provider)) return { toast: 'API Key 看起来不对，检查一下再保存' }
        ops.push({ op: 'set', path: [fields.key], value: trimmed })
      }

      const volume = read('volume')
      if (typeof volume === 'number' && Number.isFinite(volume)) {
        ops.push({ op: 'set', path: ['voiceVolume'], value: Math.min(1, Math.max(0, volume)) })
      }
      const rate = read('rate')
      if (typeof rate === 'number' && Number.isFinite(rate)) {
        ops.push({ op: 'set', path: ['voiceRate'], value: Math.min(2, Math.max(0.5, rate)) })
      }
      const readScope = read('readScope')
      if (typeof readScope === 'string' && (TTS_READ_SCOPES as readonly string[]).includes(readScope)) {
        ops.push({ op: 'set', path: ['readScope'], value: readScope as TtsReadScope })
      }

      if (ops.length === 0) return { toast: '没有改动' }
      try {
        await ctx.settings.mutate(TTS_SETTINGS_NAMESPACE, ops)
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : '未知错误'
        return { toast: `保存失败：${message.slice(0, 60)}` }
      }
      dshGo.refresh('settings')
      return { toast: '已保存' }
    }

    function settingsView(zh: boolean, inputs: boolean) {
      const text = (zhText: string, enText: string) => zh ? zhText : enText
      if (!inputs) {
        return {
          type: 'stack',
          children: [{
            type: 'callout',
            tone: 'warn',
            text: text(
              '当前 App 版本不支持原生设置表单。请在网页版设置里填写 API Key，再回来长按回复朗读。',
              'This App version cannot show the native settings form. Set the API key in the Web settings, then come back and long-press a reply.',
            ),
          }],
        }
      }
      return {
        v: 2,
        type: 'stack',
        title: text('朗读设置', 'Read aloud'),
        children: [
          { type: 'callout', tone: 'info', text: { $: 'data.status.summary' } },
          {
            type: 'form',
            submit: 'save',
            submitLabel: text('保存', 'Save'),
            children: [
              { type: 'toggle', label: text('启用朗读', 'Enable read aloud'), bind: 'data.form.enabled' },
              {
                type: 'segmented',
                label: text('提供方', 'Provider'),
                bind: 'data.form.provider',
                options: [
                  { label: '小米 MiMo', value: 'xiaomi' },
                  { label: '豆包 Seed', value: 'doubao' },
                  { label: 'Breeze', value: 'breeze' },
                ],
              },
              {
                type: 'textField',
                label: text('音色', 'Voice'),
                bind: 'data.form.voice',
                placeholder: text('冰糖 / Mia / voc_… / zh_female_…', 'Bing Tang / Mia / voc_… / zh_female_…'),
                maxLength: 200,
              },
              {
                type: 'textField',
                label: 'API Key',
                bind: 'data.form.apiKey',
                placeholder: text('sk-… / tp-… / 服务商密钥', 'sk-… / tp-… / provider key'),
                maxLength: 512,
              },
              {
                type: 'select',
                label: text('朗读范围', 'Read range'),
                bind: 'data.form.readScope',
                options: [
                  { label: text('智能（长回复读首段）', 'Smart (first part)'), value: 'smart' },
                  { label: text('全文', 'Full text'), value: 'full' },
                  { label: text('只读首段', 'First part only'), value: 'first-segment' },
                ],
              },
              { type: 'slider', label: text('音量', 'Volume'), bind: 'data.form.volume', min: 0, max: 1, step: 0.05 },
              { type: 'slider', label: text('语速', 'Speed'), bind: 'data.form.rate', min: 0.5, max: 2, step: 0.1 },
            ],
          },
          { type: 'divider' },
          {
            type: 'text',
            tone: 'muted',
            text: text(
              '密钥只写不读：保存后不会再显示。长按任意回复选「朗读」即可播放；开口说话会自动停下。',
              'The key is write-only and never shown again. Long-press a reply and choose Read aloud; speaking stops it.',
            ),
          },
        ],
      }
    }
  })
}
