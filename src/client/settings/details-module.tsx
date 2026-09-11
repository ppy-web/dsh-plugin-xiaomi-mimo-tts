import type { ReactElement } from 'react'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import {
  TTS_LOCAL_SPEECH_MODES,
  TTS_MIXER_WHALE_ASSET_ROUTE,
  TTS_MODELS,
  TTS_READ_SCOPES,
  TTS_VOICE_DESIGN_PRESETS,
} from '../../shared.js'
import type { TtsLocalSpeechMode, TtsModel, TtsReadScope } from '../../shared.js'
import type { Translate } from '../localization.js'
import { BuiltInVoicePicker } from './controls/built-in-voice-picker.js'
import { EnergyVolumeSlider } from './controls/energy-volume-slider.js'
import { LocalVoicePicker } from './controls/local-voice-picker.js'
import {
  VoiceDesignPresetPicker,
  CUSTOM_VOICE_DESIGN_OPTION,
  isPresetVoiceDesignPrompt,
} from './controls/voice-design-picker.js'
import { CollapsibleModule } from './collapsible-module.js'
import { SettingFieldHeading } from './field-heading.js'
import { hostRoute } from '../host-route.js'
import type { EditableSettingField, SettingField, VoiceDesignAiState } from './types.js'

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

export const VOICE_DESIGN_AI_COPY_KEYS = [
  'settings.voiceDesignAiCopy1',
  'settings.voiceDesignAiCopy2',
  'settings.voiceDesignAiCopy3',
  'settings.voiceDesignAiCopy4',
] as const

function readScopeLabel(scope: TtsReadScope): Parameters<Translate>[0] {
  return scope === 'smart'
    ? 'settings.readScopeSmart'
    : scope === 'full'
      ? 'settings.readScopeFull'
      : 'settings.readScopeFirstSegment'
}

