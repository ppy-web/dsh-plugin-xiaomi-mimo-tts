import type { ExternalSpeechSelection } from '../../host-api.js'
import { ExternalSpeechFields } from './external-speech-fields.js'
import type { ReactElement } from 'react'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import { useCallback, useEffect, useState } from 'react'
import { RiArrowDownSLine, RiEqualizerLine } from 'react-icons/ri'
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  TTS_LOCAL_SPEECH_MODES,
  DOUBAO_VOICE_PRESETS,
  breezeVoiceLabel,
  TTS_MODELS,
  TTS_VOICE_DESIGN_PRESETS,
} from '../../shared.js'
import type { TtsLocalSpeechMode, TtsLocalVoiceEngine, TtsModel, TtsReadScope } from '../../shared.js'
import type { Translate } from '../localization.js'
import { BuiltInVoicePicker } from './controls/built-in-voice-picker.js'
import { LensSlider } from './controls/lens-slider.js'
import { FieldInfo } from './controls/field-info.js'
import { LocalVoiceModule } from './local-voice-module.js'
import { DoubaoVoicePicker } from './controls/doubao-voice-picker.js'
import { BreezeVoicePicker } from './controls/breeze-voice-picker.js'
import { VoiceIdInput } from './controls/voice-id-input.js'
import { SpeechInstructionPicker, speechInstructionLabel } from './controls/speech-instruction-picker.js'
import type { TtsProvider, DoubaoTtsModel } from '../../types/providers.js'
import {
  VoiceDesignPresetPicker,
  CUSTOM_VOICE_DESIGN_OPTION,
  isPresetVoiceDesignPrompt,
} from './controls/voice-design-picker.js'
import { CollapsibleModule } from './collapsible-module.js'
import { useNestedDisclosure } from './use-nested-disclosure.js'
import { useSettingsSearch } from './settings-search-context.js'
import { SettingFieldHeading } from './field-heading.js'
import { formatVoiceRate, readScopeLabelKey, VOICE_RATE_RANGE } from './voice-reading-options.js'
import { ReadScopeCards } from './controls/read-scope-cards.js'
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
      className="xmimo-tts-settings-segmented xmimo-tts-xiaomi-models"
    />
  </div>
}

export interface DetailsModuleProps {
  externalSelection?: ExternalSpeechSelection | undefined
  onExternalSelectionChange?: ((selection: ExternalSpeechSelection) => void) | undefined
  provider: TtsProvider
  doubaoModel: DoubaoTtsModel
  doubaoVoice: string
  doubaoClonedVoice: string
  breezeVoice: string
  breezeInstruction: string
  speechInstruction: string
  onSpeechInstructionChange: (instruction: string) => void
  onDoubaoModelChange: (model: DoubaoTtsModel) => void
  onDoubaoVoiceChange: (voice: string) => void
  onDoubaoClonedVoiceChange: (voice: string) => void
  onBreezeVoiceChange: (voice: string) => void
  onBreezeInstructionChange: (value: string) => void
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
  localVoiceEngine: TtsLocalVoiceEngine
  mossEnabled: boolean
  mossBaseURL: string
  mossVoice: string
  mossVoiceName: string
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
  onLocalVoiceEngineChange: (value: TtsLocalVoiceEngine) => void
  onMossBaseURLChange: (value: string) => void
  onMossVoiceChange: (voiceId: string, voiceName: string) => void
  onLocalSpeechModeChange: (value: TtsLocalSpeechMode) => void
}

