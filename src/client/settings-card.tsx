import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  TTS_FORMATS,
  TTS_LOCAL_SPEECH_MODES,
  TTS_MIXER_WHALE_ASSET_ROUTE,
  TTS_MODELS,
  TTS_PREVIEW_WHALE_ASSET_ROUTE,
  TTS_API_KEY_STATUS_ROUTE,
  TTS_API_KEY_WHALE_ASSET_ROUTE,
  TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
  TTS_UNINSTALL_ROUTE,
  TTS_UPDATE_ROUTE,
  TTS_VOICE_DESIGN_PRESETS,
  isSupportedTtsApiKey,
  resolveTtsSettings,
  TTS_VOICE_DESIGN_PLAYBACK_MODES,
  VOICE_DESIGN_AI_RPC_CHANNEL,
  VOICE_DESIGN_AI_RPC_ENDPOINT,
} from '../shared.js'
import type { TtsFormat, TtsLocalSpeechMode, TtsModel, TtsSettings, TtsVoiceDesignPlaybackMode, VoiceDesignAiGeneratePayload, VoiceDesignAiGenerateResult } from '../shared.js'
import type { Translate } from './localization.js'
import type { SettingsScopeCompat } from './dsh-compat.js'
import { BuiltInVoicePicker } from './built-in-voice-picker.js'
import { LocalVoicePicker } from './local-voice-picker.js'
import { PreviewPlayer } from './preview-player.js'
import type { PreviewStatus } from './preview-player.js'
import { isRecord, useSettingsSnapshot } from './settings-scope.js'
import { ToggleSoundPlayer } from './toggle-sound-player.js'
import {
  CUSTOM_VOICE_DESIGN_OPTION,
  VoiceDesignPresetPicker,
  isPresetVoiceDesignPrompt,
} from './voice-design-picker.js'

interface SettingsCardProps {
  scope: SettingsScopeCompat<TtsSettings>
  t: Translate
  connection: { rpc: ClientConnectionRpc }
}

type EditableSettingField = 'enabled' | 'autoPlay' | 'model' | 'localSpeechMode' | 'localVoiceURI' | 'voice' | 'voiceDesignPrompt' | 'voiceDesignCustomPrompt' | 'format' | 'voiceDesignPlaybackMode'
type SettingField = EditableSettingField | 'apiKey'
type DraftChange = { kind: 'set' } | { kind: 'clear' }
type DraftChanges = Partial<Record<SettingField, DraftChange>>
type ResolvedSettings = ReturnType<typeof resolveTtsSettings>
type DraftSettings = Pick<ResolvedSettings, EditableSettingField>

const EDITABLE_SETTING_FIELDS: EditableSettingField[] = ['enabled', 'autoPlay', 'model', 'localSpeechMode', 'localVoiceURI', 'voice', 'voiceDesignPrompt', 'voiceDesignCustomPrompt', 'format', 'voiceDesignPlaybackMode']
const RELEASES_URL = 'https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts/releases'

function hostRoute(path: string): string {
  const relative = path.replace(/^\/+/, '')
  return typeof document === 'undefined' ? `/${relative}` : new URL(relative, document.baseURI).pathname
}

interface CharacterToggleProps {
  kind: 'voice' | 'autoplay'
  checked: boolean
  disabled: boolean
  label: string
  stateLabel: string
  onChange: (checked: boolean) => void
}

