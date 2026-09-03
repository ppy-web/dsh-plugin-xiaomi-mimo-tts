import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
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
} from '../shared.js'
import type { TtsFormat, TtsLocalSpeechMode, TtsModel, TtsSettings, TtsVoiceDesignPlaybackMode } from '../shared.js'
import type { Translate } from './localization.js'
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
  scope: SettingsScope<TtsSettings>
  t: Translate
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
  { value: TTS_MODELS[0], labelKey: 'preset' as const, badge: 'TTS' },
  { value: TTS_MODELS[1], labelKey: 'voiceDesign' as const, badge: 'VD' },
]

function ModelPicker({ value, disabled, label, presetLabel, voiceDesignLabel, onChange }: ModelPickerProps): ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const listboxId = useId()
  const selectedIndex = Math.max(0, MODEL_PICKER_OPTIONS.findIndex((option) => option.value === value))
  const selected = MODEL_PICKER_OPTIONS[selectedIndex]!
  const optionLabel = (labelKey: typeof selected.labelKey): string => labelKey === 'preset' ? presetLabel : voiceDesignLabel

  useEffect(() => {
    if (!open) return
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [open])

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const focusOption = (index: number): void => {
    const normalized = (index + MODEL_PICKER_OPTIONS.length) % MODEL_PICKER_OPTIONS.length
    requestAnimationFrame(() => optionRefs.current[normalized]?.focus())
  }

  const choose = (next: TtsModel): void => {
    onChange(next)
    setOpen(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      focusOption(selectedIndex)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      setOpen(true)
      focusOption(event.key === 'Home' ? 0 : MODEL_PICKER_OPTIONS.length - 1)
    }
  }

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusOption(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusOption(index - 1)
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusOption(event.key === 'Home' ? 0 : MODEL_PICKER_OPTIONS.length - 1)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    } else if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  const content = (option: typeof selected): ReactElement => <>
    <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-model-avatar" aria-hidden="true">{option.badge}</span>
    <span className="xmimo-tts-builtin-voice-copy"><strong>{optionLabel(option.labelKey)}</strong></span>
  </>

  return <div className="xmimo-tts-builtin-voice-picker xmimo-tts-model-picker" ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="xmimo-tts-builtin-voice-trigger"
      disabled={disabled}
      aria-label={label}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      onClick={() => { setOpen((current) => !current) }}
      onKeyDown={handleTriggerKeyDown}
    >
      {content(selected)}
      <IconChevronDownOutline14 className={open ? 'xmimo-tts-voice-picker-chevron xmimo-tts-voice-picker-chevron-open' : 'xmimo-tts-voice-picker-chevron'} />
    </button>
    {open ? <div id={listboxId} className="xmimo-tts-builtin-voice-menu xmimo-tts-model-menu" role="listbox" aria-label={label}>
      {MODEL_PICKER_OPTIONS.map((option, index) => <button
        key={option.value}
        ref={(node) => { optionRefs.current[index] = node }}
        type="button"
        role="option"
        aria-selected={option.value === value}
        className={option.value === value ? 'xmimo-tts-builtin-voice-option xmimo-tts-builtin-voice-option-selected' : 'xmimo-tts-builtin-voice-option'}
        onClick={() => { choose(option.value) }}
        onKeyDown={(event) => { handleOptionKeyDown(event, index) }}
      >
        {option.value === value ? <svg className="xmimo-tts-builtin-voice-check" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" /><path d="m4.8 8.1 2 2 4.4-4.5" /></svg> : null}
        {content(option)}
      </button>)}
    </div> : null}
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

export function SettingsCard({ scope, t }: SettingsCardProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const value = snapshot.value
  const initial = resolveTtsSettings(value)
  const [apiKey, setApiKey] = useState('')
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
    if (field === 'voiceDesignPrompt') setVoiceDesignPrompt(base.voiceDesignPrompt)
    if (field === 'voiceDesignCustomPrompt') setVoiceDesignCustomPrompt(base.voiceDesignCustomPrompt)
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
              <span
                className={detailsOpen ? 'xmimo-tts-mixer-whale xmimo-tts-mixer-whale-open' : 'xmimo-tts-mixer-whale'}
                style={{ backgroundImage: `url(${hostRoute(TTS_MIXER_WHALE_ASSET_ROUTE)})` }}
                aria-hidden="true"
              />
            </span>
          </span>
        </button>
        <div className={detailsOpen ? 'xmimo-tts-details-collapse xmimo-tts-details-collapse-open' : 'xmimo-tts-details-collapse'} aria-hidden={!detailsOpen} {...detailsInertProps}>
        <div className="xmimo-tts-details-body"><div className="xmimo-tts-grid">
        <div className="xmimo-tts-model xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.model')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('model')} resettable disabled={!snapshot.writable} onReset={() => { resetField('model') }} />
          <ModelPicker
            value={model}
            disabled={!snapshot.writable}
            label={t('settings.model')}
            presetLabel={t('settings.presetModel')}
            voiceDesignLabel={t('settings.voiceDesignModel')}
            onChange={(nextModel) => { setModel(nextModel); markChange('model') }}
          />
          {enabled && autoPlay ? <small>{t(model === 'mimo-v2.5-tts' ? 'settings.modelAutoPlayHintPreset' : 'settings.modelAutoPlayHintVoiceDesign')}</small> : null}
        </div>
        {model === 'mimo-v2.5-tts-voicedesign' ? <div className="xmimo-tts-voice-design-prompt xmimo-tts-wide">
          <SettingFieldHeading label={t('settings.voiceDesignPrompt')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceDesignPrompt')} resettable disabled={!snapshot.writable} onReset={() => { resetField('voiceDesignPrompt') }} />
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
            }}
          />
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
          <span className={previewStatus === 'error' ? 'xmimo-tts-preview-status xmimo-tts-failed' : 'xmimo-tts-preview-status'} aria-live="polite">{t(previewMessageKey)}</span>
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
