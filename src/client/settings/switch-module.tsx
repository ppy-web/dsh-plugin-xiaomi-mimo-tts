import type { ReactElement } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_PROVIDER_CHARACTER_ASSET_ROUTES, TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE, TTS_TOGGLE_CHARACTER_ASSET_ROUTE } from '../../shared.js'
import type { TtsProvider } from '../../types/providers.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { useHoloHover } from './use-holo-hover.js'

interface CharacterToggleProps {
  kind: 'voice' | 'autoplay' | 'sound'
  checked: boolean
  disabled: boolean
  label: string
  stateLabel: string
  minimal: boolean
  onChange: (checked: boolean) => void
}

function CharacterToggle({ kind, checked, disabled, label, stateLabel, minimal, onChange }: CharacterToggleProps): ReactElement {
  const state = checked ? 'on' : 'off'
  if (minimal) return <div
    className="xmimo-tts-minimal-control xmimo-tts-minimal-toggle"
    data-xmimo-sound-toggle={kind === 'sound' ? 'true' : undefined}
    onClick={(event) => {
      if ((event.target as HTMLElement).closest('button') !== null || disabled) return
      onChange(!checked)
    }}
  >
    <span className="xmimo-tts-minimal-toggle-label">{label}</span>
    <Switch checked={checked} disabled={disabled} label={`${label}: ${stateLabel}`} onChange={onChange} />
  </div>

  return <label className={`xmimo-tts-character-toggle xmimo-tts-character-toggle-${state}`} data-xmimo-sound-toggle={kind === 'sound' ? 'true' : undefined}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => { onChange(event.target.checked) }} />
    <span className="xmimo-tts-character-control">
      {!minimal ? <span
        className={`xmimo-tts-character-portrait xmimo-tts-character-${kind}-${state}`}
        style={{ backgroundImage: `url(${hostRoute(kind === 'sound' ? TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE : TTS_TOGGLE_CHARACTER_ASSET_ROUTE)})` }}
        aria-hidden="true"
      /> : null}
      <span className="xmimo-tts-character-copy">
        <strong>{label}</strong>
      </span>
      <span className="xmimo-tts-character-state"><span aria-hidden="true" />{stateLabel}</span>
    </span>
  </label>
}

function ProviderToggle({ t, provider, minimal, writable, onChange }: {
  t: Translate
  provider: TtsProvider
  minimal: boolean
  writable: boolean
  onChange: (provider: TtsProvider) => void
}): ReactElement {
  const nextProvider = provider === 'xiaomi' ? 'doubao' : 'xiaomi'
  const label = t(provider === 'xiaomi' ? 'settings.providerXiaomi' : 'settings.providerDoubao')
  const nextLabel = t(nextProvider === 'xiaomi' ? 'settings.providerXiaomi' : 'settings.providerDoubao')
  const switchLabel = `${t('settings.provider')}: ${label} · ${t('settings.switchProvider')}: ${nextLabel}`
  const switchIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4" />
  </svg>

  if (minimal) return <Button
    type="button"
    variant="outline"
    size="sm"
    className="xmimo-tts-minimal-control xmimo-tts-provider-button"
    data-xmimo-sound-toggle="provider"
    aria-label={switchLabel}
    title={switchLabel}
    disabled={!writable}
    onClick={() => onChange(nextProvider)}
  >
    <span>{label}</span>
    {switchIcon}
  </Button>

  return <button
    type="button"
    className="xmimo-tts-character-toggle xmimo-tts-character-toggle-on xmimo-tts-provider-toggle"
    data-provider={provider}
    data-xmimo-sound-toggle="provider"
    aria-label={switchLabel}
    title={switchLabel}
    disabled={!writable}
    onClick={() => onChange(nextProvider)}
  >
    <span className="xmimo-tts-character-control">
      <span className="xmimo-tts-character-portrait xmimo-tts-provider-portrait" aria-hidden="true">
        <span className="xmimo-tts-provider-flipper">
          <span className="xmimo-tts-provider-face xmimo-tts-provider-face-xiaomi" style={{ backgroundImage: `url(${hostRoute(TTS_PROVIDER_CHARACTER_ASSET_ROUTES.xiaomi)})` }} />
          <span className="xmimo-tts-provider-face xmimo-tts-provider-face-doubao" style={{ backgroundImage: `url(${hostRoute(TTS_PROVIDER_CHARACTER_ASSET_ROUTES.doubao)})` }} />
        </span>
      </span>
      <span className="xmimo-tts-character-copy"><strong>{label}</strong></span>
      <span className="xmimo-tts-character-state xmimo-tts-provider-state">{switchIcon}</span>
    </span>
  </button>
}

export interface SwitchModuleProps {
  t: Translate
  provider: TtsProvider
  enabled: boolean
  autoPlay: boolean
  soundEnabled: boolean
  minimal: boolean
  writable: boolean
  onProviderChange: (provider: TtsProvider) => void
  onEnabledChange: (next: boolean) => void
  onAutoPlayChange: (next: boolean) => void
  onSoundEnabledChange: (next: boolean) => void
}

export function SwitchModule({ t, provider, enabled, autoPlay, soundEnabled, minimal, writable, onProviderChange, onEnabledChange, onAutoPlayChange, onSoundEnabledChange }: SwitchModuleProps): ReactElement {
  const rowRef = useHoloHover(!minimal && writable)

  return <section className={minimal ? 'xmimo-tts-switch-module xmimo-tts-switch-module-minimal' : 'xmimo-tts-switch-module'}>
    <div ref={rowRef} className="xmimo-tts-switch-row xmimo-ui-grid">
      <CharacterToggle kind="voice" checked={enabled} disabled={!writable} label={t(minimal ? 'settings.enabled' : enabled ? 'settings.enabledOnLabel' : 'settings.enabledOffLabel')} stateLabel={t(enabled ? 'settings.stateOn' : 'settings.stateOff')} minimal={minimal} onChange={onEnabledChange} />
      <CharacterToggle kind="autoplay" checked={enabled && autoPlay} disabled={!writable} label={t(minimal ? 'settings.autoPlay' : enabled && autoPlay ? 'settings.autoPlayOnLabel' : 'settings.autoPlayOffLabel')} stateLabel={t(enabled && autoPlay ? 'settings.stateOn' : 'settings.stateOff')} minimal={minimal} onChange={onAutoPlayChange} />
      <CharacterToggle kind="sound" checked={soundEnabled} disabled={!writable} label={t(minimal ? 'settings.soundEffectsTitle' : soundEnabled ? 'settings.soundEffectsOnLabel' : 'settings.soundEffectsOffLabel')} stateLabel={t(soundEnabled ? 'settings.stateOn' : 'settings.stateOff')} minimal={minimal} onChange={onSoundEnabledChange} />
      <ProviderToggle t={t} provider={provider} minimal={minimal} writable={writable} onChange={onProviderChange} />
    </div>
  </section>
}