export function DetailsModule({ externalSelection, onExternalSelectionChange, t, provider, doubaoModel, doubaoVoice, doubaoClonedVoice, breezeVoice, breezeInstruction, speechInstruction, onSpeechInstructionChange, onDoubaoModelChange, onDoubaoVoiceChange, onDoubaoClonedVoiceChange, onBreezeVoiceChange, onBreezeInstructionChange, open, minimal, writable, autoPlay, voiceVolume, voiceRate, readScope, model, localSpeechMode, localVoiceURI, localVoiceEngine, mossEnabled, mossBaseURL, mossVoice, mossVoiceName, voice, voiceDesignPrompt, voiceDesignCustomPrompt, fieldOverridden, resetField, onToggle, onVoiceVolumeChange, onVoiceVolumeInteractionEnd, onVoiceRateChange, onVoiceRateInteractionEnd, onReadScopeChange, onModelChange, onVoiceDesignPromptChange, onVoiceChange, onLocalVoiceURIChange, onLocalVoiceEngineChange, onMossBaseURLChange, onMossVoiceChange, onLocalSpeechModeChange }: DetailsModuleProps): ReactElement {
  useEngineState()
  const external = externalEngine()
  const providerWritable = writable && !external
  const [localVoicesAvailable, setLocalVoicesAvailable] = useState<boolean | null>(null)
  const { result: search, hide } = useSettingsSearch()
  const showMore = search !== null && (search.groups.has('playback') || search.groups.has('local'))
  const moreSettings = useNestedDisclosure(open, showMore)
  const onLocalVoicesAvailabilityChange = useCallback((available: boolean): void => { setLocalVoicesAvailable(available) }, [])
  const localVoiceAvailable = localVoiceEngine === 'browser' ? localVoicesAvailable !== false : true
  useEffect(() => {
    if (!localVoiceAvailable && localSpeechMode !== 'auto') onLocalSpeechModeChange('auto')
  }, [localSpeechMode, localVoiceAvailable, onLocalSpeechModeChange])
  const summaryModel = provider === 'doubao' ? t(doubaoModel === 'seed-icl-2.0' ? 'settings.doubaoCloneModel' : 'settings.doubaoStandardModel') : t(model === 'mimo-v2.5-tts-voicedesign' ? 'settings.summaryVoiceDesignModel' : 'settings.summaryPresetModel')
  const voiceDesignPreset = TTS_VOICE_DESIGN_PRESETS.find((item) => item.prompt === voiceDesignPrompt)
  const summaryVoice = provider === 'doubao' ? (doubaoModel === 'seed-icl-2.0' ? doubaoClonedVoice || t('settings.doubaoVoiceId') : DOUBAO_VOICE_PRESETS.find(voice => voice.value === doubaoVoice)?.name ?? doubaoVoice) : provider === 'breeze' ? breezeVoiceLabel(breezeVoice) : model === 'mimo-v2.5-tts-voicedesign'
    ? voiceDesignPreset?.label ?? t('settings.customVoiceOption')
    : voice
  const summaryReadScope = t(readScopeLabelKey(readScope))
  const summaryStrategy = t(localSpeechMode === 'auto' ? 'settings.localSpeechAutoSummary' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled')
  const summaryVoiceVolume = `${Math.round(voiceVolume * 100)}%`
  const summaryVoiceRate = formatVoiceRate(voiceRate)
  const instructionField = provider === 'doubao' ? 'doubaoInstruction' : provider === 'breeze' ? 'breezeInstruction' : 'instruction'
  const supportsInstruction = provider !== 'doubao' || doubaoModel === 'seed-tts-2.0'
  const instruction = provider === 'breeze' ? breezeInstruction : speechInstruction
  const summaryInstruction = supportsInstruction ? speechInstructionLabel(provider, instruction, t) : null
  const readScopeControl = <div className="xmimo-tts-format" hidden={hide('readScope')}>
    <SettingFieldHeading label={t('settings.readScope')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('readScope')} resettable disabled={!writable} onReset={() => { resetField('readScope') }} />
    <ReadScopeCards value={readScope} disabled={!writable} t={t} onChange={onReadScopeChange} />
  </div>
  return <CollapsibleModule
    className="xmimo-tts-settings-module xmimo-tts-details xmimo-ui-module"
    title={<span className="xmimo-ui-module-title"><RiEqualizerLine size={14} aria-hidden="true" focusable="false" />{t('settings.detailedVoiceConfig')}</span>}
    ariaLabel={t('settings.detailedVoiceConfig')}
    searchGroups={['mixer', 'playback', 'local']}
    summary={<span className="xmimo-tts-details-summary xmimo-ui-summary">
      <span>{summaryVoiceVolume}</span><span>{summaryVoiceRate}</span><span>{summaryReadScope}</span>{external ? <><span>{external.name}</span><span>{externalSelection?.model ?? external.modelName}</span><span>{externalSelection?.voice ?? external.voiceName}</span></> : <>{provider === 'breeze' ? null : <span>{summaryModel}</span>}<span>{summaryVoice}</span>{summaryInstruction === null ? null : <span title={`${t('settings.speechInstruction')}: ${instruction.trim() || summaryInstruction}`}>{summaryInstruction}</span>}</>}{minimal ? null : <span>{summaryStrategy}</span>}
    </span>}
    open={open}
    onToggle={onToggle}
  >
    <div className="xmimo-tts-grid xmimo-ui-grid xmimo-tts-details-body xmimo-ui-module-body">
      {external ? <ExternalSpeechFields engine={external} selection={externalSelection} writable={writable} minimal={minimal} t={t} onChange={onExternalSelectionChange ?? (() => {})} /> : <>
      {provider !== 'breeze' ? <div className="xmimo-tts-model" hidden={hide('model')}>
        <SettingFieldHeading label={t('settings.model')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden(provider === 'doubao' ? 'doubaoModel' : 'model')} resettable disabled={!providerWritable} onReset={() => { resetField(provider === 'doubao' ? 'doubaoModel' : 'model') }} />
        {provider === 'doubao' ? <SegmentedControl id="xmimo-tts-doubao-model" value={doubaoModel} options={[{ value: 'seed-tts-2.0', label: t('settings.doubaoStandardModel') }, { value: 'seed-icl-2.0', label: t('settings.doubaoCloneModel') }]} label={t('settings.model')} disabled={!providerWritable} onChange={onDoubaoModelChange} className="xmimo-tts-settings-segmented xmimo-tts-doubao-models" /> : <ModelPicker
          value={model}
          disabled={!providerWritable}
          label={t('settings.model')}
          presetLabel={t('settings.presetModelShort')}
          voiceDesignLabel={t('settings.voiceDesignModelShort')}
          onChange={onModelChange}
        />}
        {autoPlay && !minimal ? <small>{t(provider === 'doubao' ? 'settings.doubaoStreamingHint' : model === 'mimo-v2.5-tts' ? 'settings.modelAutoPlayHintPreset' : 'settings.modelAutoPlayHintVoiceDesign')}</small> : null}
      </div> : null}
      {provider === 'breeze' ? <div className="xmimo-tts-voice" hidden={hide('voice')}><SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('breezeVoice')} resettable disabled={!providerWritable} onReset={() => resetField('breezeVoice')} /><BreezeVoicePicker value={breezeVoice} disabled={!providerWritable} t={t} onChange={onBreezeVoiceChange} /></div> : provider === 'doubao' ? <div className={`xmimo-tts-voice xmimo-tts-doubao-voice${doubaoModel === 'seed-icl-2.0' ? ' xmimo-tts-cloned-voice' : ''}`} hidden={hide(doubaoModel === 'seed-icl-2.0' ? 'clonedVoice' : 'voice')}>
        <SettingFieldHeading
          label={t(doubaoModel === 'seed-icl-2.0' ? 'settings.doubaoClonedVoiceLabel' : 'settings.voice')}
          suffix={<small className="xmimo-tts-doubao-voice-hint"><a href={doubaoModel === 'seed-icl-2.0' ? 'https://console.volcengine.com/speech/new/experience/clone?projectName=default' : 'https://console.volcengine.com/speech/new/voices?projectName=default'} target="_blank" rel="noopener noreferrer">{t(doubaoModel === 'seed-icl-2.0' ? 'settings.doubaoCreateVoice' : 'settings.doubaoVoiceLibrary')}</a>{doubaoModel === 'seed-icl-2.0' ? <> {t('settings.doubaoCloneHint')}</> : null}</small>}
          overriddenLabel={t('settings.overridden')}
          resetLabel={t('settings.reset')}
          overridden={fieldOverridden(doubaoModel === 'seed-icl-2.0' ? 'doubaoClonedVoice' : 'doubaoVoice')}
          resettable
          disabled={!providerWritable}
          onReset={() => resetField(doubaoModel === 'seed-icl-2.0' ? 'doubaoClonedVoice' : 'doubaoVoice')}
        />
        {doubaoModel === 'seed-icl-2.0' ? <VoiceIdInput kind="cloned" value={doubaoClonedVoice} disabled={!providerWritable} label={t('settings.doubaoClonedVoice')} historyLabel={t('settings.doubaoClonedVoiceHistory')} t={t} onChange={onDoubaoClonedVoiceChange} /> : <DoubaoVoicePicker value={doubaoVoice} disabled={!providerWritable} minimal={minimal} onChange={onDoubaoVoiceChange} t={t} />}
      </div> : null}
      {provider === 'xiaomi' && model === 'mimo-v2.5-tts-voicedesign' ? <div className="xmimo-tts-voice-design-prompt" hidden={hide('voiceDesign')}>
        <SettingFieldHeading
          label={t('settings.voiceDesignPrompt')}
          overriddenLabel={t('settings.overridden')}
          resetLabel={t('settings.reset')}
          overridden={fieldOverridden('voiceDesignPrompt')}
          resettable
          disabled={!providerWritable}
          onReset={() => { resetField('voiceDesignPrompt') }}
        />
        <VoiceDesignPresetPicker
          value={isPresetVoiceDesignPrompt(voiceDesignPrompt) ? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION}
          disabled={!providerWritable}
          label={t('settings.voiceDesignPrompt')}
          customLabel={t('settings.customVoiceOption')}
          customSummary={t('settings.customVoiceSummary')}
          minimal={minimal}
          onChange={(value) => { onVoiceDesignPromptChange(value === CUSTOM_VOICE_DESIGN_OPTION ? voiceDesignCustomPrompt : value) }}
        />
        <textarea
          value={voiceDesignPrompt}
          rows={3}
          disabled={!providerWritable}
          placeholder={t('settings.voiceDesignPromptHint')}
          onChange={(event) => { onVoiceDesignPromptChange(event.target.value) }}
        />
        {!minimal ? <small>{t('settings.voiceDesignPromptHint')}</small> : null}
      </div> : null}
      {provider === 'xiaomi' && model === 'mimo-v2.5-tts' ? <>
        <div className="xmimo-tts-voice" hidden={hide('voice')}>
          <SettingFieldHeading label={t('settings.voice')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voice')} resettable disabled={!providerWritable} onReset={() => { resetField('voice') }} />
          <BuiltInVoicePicker value={voice} disabled={!providerWritable} label={t('settings.voice')} minimal={minimal} onChange={onVoiceChange} />
        </div>
      </> : null}
      {supportsInstruction ? <div className="xmimo-tts-voice xmimo-tts-speech-instruction" hidden={hide('instruction')}>
        <SettingFieldHeading label={t('settings.speechInstruction')} suffix={<FieldInfo label={t('settings.speechInstructionInfo')} text={t('settings.speechInstructionLimitations')} />} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden(instructionField)} resettable disabled={!providerWritable} onReset={() => resetField(instructionField)} />
        {provider === 'breeze' ? <SpeechInstructionPicker provider={provider} value={breezeInstruction} disabled={!providerWritable} minimal={minimal} onChange={onBreezeInstructionChange} t={t} /> : <SpeechInstructionPicker provider={provider} value={speechInstruction} disabled={!providerWritable} minimal={minimal} onChange={onSpeechInstructionChange} t={t} />}
      </div> : null}
      </>}
      <details {...moreSettings} className="xmimo-tts-more-settings" hidden={search !== null && !showMore}>
        <summary className="xmimo-tts-builtin-voice-trigger" hidden={showMore}>
          <span>{t('settings.more')}</span>
          <span className="xmimo-tts-more-settings-hint">{t('settings.moreHint')}</span>
          <RiArrowDownSLine className="xmimo-tts-voice-picker-chevron" size={16} aria-hidden="true" focusable="false" />
        </summary>
        <div className="xmimo-tts-more-settings-body">
          <div className="xmimo-tts-playback-controls" hidden={hide('voiceVolume', 'voiceRate')}>
            <div className="xmimo-tts-volume" hidden={hide('voiceVolume')}>
              <SettingFieldHeading label={t('settings.voiceVolume')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceVolume')} resettable disabled={!writable} onReset={() => { resetField('voiceVolume') }} />
              <LensSlider value={voiceVolume} label={t('settings.voiceVolume')} minimal={minimal} disabled={!writable} onChange={onVoiceVolumeChange} onInteractionEnd={onVoiceVolumeInteractionEnd} />
            </div>
            <div className="xmimo-tts-volume" hidden={hide('voiceRate')}>
              <SettingFieldHeading label={t('settings.voiceRate')} suffix={<FieldInfo label={t('settings.voiceRateInfo')} text={t('settings.voiceRateHint')} />} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('voiceRate')} resettable disabled={!writable} onReset={() => { resetField('voiceRate') }} />
              <LensSlider value={voiceRate} {...VOICE_RATE_RANGE} formatValue={formatVoiceRate} label={t('settings.voiceRate')} minimal={minimal} disabled={!writable} onChange={onVoiceRateChange} onInteractionEnd={onVoiceRateInteractionEnd} />
            </div>
          </div>
          {!minimal || (search !== null && !hide('browserVoice', 'localEngine', 'mossBaseURL', 'mossVoice')) ? <LocalVoiceModule
            t={t}
            minimal={minimal}
            writable={writable}
            localSpeechMode={localSpeechMode}
            engine={localVoiceEngine}
            mossEnabled={mossEnabled}
            browserVoiceURI={localVoiceURI}
            mossBaseURL={mossBaseURL}
            mossVoice={mossVoice}
            mossVoiceName={mossVoiceName}
            fieldOverridden={fieldOverridden}
            resetField={resetField}
            onEngineChange={onLocalVoiceEngineChange}
            onBrowserVoiceChange={onLocalVoiceURIChange}
            onMossBaseURLChange={onMossBaseURLChange}
            onMossVoiceChange={onMossVoiceChange}
            onBrowserAvailabilityChange={onLocalVoicesAvailabilityChange}
          /> : null}
          {readScopeControl}
          {!minimal || search?.visible.has('localSpeechMode') ? <div className="xmimo-tts-format" hidden={hide('localSpeechMode')}>
            <SettingFieldHeading label={t('settings.localSpeechMode')} overriddenLabel={t('settings.overridden')} resetLabel={t('settings.reset')} overridden={fieldOverridden('localSpeechMode')} resettable disabled={!writable} onReset={() => { resetField('localSpeechMode') }} />
            <div className="xmimo-tts-settings-segmented-wrap" data-xmimo-select-option="true">
              <SegmentedControl
                id="xmimo-tts-local-speech-mode"
                value={localSpeechMode}
                options={TTS_LOCAL_SPEECH_MODES.map((item) => ({
                  value: item,
                  label: t(item === 'auto' ? 'settings.localSpeechAuto' : item === 'local-first' ? 'settings.localSpeechFirst' : 'settings.localSpeechDisabled'),
                  disabled: !localVoiceAvailable && item !== 'auto',
                }))}
                label={t('settings.localSpeechMode')}
                disabled={!writable}
                onChange={onLocalSpeechModeChange}
                className="xmimo-tts-settings-segmented"
              />
            </div>
            <small>{t(!localVoiceAvailable ? 'settings.localSpeechUnavailableHint' : localSpeechMode === 'auto' ? 'settings.localSpeechAutoHint' : localSpeechMode === 'local-first' ? 'settings.localSpeechFirstHint' : 'settings.localSpeechDisabledHint')}</small>
          </div> : null}
        </div>
      </details>
    </div>
  </CollapsibleModule>
}
