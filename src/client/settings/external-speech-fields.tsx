import type { ReactElement } from 'react'
import type { ExternalSpeechSelection, SpeechEngineState } from '../../host-api.js'
import type { Translate } from '../localization.js'
import { VoicePresetPicker } from './controls/built-in-voice-picker.js'
import { SpeechInstructionPicker } from './controls/speech-instruction-picker.js'
import { VoiceAvatar } from './controls/voice-avatar.js'
import { SettingFieldHeading } from './field-heading.js'

function CatalogPicker({ items, value, label, disabled, onChange, voiceScope }: {
  items: { id: string; name: string }[]; value: string; label: string; disabled: boolean; onChange: (value: string) => void
  voiceScope?: { provider: string; model: string }
}): ReactElement {
  return <VoicePresetPicker value={value} label={label} disabled={disabled} onChange={onChange} presets={items.map(item => ({
    id: item.id,
    value: item.id,
    label: item.name,
    summary: item.name === item.id ? '' : item.id,
    avatar: <VoiceAvatar voice={voiceScope && { ...voiceScope, id: item.id }} label={item.name} />,
  }))} />
}

export function ExternalSpeechFields({ engine, selection = engine.selection, writable, minimal, t, onChange }: {
  engine: SpeechEngineState; selection?: ExternalSpeechSelection | undefined; writable: boolean; minimal: boolean; t: Translate
  onChange: (selection: ExternalSpeechSelection) => void
}): ReactElement {
  const model = engine.models?.find(item => item.id === selection?.model)
  const disabled = !writable || !engine.configurable || !selection
  return <>
    <div className="xmimo-tts-model xmimo-tts-external-catalog">
      <SettingFieldHeading label={t('settings.model')} resettable={false} disabled={disabled} />
      {engine.models?.length ? <CatalogPicker value={selection?.model ?? ''} items={engine.models} label={t('settings.model')} disabled={disabled} onChange={id => {
        const next = engine.models!.find(item => item.id === id)!
        onChange({ model: id, voice: next.voices.some(voice => voice.id === selection?.voice) ? selection!.voice : next.voices[0]?.id ?? '', speechInstruction: '' })
      }} /> : <input aria-label={t('settings.model')} value={engine.modelName ?? ''} disabled />}
    </div>
    <div className="xmimo-tts-voice xmimo-tts-external-catalog">
      <SettingFieldHeading label={t('settings.voiceReadingVoice')} resettable={false} disabled={disabled} />
      {model?.voices.length ? <CatalogPicker value={selection?.voice ?? ''} items={model.voices} label={t('settings.voiceReadingVoice')} disabled={disabled}
        voiceScope={{ provider: engine.provider, model: model.id }} onChange={voice => onChange({ ...selection!, voice })} />
        : <input aria-label={t('settings.voiceReadingVoice')} value={engine.voiceName ?? ''} disabled />}
    </div>
    <div className="xmimo-tts-voice xmimo-tts-speech-instruction">
      <SettingFieldHeading label={t('settings.speechInstruction')} resettable={false} disabled={disabled || !model?.speechInstruction} />
      <SpeechInstructionPicker provider="external" value={selection?.speechInstruction ?? ''} disabled={disabled || !model?.speechInstruction} minimal={minimal} t={t}
        options={model?.instructions} onChange={speechInstruction => onChange({ ...selection!, speechInstruction })} />
    </div>
  </>
}
