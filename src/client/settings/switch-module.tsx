import type { ReactElement } from 'react'
import { TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE, TTS_TOGGLE_CHARACTER_ASSET_ROUTE } from '../../shared.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'

interface CharacterToggleProps {
  kind: 'voice' | 'autoplay' | 'sound'
  checked: boolean
  disabled: boolean
  label: string
  stateLabel: string
  onChange: (checked: boolean) => void
}

function CharacterToggle({ kind, checked, disabled, label, stateLabel, onChange }: CharacterToggleProps): ReactElement {
  const state = checked ? 'on' : 'off'
  return <label className={`xmimo-tts-character-toggle xmimo-tts-character-toggle-${state}`} data-xmimo-sound-toggle={kind === 'sound' ? 'true' : undefined}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => { onChange(event.target.checked) }} />
    <span className="xmimo-tts-character-control">
      <span
        className={`xmimo-tts-character-portrait xmimo-tts-character-${kind}-${state}`}
        style={{ backgroundImage: `url(${hostRoute(kind === 'sound' ? TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE : TTS_TOGGLE_CHARACTER_ASSET_ROUTE)})` }}
        aria-hidden="true"
      />
      <span className="xmimo-tts-character-copy">
        <strong>{label}</strong>
      </span>
      <span className="xmimo-tts-character-state"><span aria-hidden="true" />{stateLabel}</span>
    </span>
  </label>
}

export interface SwitchModuleProps {
  t: Translate
  enabled: boolean
  autoPlay: boolean
  soundEnabled: boolean
  writable: boolean
  onEnabledChange: (next: boolean) => void
  onAutoPlayChange: (next: boolean) => void
  onSoundEnabledChange: (next: boolean) => void
}

export function SwitchModule({ t, enabled, autoPlay, soundEnabled, writable, onEnabledChange, onAutoPlayChange, onSoundEnabledChange }: SwitchModuleProps): ReactElement {
  return <section className="xmimo-tts-switch-module">
    <div className="xmimo-tts-switch-row xmimo-ui-row">
      <CharacterToggle kind="voice" checked={enabled} disabled={!writable} label={t(enabled ? 'settings.enabledOnLabel' : 'settings.enabledOffLabel')} stateLabel={t(enabled ? 'settings.stateOn' : 'settings.stateOff')} onChange={onEnabledChange} />
      <CharacterToggle kind="autoplay" checked={enabled && autoPlay} disabled={!writable} label={t(enabled && autoPlay ? 'settings.autoPlayOnLabel' : 'settings.autoPlayOffLabel')} stateLabel={t(enabled && autoPlay ? 'settings.stateOn' : 'settings.stateOff')} onChange={onAutoPlayChange} />
      <CharacterToggle kind="sound" checked={soundEnabled} disabled={!writable} label={t(soundEnabled ? 'settings.soundEffectsOnLabel' : 'settings.soundEffectsOffLabel')} stateLabel={t(soundEnabled ? 'settings.stateOn' : 'settings.stateOff')} onChange={onSoundEnabledChange} />
    </div>
  </section>
}