function CharacterToggle({ kind, checked, disabled, label, stateLabel, onChange }: CharacterToggleProps): ReactElement {
  const state = checked ? 'on' : 'off'
  return <label className={`xmimo-tts-character-toggle xmimo-tts-character-toggle-${state}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => { onChange(event.target.checked) }} />
    <span className="xmimo-tts-character-control">
      <span
        className={`xmimo-tts-character-portrait xmimo-tts-character-${kind}-${state}`}
        style={{ backgroundImage: `url(${hostRoute(TTS_TOGGLE_CHARACTER_ASSET_ROUTE)})` }}
        aria-hidden="true"
      />
      <span className="xmimo-tts-character-copy">
        <strong>{label}</strong>
      </span>
      <span className="xmimo-tts-character-state"><span aria-hidden="true" />{stateLabel}</span>
    </span>
  </label>
}

interface ModelPickerProps {
  value: TtsModel
  disabled: boolean
  label: string
  presetLabel: string
  voiceDesignLabel: string
  onChange: (value: TtsModel) => void
}

const MODEL_PICKER_OPTIONS = [
  { value: TTS_MODELS[0], labelKey: 'preset' as const },
  { value: TTS_MODELS[1], labelKey: 'voiceDesign' as const },
]

const VOICE_DESIGN_AI_COPY_KEYS = [
  'settings.voiceDesignAiCopy1',
  'settings.voiceDesignAiCopy2',
  'settings.voiceDesignAiCopy3',
  'settings.voiceDesignAiCopy4',
] as const

const API_KEY_IDLE_COPY_KEYS = [
  'settings.apiKeyIdleCopy1',
  'settings.apiKeyIdleCopy2',
  'settings.apiKeyIdleCopy3',
  'settings.apiKeyIdleCopy4',
] as const

const API_KEY_FOCUS_COPY_KEYS = [
  'settings.apiKeyFocusCopy1',
  'settings.apiKeyFocusCopy2',
  'settings.apiKeyFocusCopy3',
  'settings.apiKeyFocusCopy4',
] as const

type ApiKeyBubbleKey = typeof API_KEY_IDLE_COPY_KEYS[number] | typeof API_KEY_FOCUS_COPY_KEYS[number]

function randomCopyKey<T extends readonly string[]>(keys: T, current?: string): T[number] {
  if (keys.length < 2) return keys[0]!
  let next = keys[Math.floor(Math.random() * keys.length)]!
  while (next === current) next = keys[Math.floor(Math.random() * keys.length)]!
  return next
}

function ModelPicker({ value, disabled, label, presetLabel, voiceDesignLabel, onChange }: ModelPickerProps): ReactElement {
  return <div className="xmimo-tts-model-switch" role="group" aria-label={label}>
    {MODEL_PICKER_OPTIONS.map((option) => <button
      key={option.value}
      type="button"
      aria-pressed={option.value === value}
      className={option.value === value ? 'xmimo-tts-model-switch-option xmimo-tts-model-switch-option-selected' : 'xmimo-tts-model-switch-option'}
      disabled={disabled}
      onClick={() => { onChange(option.value) }}
    >
      <span>{option.labelKey === 'preset' ? presetLabel : voiceDesignLabel}</span>
    </button>)}
  </div>
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

export function SettingsCard({ scope, t, connection }: SettingsCardProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const value = snapshot.value
  const initial = resolveTtsSettings(value)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyBubbleKey, setApiKeyBubbleKey] = useState<ApiKeyBubbleKey>(() => randomCopyKey(API_KEY_IDLE_COPY_KEYS))
  const [enabled, setEnabled] = useState(initial.enabled)
  const [autoPlay, setAutoPlay] = useState(initial.autoPlay)
  const [model, setModel] = useState(initial.model)
  const [localSpeechMode, setLocalSpeechMode] = useState(initial.localSpeechMode)
  const [localVoiceURI, setLocalVoiceURI] = useState(initial.localVoiceURI)
  const [voice, setVoice] = useState(initial.voice)
  const [format, setFormat] = useState(initial.format)
  const [voiceDesignPlaybackMode, setVoiceDesignPlaybackMode] = useState(initial.voiceDesignPlaybackMode)
  const [voiceDesignPrompt, setVoiceDesignPrompt] = useState(initial.voiceDesignPrompt)
  const [voiceDesignCustomPrompt, setVoiceDesignCustomPrompt] = useState(initial.voiceDesignCustomPrompt)
  const [voiceDesignAiState, setVoiceDesignAiState] = useState<'idle' | 'loading' | 'success' | 'failed'>('idle')
  const [voiceDesignAiCopyIndex, setVoiceDesignAiCopyIndex] = useState(() => Math.floor(Math.random() * VOICE_DESIGN_AI_COPY_KEYS.length))
  const [changes, setChanges] = useState<DraftChanges>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const [uninstallState, setUninstallState] = useState<'idle' | 'confirming' | 'uninstalling' | 'uninstalled' | 'failed'>('idle')
  const [open, setOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [previewText, setPreviewText] = useState(() => t('settings.previewDefaultText'))
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle')
  const [previewPlayer] = useState(() => new PreviewPlayer(setPreviewStatus))
  const [toggleSoundPlayer] = useState(() => new ToggleSoundPlayer())
  const [apiKeyStatus, setApiKeyStatus] = useState<'loading' | 'missing' | 'supported' | 'unsupported'>('loading')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  const accepted = resolveTtsSettings(value)
  const base = resolveTtsSettings(layerSettings(snapshot.base))
  const draft: DraftSettings = { enabled, autoPlay: enabled && autoPlay, model, localSpeechMode, localVoiceURI, voice, voiceDesignPrompt, voiceDesignCustomPrompt, format, voiceDesignPlaybackMode }
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
  const enteredApiKey = apiKey.trim()
  const apiKeyWarning = enteredApiKey.length > 0
    ? !isSupportedTtsApiKey(enteredApiKey)
    : apiKeyStatus === 'missing' || apiKeyStatus === 'unsupported'
  const apiKeyMessage = enteredApiKey.length > 0
    ? isSupportedTtsApiKey(enteredApiKey) ? t('settings.apiKeyStatus') : t('settings.apiKeyUnsupported')
    : apiKeyStatus === 'missing'
      ? t('settings.apiKeyMissing')
      : apiKeyStatus === 'unsupported'
        ? t('settings.apiKeyUnsupported')
        : t('settings.apiKeyStatus')

  useEffect(() => {
    if (snapshot.status === 'unavailable') return
    let active = true
    setApiKeyStatus('loading')
    void fetch(TTS_API_KEY_STATUS_ROUTE, { headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('api-key-status-failed')
        return await response.json() as { configured?: unknown; supported?: unknown }
      })
      .then((status) => {
        if (!active) return
        setApiKeyStatus(status.configured !== true ? 'missing' : status.supported === true ? 'supported' : 'unsupported')
      })
      .catch(() => {
        if (active) setApiKeyStatus('missing')
      })
    return () => { active = false }
  }, [snapshot.status, value])

  useEffect(() => {
    if (!open) return
    let active = true
    void fetch(hostRoute(TTS_UPDATE_ROUTE), { cache: 'no-store', headers: { accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('version-check-failed')
        return await response.json() as { latestVersion?: unknown; updateAvailable?: unknown }
      })
      .then((result) => {
        if (!active) return
        setLatestVersion(result.updateAvailable === true && typeof result.latestVersion === 'string' ? result.latestVersion : null)
      })
      .catch(() => { if (active) setLatestVersion(null) })
    return () => { active = false }
  }, [open])

  useEffect(() => {
    if (dirty) return
    const next = resolveTtsSettings(value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setVoice(next.voice)
    setFormat(next.format)
    setVoiceDesignPlaybackMode(next.voiceDesignPlaybackMode)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setVoiceDesignAiState('idle')
    setChanges({})
  }, [dirty, value])

  useEffect(() => () => {
    toggleSoundPlayer.dispose()
    void previewPlayer.dispose()
  }, [previewPlayer, toggleSoundPlayer])

  if (snapshot.status === 'unavailable') return null

  const markChange = (field: SettingField, kind: DraftChange['kind'] = 'set'): void => {
    setChanges((current) => ({ ...current, [field]: { kind } }))
    setState('idle')
  }

  const generateVoiceDesign = async (): Promise<void> => {
    if (voiceDesignAiState === 'loading' || !snapshot.writable) return
    setVoiceDesignAiState('loading')
    try {
      const payload: VoiceDesignAiGeneratePayload = { input: voiceDesignPrompt }
      const raw = await connection.rpc.call(VOICE_DESIGN_AI_RPC_CHANNEL, VOICE_DESIGN_AI_RPC_ENDPOINT, payload)
      const result = raw as unknown as { ok: true; value: VoiceDesignAiGenerateResult } | { ok: false; error?: { message?: unknown } }
      if (!result.ok) throw new Error(typeof result.error?.message === 'string' ? result.error.message : 'voice-design-ai-failed')
      const generated = result.value?.text
      if (typeof generated !== 'string' || generated.trim().length === 0) throw new Error('voice-design-ai-empty-output')
      setVoiceDesignPrompt(generated)
      setVoiceDesignCustomPrompt(generated)
      setChanges((current) => ({ ...current, voiceDesignPrompt: { kind: 'set' }, voiceDesignCustomPrompt: { kind: 'set' } }))
      setState('idle')
      setVoiceDesignAiState('success')
    } catch {
      setVoiceDesignAiState('failed')
    }
  }

  const chooseVoiceDesignAiCopy = (): void => {
    setVoiceDesignAiCopyIndex((current) => (current + 1 + Math.floor(Math.random() * (VOICE_DESIGN_AI_COPY_KEYS.length - 1))) % VOICE_DESIGN_AI_COPY_KEYS.length)
  }

  const resetField = (field: EditableSettingField): void => {
    markChange(field, 'clear')
    if (field === 'enabled') setEnabled(base.enabled)
    if (field === 'autoPlay') setAutoPlay(base.autoPlay)
    if (field === 'model') setModel(base.model)
    if (field === 'localSpeechMode') setLocalSpeechMode(base.localSpeechMode)
    if (field === 'localVoiceURI') setLocalVoiceURI(base.localVoiceURI)
    if (field === 'voice') setVoice(base.voice)
    if (field === 'format') setFormat(base.format)
    if (field === 'voiceDesignPlaybackMode') setVoiceDesignPlaybackMode(base.voiceDesignPlaybackMode)
    if (field === 'voiceDesignPrompt') { setVoiceDesignPrompt(base.voiceDesignPrompt); setVoiceDesignAiState('idle') }
    if (field === 'voiceDesignCustomPrompt') { setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt); setVoiceDesignAiState('idle') }
  }

  const discard = (): void => {
    const next = resolveTtsSettings(scope.getSnapshot().value)
    setEnabled(next.enabled)
    setAutoPlay(next.autoPlay)
    setModel(next.model)
    setLocalSpeechMode(next.localSpeechMode)
    setLocalVoiceURI(next.localVoiceURI)
    setVoice(next.voice)
    setFormat(next.format)
    setVoiceDesignPlaybackMode(next.voiceDesignPlaybackMode)
    setVoiceDesignPrompt(next.voiceDesignPrompt)
    setVoiceDesignCustomPrompt(next.voiceDesignCustomPrompt)
    setVoiceDesignAiState('idle')
    setApiKey('')
    setChanges({})
    setState('idle')
  }

  const save = async (): Promise<void> => {
    setDetailsOpen(false)
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

  const uninstall = async (): Promise<void> => {
    setUninstallState('uninstalling')
    try {
      const response = await fetch(hostRoute(TTS_UNINSTALL_ROUTE), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      const result = await response.json() as { ok?: unknown }
      if (!response.ok || result.ok !== true) throw new Error('plugin-uninstall-failed')
      setUninstallState('uninstalled')
    } catch {
      setUninstallState('failed')
    }
  }

  const voiceDesignPreset = TTS_VOICE_DESIGN_PRESETS.find((item) => item.prompt === voiceDesignPrompt)
  const summaryModel = t(model === 'mimo-v2.5-tts-voicedesign' ? 'settings.summaryVoiceDesignModel' : 'settings.summaryPresetModel')
  const summaryVoice = model === 'mimo-v2.5-tts-voicedesign'
    ? voiceDesignPreset?.label ?? t('settings.customVoiceOption')
    : voice
  const summaryPlayback = model === 'mimo-v2.5-tts-voicedesign'
    ? t(voiceDesignPlaybackMode === 'complete' ? 'settings.voiceDesignPlaybackComplete' : 'settings.voiceDesignPlaybackSegmented')
    : format.toUpperCase()
  const summaryStrategy = t(localSpeechMode === 'auto' ? 'settings.localSpeechAutoSummary' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled')
  const previewBusy = previewStatus === 'loading' || previewStatus === 'playing'
  const previewMessageKey = previewStatus === 'error'
    ? 'settings.previewFailed'
    : previewStatus === 'loading'
      ? 'settings.previewLoading'
      : previewStatus === 'playing'
        ? 'settings.previewPlaying'
        : 'settings.previewHint'
  const detailsInertProps: Record<string, string> = detailsOpen ? {} : { inert: '' }

  const togglePreview = (): void => {
    if (previewBusy) {
      previewPlayer.stop()
      return
    }
    void previewPlayer.play(previewText, {
      model,
      localSpeechMode,
      localVoiceURI,
      voice,
      voiceDesignPrompt,
      format,
      voiceDesignPlaybackMode,
    })
  }

  const changeEnabled = (next: boolean): void => {
    toggleSoundPlayer.schedule(next ? 'on' : 'off')
    setEnabled(next)
    if (!next) {
      setAutoPlay(false)
      setChanges((current) => ({ ...current, enabled: { kind: 'set' }, autoPlay: { kind: 'set' } }))
    } else {
      markChange('enabled')
    }
    setState('idle')
  }

  const changeAutoPlay = (next: boolean): void => {
    toggleSoundPlayer.schedule(next ? 'auto-on' : 'auto-off')
    setAutoPlay(next)
    if (next) {
      setEnabled(true)
      setChanges((current) => ({ ...current, autoPlay: { kind: 'set' }, enabled: { kind: 'set' } }))
    } else {
      markChange('autoPlay')
    }
    setState('idle')
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
        <div className="xmimo-tts-grid xmimo-tts-sections">
        <section className="xmimo-tts-switch-module xmimo-tts-wide">
          <div className="xmimo-tts-switch-row">
            <CharacterToggle kind="voice" checked={enabled} disabled={!snapshot.writable} label={t(enabled ? 'settings.enabledOnLabel' : 'settings.enabledOffLabel')} stateLabel={t(enabled ? 'settings.stateOn' : 'settings.stateOff')} onChange={changeEnabled} />
            <CharacterToggle kind="autoplay" checked={enabled && autoPlay} disabled={!snapshot.writable} label={t(enabled && autoPlay ? 'settings.autoPlayOnLabel' : 'settings.autoPlayOffLabel')} stateLabel={t(enabled && autoPlay ? 'settings.stateOn' : 'settings.stateOff')} onChange={changeAutoPlay} />
          </div>
        </section>
        <section className="xmimo-tts-settings-module xmimo-tts-api-key xmimo-tts-wide">
          <SettingFieldHeading
            label={t('settings.apiKey')}
            suffix={<a className="xmimo-tts-api-key-link" href="https://platform.xiaomimimo.com/console/api-keys" target="_blank" rel="noopener noreferrer">{t('settings.getApiKey')}</a>}
            overriddenLabel={t('settings.apiKeyConfigured')}
            overridden={fieldOverridden('apiKey')}
            resettable={false}
            disabled={!snapshot.writable}
          />
          <div className="xmimo-tts-api-key-input">
            <span className="xmimo-tts-character-bubble xmimo-tts-api-key-bubble" aria-live="polite">{t(apiKeyBubbleKey)}</span>
            <span
              className="xmimo-tts-api-key-whale"
              style={{ backgroundImage: `url(${hostRoute(TTS_API_KEY_WHALE_ASSET_ROUTE)})` }}
              aria-hidden="true"
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
              onFocus={() => { setApiKeyBubbleKey((current) => randomCopyKey(API_KEY_FOCUS_COPY_KEYS, current)) }}
              onBlur={() => { setApiKeyBubbleKey((current) => randomCopyKey(API_KEY_IDLE_COPY_KEYS, current)) }}
              onChange={(event) => { setApiKey(event.target.value); markChange('apiKey') }}
            />
          </div>
          <small className={apiKeyWarning ? 'xmimo-tts-api-key-warning' : undefined} role={apiKeyWarning ? 'alert' : undefined}>
            {apiKeyMessage}
          </small>
        </section>
        </div>
        {enabled ? <section className="xmimo-tts-settings-module xmimo-tts-details xmimo-tts-wide">
        <button type="button" className="xmimo-tts-details-toggle" aria-expanded={detailsOpen} onClick={() => { setDetailsOpen((current) => !current) }}>
          <span className="xmimo-tts-details-heading">
            <strong>{t('settings.detailedVoiceConfig')}</strong>
            <span className="xmimo-tts-details-summary">
              <span>{summaryModel}</span><span>{summaryVoice}</span><span>{summaryPlayback}</span><span>{summaryStrategy}</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          className={model === 'mimo-v2.5-tts-voicedesign' ? 'xmimo-tts-mixer-whale-button' : 'xmimo-tts-mixer-whale-button xmimo-tts-mixer-whale-button-static'}
          disabled={model !== 'mimo-v2.5-tts-voicedesign' || !snapshot.writable || voiceDesignAiState === 'loading'}
          aria-label={t('settings.voiceDesignGenerate')}
          aria-busy={voiceDesignAiState === 'loading'}
          onPointerDown={(event) => { event.stopPropagation() }}
          onClick={(event) => { event.stopPropagation(); if (model !== 'mimo-v2.5-tts-voicedesign') return; chooseVoiceDesignAiCopy(); void generateVoiceDesign() }}
        >
          {model === 'mimo-v2.5-tts-voicedesign' ? <span className="xmimo-tts-ai-copy">{voiceDesignAiState === 'loading' ? t('settings.voiceDesignGenerating') : voiceDesignAiState === 'success' ? t('settings.voiceDesignAiSuccess') : voiceDesignAiState === 'failed' ? t('settings.voiceDesignGenerateFailed') : t(VOICE_DESIGN_AI_COPY_KEYS[voiceDesignAiCopyIndex]!)}</span> : null}
          <span
            className={voiceDesignAiState === 'loading' ? 'xmimo-tts-mixer-whale xmimo-tts-mixer-whale-thinking' : 'xmimo-tts-mixer-whale'}
            style={{ backgroundImage: `url(${hostRoute(TTS_MIXER_WHALE_ASSET_ROUTE)})` }}
            aria-hidden="true"
          />
        </button>
        <div className={detailsOpen ? 'xmimo-tts-details-collapse xmimo-tts-details-collapse-open' : 'xmimo-tts-details-collapse'} aria-hidden={!detailsOpen} {...detailsInertProps}>
        <div className="xmimo-tts-details-body"><div className="xmimo-tts-grid">
        <div className="xmimo-tts-model xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.model')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('model')} resettable disabled={!snapshot.writable} onReset={() => { resetField('model') }} />
          <ModelPicker
            value={model}
            disabled={!snapshot.writable || voiceDesignAiState === 'loading'}
            label={t('settings.model')}
            presetLabel={t('settings.presetModelShort')}
            voiceDesignLabel={t('settings.voiceDesignModelShort')}
            onChange={(nextModel) => { setModel(nextModel); setVoiceDesignAiState('idle'); markChange('model'); if (nextModel === 'mimo-v2.5-tts-voicedesign') chooseVoiceDesignAiCopy() }}
          />
          {enabled && autoPlay ? <small>{t(model === 'mimo-v2.5-tts' ? 'settings.modelAutoPlayHintPreset' : 'settings.modelAutoPlayHintVoiceDesign')}</small> : null}
        </div>
        {model === 'mimo-v2.5-tts-voicedesign' ? <div className="xmimo-tts-voice-design-prompt xmimo-tts-wide">
          <SettingFieldHeading
            label={t('settings.voiceDesignPrompt')}
            overriddenLabel={t('settings.overridden')}
            resetLabel={t('settings.reset')}
            overridden={fieldOverridden('voiceDesignPrompt')}
            resettable
            disabled={!snapshot.writable}
            onReset={() => { resetField('voiceDesignPrompt') }}
          />
          <VoiceDesignPresetPicker
            value={isPresetVoiceDesignPrompt(voiceDesignPrompt) ? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION}
            disabled={!snapshot.writable}
            label={t('settings.voiceDesignPrompt')}
            customLabel={t('settings.customVoiceOption')}
            customSummary={t('settings.customVoiceSummary')}
            onChange={(value) => {
              const next = value === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : value
              setVoiceDesignPrompt(next)
              markChange('voiceDesignPrompt')
            }}
          />
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
              setVoiceDesignAiState('idle')
            }}
          />
          {voiceDesignAiState === 'failed' ? <small className="xmimo-tts-ai-generate-error" role="status">{t('settings.voiceDesignGenerateFailed')}</small> : null}
          <small>{t('settings.voiceDesignPromptHint')}</small>
          <div className="xmimo-tts-format xmimo-tts-wide">
            <SettingFieldHeading label={t('settings.voiceDesignPlaybackMode')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceDesignPlaybackMode')} resettable disabled={!snapshot.writable} onReset={() => { resetField('voiceDesignPlaybackMode') }} />
            <div className="xmimo-tts-format-options" role="radiogroup" aria-label={t('settings.voiceDesignPlaybackMode')}>
              {TTS_VOICE_DESIGN_PLAYBACK_MODES.map((item) => <label key={item} className={voiceDesignPlaybackMode === item ? 'xmimo-tts-format-option xmimo-tts-format-option-selected' : 'xmimo-tts-format-option'}>
                <input type="radio" name="xmimo-tts-voice-design-playback" value={item} checked={voiceDesignPlaybackMode === item} disabled={!snapshot.writable} onChange={() => { setVoiceDesignPlaybackMode(item as TtsVoiceDesignPlaybackMode); markChange('voiceDesignPlaybackMode') }} />
                <span>{t(item === 'complete' ? 'settings.voiceDesignPlaybackComplete' : 'settings.voiceDesignPlaybackSegmented')}</span>
              </label>)}
            </div>
            <small>{t(voiceDesignPlaybackMode === 'complete' ? 'settings.voiceDesignPlaybackCompleteHint' : 'settings.voiceDesignPlaybackSegmentedHint')}</small>
          </div>
        </div> : null}
        {model === 'mimo-v2.5-tts' ? <>
          <div className="xmimo-tts-voice xmimo-tts-wide">
            <SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voice')} resettable disabled={!snapshot.writable} onReset={() => { resetField('voice') }} />
            <BuiltInVoicePicker value={voice} disabled={!snapshot.writable} label={t('settings.voice')} onChange={(next) => { setVoice(next); markChange('voice') }} />
          </div>
          <div className="xmimo-tts-format xmimo-tts-wide">
            <SettingFieldHeading label={t('settings.format')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('format')} resettable disabled={!snapshot.writable} onReset={() => { resetField('format') }} />
            <div className="xmimo-tts-format-options" role="radiogroup" aria-label={t('settings.format')}>
              {TTS_FORMATS.map((item) => <label key={item} className={format === item ? 'xmimo-tts-format-option xmimo-tts-format-option-selected' : 'xmimo-tts-format-option'}>
                <input type="radio" name="xmimo-tts-format" value={item} checked={format === item} disabled={!snapshot.writable} onChange={() => { setFormat(item as TtsFormat); markChange('format') }} />
                <span>{item.toUpperCase()}</span>
              </label>)}
            </div>
            <small>{t(format === 'pcm' ? 'settings.formatPcmHint' : format === 'mp3' ? 'settings.formatMp3Hint' : 'settings.formatWavHint')}</small>
          </div>
        </> : null}
        <div className="xmimo-tts-voice xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.localVoice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('localVoiceURI')} resettable disabled={!snapshot.writable} onReset={() => { resetField('localVoiceURI') }} />
          <LocalVoicePicker value={localVoiceURI} disabled={!snapshot.writable || localSpeechMode === 'disabled'} label={t('settings.localVoice')} loadingLabel={t('settings.localVoiceLoading')} unavailableLabel={t('settings.localVoiceUnavailable')} offlineLabel={t('settings.localVoiceOffline')} onlineLabel={t('settings.localVoiceOnline')} onChange={(next) => { setLocalVoiceURI(next); markChange('localVoiceURI') }} />
        </div>
        <div className="xmimo-tts-format xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.localSpeechMode')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('localSpeechMode')} resettable disabled={!snapshot.writable} onReset={() => { resetField('localSpeechMode') }} />
          <div className="xmimo-tts-format-options" role="radiogroup" aria-label={t('settings.localSpeechMode')}>
            {TTS_LOCAL_SPEECH_MODES.map((item) => <label key={item} className={localSpeechMode === item ? 'xmimo-tts-format-option xmimo-tts-format-option-selected' : 'xmimo-tts-format-option'}>
              <input type="radio" name="xmimo-tts-local-speech-mode" value={item} checked={localSpeechMode === item} disabled={!snapshot.writable} onChange={() => { setLocalSpeechMode(item as TtsLocalSpeechMode); markChange('localSpeechMode') }} />
              <span>{t(item === 'auto' ? 'settings.localSpeechAuto' : item === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled')}</span>
            </label>)}
          </div>
          <small>{t(localSpeechMode === 'auto' ? 'settings.localSpeechAutoHint' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirstHint' : 'settings.localSpeechDisabledHint')}</small>
        </div>
        </div></div></div>
        </section> : null}
        <section className="xmimo-tts-settings-module xmimo-tts-preview">
          <strong className="xmimo-tts-preview-title">{t('settings.previewTitle')}</strong>
          <div className="xmimo-tts-preview-input">
            <span className={previewStatus === 'error' ? 'xmimo-tts-character-bubble xmimo-tts-preview-status xmimo-tts-failed' : 'xmimo-tts-character-bubble xmimo-tts-preview-status'} aria-live="polite">{t(previewMessageKey)}</span>
            <button
              type="button"
              className={previewBusy ? 'xmimo-tts-preview-whale-button xmimo-tts-preview-whale-button-active' : 'xmimo-tts-preview-whale-button'}
              style={{ backgroundImage: `url(${hostRoute(TTS_PREVIEW_WHALE_ASSET_ROUTE)})` }}
              disabled={!enabled || previewText.trim().length === 0}
              aria-label={t(previewBusy ? 'settings.previewStop' : 'settings.previewPlay')}
              onClick={togglePreview}
            />
            <textarea
              value={previewText}
              rows={2}
              maxLength={100}
              aria-label={t('settings.previewText')}
              placeholder={t('settings.previewPlaceholder')}
              onChange={(event) => { setPreviewText(event.target.value) }}
            />
          </div>
        </section>
        <div className="xmimo-tts-card-actions">
          {uninstallState === 'idle' && latestVersion !== null
            ? <a className="xmimo-tts-update" href={RELEASES_URL} target="_blank" rel="noopener noreferrer">{t('settings.updateAvailable')}</a>
            : null}
          {uninstallState === 'confirming'
            ? (
              <span className="xmimo-tts-uninstall-confirmation">
                <span>{t('settings.uninstallQuestion')}</span>
                <span className="xmimo-tts-uninstall-choice">
                  <button type="button" onClick={() => { void uninstall() }}>{t('settings.uninstallConfirm')}</button>
                  <button type="button" onClick={() => { setUninstallState('idle') }}>{t('settings.uninstallCancel')}</button>
                </span>
              </span>
              )
            : (
              <button
                type="button"
                className="xmimo-tts-uninstall"
                disabled={uninstallState === 'uninstalling' || uninstallState === 'uninstalled'}
                onClick={() => { setUninstallState('confirming') }}
              >
                {uninstallState === 'uninstalling' ? t('settings.uninstalling') : t('settings.uninstall')}
              </button>
              )}
          <a
            className="xmimo-tts-star"
            href="https://github.com/ppy-web/dsh-plugin-xiaomi-mimo-tts"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('settings.source')}
          </a>
          {!snapshot.writable ? <span>{t('settings.readOnly')}</span> : null}
          {uninstallState === 'uninstalled' ? <span role="status">{t('settings.uninstalled')}</span> : null}
          {uninstallState === 'failed' ? <span className="xmimo-tts-failed" role="status">{t('settings.uninstallFailed')}</span> : null}
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