function readScopeHint(scope: TtsReadScope): Parameters<Translate>[0] {
  return scope === 'smart'
    ? 'settings.readScopeSmartHint'
    : scope === 'full'
      ? 'settings.readScopeFullHint'
      : 'settings.readScopeFirstSegmentHint'
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

export interface DetailsModuleProps {
  t: Translate
  connection: { rpc: ClientConnectionRpc }
  open: boolean
  writable: boolean
  autoPlay: boolean
  voiceVolume: number
  voiceRate: number
  readScope: TtsReadScope
  model: TtsModel
  localSpeechMode: TtsLocalSpeechMode
  localVoiceURI: string
  voice: string
  voiceDesignPrompt: string
  voiceDesignCustomPrompt: string
  voiceDesignAiState: VoiceDesignAiState
  voiceDesignAiCopy: string
  fieldOverridden: (field: SettingField) => boolean
  resetField: (field: EditableSettingField) => void
  onToggle: () => void
  onVoiceVolumeChange: (value: number) => void
  onVoiceVolumeInteractionEnd: (value: number) => void
  onVoiceRateChange: (value: number) => void
  onVoiceRateInteractionEnd: (value: number) => void
  onReadScopeChange: (value: TtsReadScope) => void
  onModelChange: (value: TtsModel) => void
  onVoiceDesignPromptChange: (value: string) => void
  onVoiceChange: (value: string) => void
  onLocalVoiceURIChange: (value: string) => void
  onLocalSpeechModeChange: (value: TtsLocalSpeechMode) => void
  onVoiceDesignAiCopyChange: () => void
  onGenerateVoiceDesign: () => void
}

export function DetailsModule({ t, connection, open, writable, autoPlay, voiceVolume, voiceRate, readScope, model, localSpeechMode, localVoiceURI, voice, voiceDesignPrompt, voiceDesignCustomPrompt, voiceDesignAiState, voiceDesignAiCopy, fieldOverridden, resetField, onToggle, onVoiceVolumeChange, onVoiceVolumeInteractionEnd, onVoiceRateChange, onVoiceRateInteractionEnd, onReadScopeChange, onModelChange, onVoiceDesignPromptChange, onVoiceChange, onLocalVoiceURIChange, onLocalSpeechModeChange, onVoiceDesignAiCopyChange, onGenerateVoiceDesign }: DetailsModuleProps): ReactElement {
  const summaryModel = t(model === 'mimo-v2.5-tts-voicedesign' ? 'settings.summaryVoiceDesignModel' : 'settings.summaryPresetModel')
  const voiceDesignPreset = TTS_VOICE_DESIGN_PRESETS.find((item) => item.prompt === voiceDesignPrompt)
  const summaryVoice = model === 'mimo-v2.5-tts-voicedesign'
    ? voiceDesignPreset?.label ?? t('settings.customVoiceOption')
    : voice
  const summaryReadScope = t(readScopeLabel(readScope))
  const summaryStrategy = t(localSpeechMode === 'auto' ? 'settings.localSpeechAutoSummary' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled')
  const summaryVoiceVolume = `${Math.round(voiceVolume * 100)}%`
  const summaryVoiceRate = `${voiceRate.toFixed(1)}×`

  const mixerAction = <button
    type="button"
    className={model === 'mimo-v2.5-tts-voicedesign' ? 'xmimo-tts-mixer-whale-button' : 'xmimo-tts-mixer-whale-button xmimo-tts-mixer-whale-button-static'}
    disabled={model !== 'mimo-v2.5-tts-voicedesign' || !writable || voiceDesignAiState === 'loading'}
    aria-label={t('settings.voiceDesignGenerate')}
    aria-busy={voiceDesignAiState === 'loading'}
    onPointerDown={(event) => { event.stopPropagation() }}
    onClick={(event) => { event.stopPropagation(); if (model !== 'mimo-v2.5-tts-voicedesign') return; onVoiceDesignAiCopyChange(); onGenerateVoiceDesign() }}
  >
    {model === 'mimo-v2.5-tts-voicedesign' ? <span className="xmimo-tts-ai-copy">{voiceDesignAiState === 'loading' ? t('settings.voiceDesignGenerating') : voiceDesignAiState === 'success' ? t('settings.voiceDesignAiSuccess') : voiceDesignAiState === 'failed' ? t('settings.voiceDesignGenerateFailed') : voiceDesignAiCopy}</span> : null}
    <span
      className={voiceDesignAiState === 'loading' ? 'xmimo-tts-mixer-whale xmimo-tts-mixer-whale-thinking' : 'xmimo-tts-mixer-whale'}
      style={{ backgroundImage: `url(${hostRoute(TTS_MIXER_WHALE_ASSET_ROUTE)})` }}
      aria-hidden="true"
    />
  </button>

  return <CollapsibleModule
    className="xmimo-tts-settings-module xmimo-tts-details xmimo-ui-module"
    toggleClassName="xmimo-tts-details-toggle"
    headingClassName="xmimo-tts-details-heading"
    collapseClassName="xmimo-tts-details-collapse"
    collapseOpenClassName="xmimo-tts-details-collapse-open"
    title={t('settings.detailedVoiceConfig')}
    summary={<span className="xmimo-tts-details-summary xmimo-ui-summary">
      <span>{summaryVoiceVolume}</span><span>{summaryVoiceRate}</span><span>{summaryReadScope}</span><span>{summaryModel}</span><span>{summaryVoice}</span><span>{summaryStrategy}</span>
    </span>}
    open={open}
    onToggle={onToggle}
    action={mixerAction}
  >
    <div className="xmimo-tts-grid xmimo-ui-grid xmimo-tts-details-body xmimo-ui-module-body">
      <div className="xmimo-tts-volume">
        <SettingFieldHeading label={`${t('settings.voiceVolume')} ${summaryVoiceVolume}`} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceVolume')} resettable disabled={!writable} onReset={() => { resetField('voiceVolume') }} />
        <EnergyVolumeSlider value={voiceVolume} label={t('settings.voiceVolume')} disabled={!writable} onChange={onVoiceVolumeChange} onInteractionEnd={onVoiceVolumeInteractionEnd} />
      </div>
      <div className="xmimo-tts-volume">
        <SettingFieldHeading label={`${t('settings.voiceRate')} ${voiceRate.toFixed(1)}×`} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceRate')} resettable disabled={!writable} onReset={() => { resetField('voiceRate') }} />
        <EnergyVolumeSlider value={voiceRate} min={0.5} max={2} step={0.1} formatValue={(value) => `${value.toFixed(1)}×`} label={t('settings.voiceRate')} disabled={!writable} onChange={onVoiceRateChange} onInteractionEnd={onVoiceRateInteractionEnd} />
        <small>{t('settings.voiceRatePcmHint')}</small>
      </div>
      <div className="xmimo-tts-model">
        <SettingFieldHeading label={t('settings.model')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('model')} resettable disabled={!writable} onReset={() => { resetField('model') }} />
        <ModelPicker
          value={model}
          disabled={!writable || voiceDesignAiState === 'loading'}
          label={t('settings.model')}
          presetLabel={t('settings.presetModelShort')}
          voiceDesignLabel={t('settings.voiceDesignModelShort')}
          onChange={onModelChange}
        />
        {autoPlay ? <small>{t(model === 'mimo-v2.5-tts' ? 'settings.modelAutoPlayHintPreset' : 'settings.modelAutoPlayHintVoiceDesign')}</small> : null}
      </div>
      {model === 'mimo-v2.5-tts-voicedesign' ? <div className="xmimo-tts-voice-design-prompt">
        <SettingFieldHeading
          label={t('settings.voiceDesignPrompt')}
          overriddenLabel={t('settings.overridden')}
          resetLabel={t('settings.reset')}
          overridden={fieldOverridden('voiceDesignPrompt')}
          resettable
          disabled={!writable}
          onReset={() => { resetField('voiceDesignPrompt') }}
        />
        <VoiceDesignPresetPicker
          value={isPresetVoiceDesignPrompt(voiceDesignPrompt) ? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION}
          disabled={!writable}
          label={t('settings.voiceDesignPrompt')}
          customLabel={t('settings.customVoiceOption')}
          customSummary={t('settings.customVoiceSummary')}
          onChange={(value) => { onVoiceDesignPromptChange(value === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : value) }}
        />
        <textarea
          value={voiceDesignPrompt}
          rows={4}
          disabled={!writable}
          placeholder={t('settings.voiceDesignPromptHint')}
          onChange={(event) => { onVoiceDesignPromptChange(event.target.value) }}
        />
        {voiceDesignAiState === 'failed' ? <small className="xmimo-tts-ai-generate-error" role="status">{t('settings.voiceDesignGenerateFailed')}</small> : null}
        <small>{t('settings.voiceDesignPromptHint')}</small>
      </div> : null}
      {model === 'mimo-v2.5-tts' ? <>
        <div className="xmimo-tts-voice">
          <SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voice')} resettable disabled={!writable} onReset={() => { resetField('voice') }} />
          <BuiltInVoicePicker value={voice} disabled={!writable} label={t('settings.voice')} onChange={onVoiceChange} />
        </div>
      </> : null}
      <div className="xmimo-tts-voice">
        <SettingFieldHeading label={t('settings.localVoice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('localVoiceURI')} resettable disabled={!writable} onReset={() => { resetField('localVoiceURI') }} suffix={<small className="xmimo-tts-hint" style={{ fontSize: '11px' }}>Microsoft Edge – Better</small>} />
        <LocalVoicePicker value={localVoiceURI} disabled={!writable || localSpeechMode === 'disabled'} label={t('settings.localVoice')} loadingLabel={t('settings.localVoiceLoading')} unavailableLabel={t('settings.localVoiceUnavailable')} offlineLabel={t('settings.localVoiceOffline')} onlineLabel={t('settings.localVoiceOnline')} onChange={onLocalVoiceURIChange} />
      </div>
      <div className="xmimo-tts-format">
        <SettingFieldHeading label={t('settings.readScope')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('readScope')} resettable disabled={!writable} onReset={() => { resetField('readScope') }} />
        <div className="xmimo-tts-format-options" role="radiogroup" aria-label={t('settings.readScope')}>
          {TTS_READ_SCOPES.map((item) => <label key={item} data-xmimo-select-option="true" className={readScope === item ? 'xmimo-tts-format-option xmimo-tts-format-option-selected' : 'xmimo-tts-format-option'}>
            <input type="radio" name="xmimo-tts-read-scope" value={item} checked={readScope === item} disabled={!writable} onChange={() => { onReadScopeChange(item) }} />
            <span>{t(readScopeLabel(item))}</span>
          </label>)}
        </div>
        <small>{t(readScopeHint(readScope))}</small>
      </div>
      <div className="xmimo-tts-format">
        <SettingFieldHeading label={t('settings.localSpeechMode')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('localSpeechMode')} resettable disabled={!writable} onReset={() => { resetField('localSpeechMode') }} />
        <div className="xmimo-tts-format-options" role="radiogroup" aria-label={t('settings.localSpeechMode')}>
          {TTS_LOCAL_SPEECH_MODES.map((item) => <label key={item} data-xmimo-select-option="true" className={localSpeechMode === item ? 'xmimo-tts-format-option xmimo-tts-format-option-selected' : 'xmimo-tts-format-option'}>
            <input type="radio" name="xmimo-tts-local-speech-mode" value={item} checked={localSpeechMode === item} disabled={!writable} onChange={() => { onLocalSpeechModeChange(item) }} />
            <span>{t(item === 'auto' ? 'settings.localSpeechAuto' : item === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled')}</span>
          </label>)}
        </div>
        <small>{t(localSpeechMode === 'auto' ? 'settings.localSpeechAutoHint' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirstHint' : 'settings.localSpeechDisabledHint')}</small>
      </div>
    </div>
  </CollapsibleModule>
}
