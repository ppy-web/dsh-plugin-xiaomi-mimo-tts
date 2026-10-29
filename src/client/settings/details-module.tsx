import type { ReactElement } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { RiEqualizerLine } from 'react-icons/ri'
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  TTS_LOCAL_SPEECH_MODES,
  DOUBAO_VOICE_PRESETS,
  TTS_MODELS,
  TTS_READ_SCOPES,
  TTS_VOICE_DESIGN_PRESETS,
} from '../../shared.js'
import type { TtsLocalSpeechMode, TtsModel, TtsReadScope } from '../../shared.js'
import type { Translate } from '../localization.js'
import { BuiltInVoicePicker } from './controls/built-in-voice-picker.js'
import { EnergyVolumeSlider } from './controls/energy-volume-slider.js'
import { FieldInfo } from './controls/field-info.js'
import { LocalVoicePicker } from './controls/local-voice-picker.js'
import { DoubaoVoicePicker } from './controls/doubao-voice-picker.js'
import { VoiceIdInput } from './controls/voice-id-input.js'
import { SpeechInstructionPicker } from './controls/speech-instruction-picker.js'
import type { TtsProvider, DoubaoTtsModel } from '../../types/providers.js'
import {
  VoiceDesignPresetPicker,
  CUSTOM_VOICE_DESIGN_OPTION,
  isPresetVoiceDesignPrompt,
} from './controls/voice-design-picker.js'
import { CollapsibleModule } from './collapsible-module.js'
import { SettingFieldHeading } from './field-heading.js'
import type { EditableSettingField, SettingField } from './types.js'

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
  const options = MODEL_PICKER_OPTIONS.map((option) => ({
    value: option.value,
    label: option.labelKey === 'preset' ? presetLabel : voiceDesignLabel,
  }))
  return <div className="xmimo-tts-settings-segmented-wrap" data-xmimo-select-option="true">
    <SegmentedControl
      id="xmimo-tts-model"
      value={value}
      options={options}
      label={label}
      disabled={disabled}
      onChange={onChange}
      className="xmimo-tts-settings-segmented"
    />
  </div>
}

export interface DetailsModuleProps {
  provider: TtsProvider
  doubaoModel: DoubaoTtsModel
  doubaoVoice: string
  doubaoClonedVoice: string
  speechInstruction: string
  onSpeechInstructionChange: (instruction: string) => void
  onDoubaoModelChange: (model: DoubaoTtsModel) => void
  onDoubaoVoiceChange: (voice: string) => void
  onDoubaoClonedVoiceChange: (voice: string) => void
  t: Translate
  open: boolean
  minimal: boolean
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
}

