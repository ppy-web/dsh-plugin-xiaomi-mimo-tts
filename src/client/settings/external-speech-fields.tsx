import type { ReactElement } from 'react'
import type { ExternalSpeechSelection, SpeechEngineState } from '../../host-api.js'
import type { Translate } from '../localization.js'
import { VoicePresetPicker } from './controls/built-in-voice-picker.js'
import { SpeechInstructionPicker } from './controls/speech-instruction-picker.js'
import { SettingFieldHeading } from './field-heading.js'
import { VoiceReadingSelect } from './voice-reading-select.js'

function CatalogPicker({ items, value, label, minimal, disabled, onChange }: {
  items: { id: string; name: string }[]; value: string; label: string; minimal: boolean; disabled: boolean; onChange: (value: string) => void
}): ReactElement {
  if (minimal) return <VoiceReadingSelect value={value} label={label} options={items.map(item => ({ id: item.id, label: item.name }))} disabled={disabled} onSelect={onChange} buttonVariant="outline" />
  return <VoicePresetPicker value={value} label={label} disabled={disabled} onChange={onChange} presets={items.map(item => ({ id: item.id, value: item.id, label: item.name, summary: item.name === item.id ? '' : item.id,
    avatar: <span className="xmimo-tts-builtin-voice-avatar xmimo-tts-doubao-voice-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span> }))} />
}

export function ExternalSpeechFields({ engine, selection = engine.selection, writable, minimal, t, onChange }: {
  engine: SpeechEngineState; selection?: ExternalSpeechSelection | undefined; writable: boolean; minimal: boolean; t: Translate
  onChange: (selection: ExternalSpeechSelection) => void
}): ReactElement {
  const model = engine.models?.find(item => item.id === selection?.model)
  const disabled = !writable || !engine.configurable || !selection
  return <>
    <div className="xmimo-tts-model">
      <SettingFieldHeading label={t('settings.model')} resettable={false} disabled={disabled} />
      {engine.models?.length ? <CatalogPicker value={selection?.model ?? ''} items={engine.models} label={t('settings.model')} minimal={minimal} disabled={disabled} onChange={id => {
        const next = engine.models!.find(item => item.id === id)!
        onChange({ model: id, voice: next.voices.some(voice => voice.id === selection?.voice) ? selection!.voice : next.voices[0]?.id ?? '', speechInstruction: '' })
      }} /> : <input aria-label={t('settings.model')} value={engine.modelName ?? ''} disabled />}
    </div>
    <div className="xmimo-tts-voice">
      <SettingFieldHeading label={t('settings.voiceReadingVoice')} resettable={false} disabled={disabled} />
      {model?.voices.length ? <CatalogPicker value={selection?.voice ?? ''} items={model.voices} label={t('settings.voiceReadingVoice')} minimal={minimal} disabled={disabled} onChange={voice => onChange({ ...selection!, voice })} />
        : <input aria-label={t('settings.voiceReadingVoice')} value={engine.voiceName ?? ''} disabled />}
    </div>
    <div className="xmimo-tts-voice xmimo-tts-speech-instruction">
      <SettingFieldHeading label={t('settings.speechInstruction')} resettable={false} disabled={disabled || !model?.speechInstruction} />
      <SpeechInstructionPicker provider="external" value={selection?.speechInstruction ?? ''} disabled={disabled || !model?.speechInstruction} minimal={minimal} t={t}
        options={model?.instructions} onChange={speechInstruction => onChange({ ...selection!, speechInstruction })} />
    </div>
  </>
}