export function DetailsModule({ t, provider, doubaoModel, doubaoVoice, doubaoClonedVoice, speechInstruction, onSpeechInstructionChange, onDoubaoModelChange, onDoubaoVoiceChange, onDoubaoClonedVoiceChange, open, minimal, writable, autoPlay, voiceVolume, voiceRate, readScope, model, localSpeechMode, localVoiceURI, voice, voiceDesignPrompt, voiceDesignCustomPrompt, fieldOverridden, resetField, onToggle, onVoiceVolumeChange, onVoiceVolumeInteractionEnd, onVoiceRateChange, onVoiceRateInteractionEnd, onReadScopeChange, onModelChange, onVoiceDesignPromptChange, onVoiceChange, onLocalVoiceURIChange, onLocalSpeechModeChange }: DetailsModuleProps): ReactElement {
  const [localVoicesAvailable, setLocalVoicesAvailable] = useState<boolean | null>(null)
  const onLocalVoicesAvailabilityChange = useCallback((available: boolean): void => { setLocalVoicesAvailable(available) }, [])
  useEffect(() => {
    if (localVoicesAvailable === false && localSpeechMode !== 'auto') onLocalSpeechModeChange('auto')
  }, [localSpeechMode, localVoicesAvailable, onLocalSpeechModeChange])
  const summaryModel = provider === 'doubao' ? t(doubaoModel === 'seed-icl-2.0' ? 'settings.doubaoCloneModel' : 'settings.doubaoStandardModel') : t(model === 'mimo-v2.5-tts-voicedesign' ? 'settings.summaryVoiceDesignModel' : 'settings.summaryPresetModel')
  const voiceDesignPreset = TTS_VOICE_DESIGN_PRESETS.find((item) => item.prompt === voiceDesignPrompt)
  const summaryVoice = provider === 'doubao' ? (doubaoModel === 'seed-icl-2.0' ? doubaoClonedVoice || t('settings.doubaoVoiceId') : DOUBAO_VOICE_PRESETS.find(voice => voice.value === doubaoVoice)?.name ?? doubaoVoice) : model === 'mimo-v2.5-tts-voicedesign'
    ? voiceDesignPreset?.label ?? t('settings.customVoiceOption')
    : voice
  const summaryReadScope = t(readScopeLabel(readScope))
  const summaryStrategy = t(localSpeechMode === 'auto' ? 'settings.localSpeechAutoSummary' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled')
  const summaryVoiceVolume = `${Math.round(voiceVolume * 100)}%`
  const summaryVoiceRate = `${voiceRate.toFixed(1)}×`
  const instructionField = provider === 'doubao' ? 'doubaoInstruction' : 'instruction'
  return <CollapsibleModule
    className="xmimo-tts-settings-module xmimo-tts-details xmimo-ui-module"
    title={<span className="xmimo-ui-module-title"><RiEqualizerLine size={14} aria-hidden="true" focusable="false" />{t('settings.detailedVoiceConfig')}</span>}
    ariaLabel={t('settings.detailedVoiceConfig')}
    summary={<span className="xmimo-tts-details-summary xmimo-ui-summary">
      <span>{summaryVoiceVolume}</span><span>{summaryVoiceRate}</span><span>{summaryReadScope}</span><span>{summaryModel}</span><span>{summaryVoice}</span>{minimal ? null : <span>{summaryStrategy}</span>}
    </span>}
    open={open}
    onToggle={onToggle}
  >
    <div className="xmimo-tts-grid xmimo-ui-grid xmimo-tts-details-body xmimo-ui-module-body">
      <div className="xmimo-tts-volume">
        <SettingFieldHeading label={`${t('settings.voiceVolume')} ${summaryVoiceVolume}`} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceVolume')} resettable disabled={!writable} onReset={() => { resetField('voiceVolume') }} />
        <EnergyVolumeSlider value={voiceVolume} label={t('settings.voiceVolume')} minimal={minimal} disabled={!writable} onChange={onVoiceVolumeChange} onInteractionEnd={onVoiceVolumeInteractionEnd} />
      </div>
      <div className="xmimo-tts-volume">
        <SettingFieldHeading label={`${t('settings.voiceRate')} ${voiceRate.toFixed(1)}×`} suffix={<FieldInfo label={t('settings.voiceRateInfo')} text={t('settings.voiceRateHint')} />} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceRate')} resettable disabled={!writable} onReset={() => { resetField('voiceRate') }} />
        <EnergyVolumeSlider value={voiceRate} min={0.5} max={2} step={0.1} formatValue={(value) => `${value.toFixed(1)}×`} label={t('settings.voiceRate')} minimal={minimal} disabled={!writable} onChange={onVoiceRateChange} onInteractionEnd={onVoiceRateInteractionEnd} />
      </div>
      <div className="xmimo-tts-model">
        <SettingFieldHeading label={t('settings.model')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden(provider === 'doubao' ? 'doubaoModel' : 'model')} resettable disabled={!writable} onReset={() => { resetField(provider === 'doubao' ? 'doubaoModel' : 'model') }} />
        {provider === 'doubao' ? <SegmentedControl id="xmimo-tts-doubao-model" value={doubaoModel} options={[{ value: 'seed-tts-2.0', label: t('settings.doubaoStandardModel') }, { value: 'seed-icl-2.0', label: t('settings.doubaoCloneModel') }]} label={t('settings.model')} disabled={!writable} onChange={onDoubaoModelChange} className="xmimo-tts-settings-segmented xmimo-tts-doubao-models" /> : <ModelPicker
          value={model}
          disabled={!writable}
          label={t('settings.model')}
          presetLabel={t('settings.presetModelShort')}
          voiceDesignLabel={t('settings.voiceDesignModelShort')}
          onChange={onModelChange}
        />}
        {autoPlay && !minimal ? <small>{t(provider === 'doubao' ? 'settings.doubaoStreamingHint' : model === 'mimo-v2.5-tts' ? 'settings.modelAutoPlayHintPreset' : 'settings.modelAutoPlayHintVoiceDesign')}</small> : null}
      </div>
      {provider === 'doubao' ? <div className={`xmimo-tts-voice xmimo-tts-doubao-voice${doubaoModel === 'seed-icl-2.0' ? ' xmimo-tts-cloned-voice' : ''}`}>
        <SettingFieldHeading
          label={t(doubaoModel === 'seed-icl-2.0' ? 'settings.doubaoClonedVoiceLabel' : 'settings.voice')}
          suffix={<small className="xmimo-tts-doubao-voice-hint"><a href={doubaoModel === 'seed-icl-2.0' ? 'https://console.volcengine.com/speech/new/experience/clone?projectName=default' : 'https://console.volcengine.com/speech/new/voices?projectName=default'} target="_blank" rel="noopener noreferrer">{t(doubaoModel === 'seed-icl-2.0' ? 'settings.doubaoCreateVoice' : 'settings.doubaoVoiceLibrary')}</a>{doubaoModel === 'seed-icl-2.0' ? <> {t('settings.doubaoCloneHint')}</> : null}</small>}
          overriddenLabel={t('settings.overridden')}
          resetLabel={t('settings.reset')}
          overridden={fieldOverridden(doubaoModel === 'seed-icl-2.0' ? 'doubaoClonedVoice' : 'doubaoVoice')}
          resettable
          disabled={!writable}
          onReset={() => resetField(doubaoModel === 'seed-icl-2.0' ? 'doubaoClonedVoice' : 'doubaoVoice')}
        />
        {doubaoModel === 'seed-icl-2.0' ? <VoiceIdInput kind="cloned" value={doubaoClonedVoice} disabled={!writable} label={t('settings.doubaoClonedVoice')} historyLabel={t('settings.doubaoClonedVoiceHistory')} onChange={onDoubaoClonedVoiceChange} /> : <DoubaoVoicePicker value={doubaoVoice} disabled={!writable} minimal={minimal} onChange={onDoubaoVoiceChange} t={t} />}
      </div> : null}
      {provider === 'xiaomi' && model === 'mimo-v2.5-tts-voicedesign' ? <div className="xmimo-tts-voice-design-prompt">
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
          minimal={minimal}
          onChange={(value) => { onVoiceDesignPromptChange(value === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : value) }}
        />
        <textarea
          value={voiceDesignPrompt}
          rows={3}
          disabled={!writable}
          placeholder={t('settings.voiceDesignPromptHint')}
          onChange={(event) => { onVoiceDesignPromptChange(event.target.value) }}
        />
        {!minimal ? <small>{t('settings.voiceDesignPromptHint')}</small> : null}
      </div> : null}
      {provider === 'xiaomi' && model === 'mimo-v2.5-tts' ? <>
        <div className="xmimo-tts-voice">
          <SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voice')} resettable disabled={!writable} onReset={() => { resetField('voice') }} />
          <BuiltInVoicePicker value={voice} disabled={!writable} label={t('settings.voice')} minimal={minimal} onChange={onVoiceChange} />
        </div>
      </> : null}
      {provider === 'xiaomi' || doubaoModel === 'seed-tts-2.0' ? <div className="xmimo-tts-voice xmimo-tts-speech-instruction">
        <SettingFieldHeading label={t('settings.speechInstruction')} suffix={<FieldInfo label={t('settings.speechInstructionInfo')} text={t('settings.speechInstructionLimitations')} />} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden(instructionField)} resettable disabled={!writable} onReset={() => resetField(instructionField)} />
        <SpeechInstructionPicker provider={provider} value={speechInstruction} disabled={!writable} minimal={minimal} onChange={onSpeechInstructionChange} t={t} />
      </div> : null}
      {!minimal ? <div className="xmimo-tts-voice">
        <SettingFieldHeading label={t('settings.localVoice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('localVoiceURI')} resettable disabled={!writable} onReset={() => { resetField('localVoiceURI') }} suffix={<small className="xmimo-tts-hint" style={{ fontSize: '11px' }}>Microsoft Edge – Better</small>} />
        <LocalVoicePicker value={localVoiceURI} disabled={!writable || localSpeechMode === 'disabled'} label={t('settings.localVoice')} minimal={minimal} loadingLabel={t('settings.localVoiceLoading')} unavailableLabel={t('settings.localVoiceUnavailable')} offlineLabel={t('settings.localVoiceOffline')} onlineLabel={t('settings.localVoiceOnline')} onChange={onLocalVoiceURIChange} onAvailabilityChange={onLocalVoicesAvailabilityChange} />
      </div> : null}
      <div className="xmimo-tts-format">
        <SettingFieldHeading label={t('settings.readScope')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('readScope')} resettable disabled={!writable} onReset={() => { resetField('readScope') }} />
        <div className="xmimo-tts-settings-segmented-wrap" data-xmimo-select-option="true">
          <SegmentedControl
            id="xmimo-tts-read-scope"
            value={readScope}
            options={TTS_READ_SCOPES.map((item) => ({ value: item, label: t(readScopeLabel(item)) }))}
            label={t('settings.readScope')}
            disabled={!writable}
            onChange={onReadScopeChange}
            className="xmimo-tts-settings-segmented"
          />
        </div>
        {minimal? null : <small>{t(readScopeHint(readScope))}</small>}
      </div>
      {!minimal ? <div className="xmimo-tts-format">
        <SettingFieldHeading label={t('settings.localSpeechMode')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('localSpeechMode')} resettable disabled={!writable} onReset={() => { resetField('localSpeechMode') }} />
        <div className="xmimo-tts-settings-segmented-wrap" data-xmimo-select-option="true">
          <SegmentedControl
            id="xmimo-tts-local-speech-mode"
            value={localSpeechMode}
            options={TTS_LOCAL_SPEECH_MODES.map((item) => ({
              value: item,
              label: t(item === 'auto' ? 'settings.localSpeechAuto' : item === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled'),
              disabled: localVoicesAvailable === false && item !== 'auto',
            }))}
            label={t('settings.localSpeechMode')}
            disabled={!writable}
            onChange={onLocalSpeechModeChange}
            className="xmimo-tts-settings-segmented"
          />
        </div>
        <small>{t(localVoicesAvailable === false ? 'settings.localSpeechUnavailableHint' : localSpeechMode === 'auto' ? 'settings.localSpeechAutoHint' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirstHint' : 'settings.localSpeechDisabledHint')}</small>
      </div> : null}
    </div>
  </CollapsibleModule>
}
