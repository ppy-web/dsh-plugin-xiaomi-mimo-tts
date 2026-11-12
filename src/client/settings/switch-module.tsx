import type { ReactElement } from 'react'
import { useState } from 'react'
import { Button, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { nextTtsProvider, TTS_PROVIDER_CHARACTER_ASSET_ROUTES, TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE, TTS_TOGGLE_CHARACTER_ASSET_ROUTE } from '../../shared.js'
import type { TtsProvider } from '../../types/providers.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { providerLabelKey } from './provider-label.js'
import { useHoloHover } from './use-holo-hover.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import { TTS_EXTERNAL_PROVIDER_CHARACTER_ASSET_ROUTE } from '../../shared.js'
import type { SpeechEngineState } from '../../host-api.js'
import { nextExternalConfiguration, switchExternalConfiguration } from './external-selection.js'
import { useSettingsSearch } from './settings-search-context.js'

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
  const { hide } = useSettingsSearch()
  const hidden = hide(kind === 'voice' ? 'enabled' : kind === 'autoplay' ? 'autoPlay' : 'soundEnabled')
  const state = checked ? 'on' : 'off'
  if (minimal) return <div
    className="xmimo-tts-minimal-control xmimo-tts-minimal-toggle"
    hidden={hidden}
    data-xmimo-sound-toggle={kind === 'sound' ? 'true' : undefined}
    onClick={(event) => {
      if ((event.target as HTMLElement).closest('button') !== null || disabled) return
      onChange(!checked)
    }}
  >
    <span className="xmimo-tts-minimal-toggle-label">{label}</span>
    <Switch checked={checked} disabled={disabled} label={`${label}: ${stateLabel}`} onChange={onChange} />
  </div>

  return <label className={`xmimo-tts-character-toggle xmimo-tts-character-toggle-${state}`} hidden={hidden} data-xmimo-sound-toggle={kind === 'sound' ? 'true' : undefined}>
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

function ProviderToggle({ t, provider, doubaoEnabled, breezeEnabled, minimal, writable, switching, onChange, onExternalChange }: {
  t: Translate
  provider: TtsProvider
  doubaoEnabled: boolean
  breezeEnabled: boolean
  minimal: boolean
  writable: boolean
  switching: boolean
  onChange: (provider: TtsProvider) => void
  onExternalChange: (engine: SpeechEngineState, configurationId: string) => void
}): ReactElement {
  const view = useEngineState()
  const { hide } = useSettingsSearch()
  const external = externalEngine()
  const identity = external ? `${external.provider}/${external.configurationId ?? ''}` : provider
  const image = external ? TTS_EXTERNAL_PROVIDER_CHARACTER_ASSET_ROUTE : TTS_PROVIDER_CHARACTER_ASSET_ROUTES[provider]
  const [portrait, setPortrait] = useState(() => ({ identity, turns: 0, front: image, back: image }))
  if (portrait.identity !== identity) {
    const turns = portrait.turns + 1
    // Replace the hidden face, then flip another half turn for every provider change.
    setPortrait({
      identity,
      turns,
      front: turns % 2 === 0 ? image : portrait.front,
      back: turns % 2 === 1 ? image : portrait.back,
    })
  }
  const nextProvider = nextTtsProvider(provider, doubaoEnabled, breezeEnabled)
  const nextExternal = external ? nextExternalConfiguration(external) : undefined
  const label = external?.name ?? t(providerLabelKey(provider))
  const nextLabel = nextExternal?.name ?? t(providerLabelKey(nextProvider))
  const switchLabel = external && !nextExternal ? `${label} · ${t('settings.externalManaged')}` : `${t('settings.provider')}: ${label} · ${t('settings.switchProvider')}: ${nextLabel}`
  const disabled = !writable || switching || (external !== null && (!nextExternal || view.status !== 'ready'))
  const change = (): void => {
    if (disabled) return
    if (external && nextExternal) onExternalChange(external, nextExternal.id)
    else onChange(nextProvider)
  }
  const switchIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7h18m-4-4 4 4-4 4M21 17H3m4-4-4 4 4 4" />
  </svg>

  if (minimal) return <Button
    type="button"
    variant="outline"
    size="sm"
    className="xmimo-tts-minimal-control xmimo-tts-provider-button"
    hidden={hide('provider')}
    data-xmimo-sound-toggle="provider"
    aria-label={switchLabel}
    title={switchLabel}
    disabled={disabled}
    aria-busy={switching}
    onClick={change}
  >
    <span>{label}</span>
    {switchIcon}
  </Button>

  return <button
    type="button"
    className="xmimo-tts-character-toggle xmimo-tts-character-toggle-on xmimo-tts-provider-toggle"
    hidden={hide('provider')}
    data-provider={provider}
    data-external={external ? 'true' : undefined}
    data-xmimo-sound-toggle="provider"
    aria-label={switchLabel}
    title={switchLabel}
    disabled={disabled}
    aria-busy={switching}
    onClick={change}
  >
    <span className="xmimo-tts-character-control">
      <span className="xmimo-tts-character-portrait xmimo-tts-provider-portrait" aria-hidden="true">
        <span className="xmimo-tts-provider-flipper" style={{ transform: `rotateY(${portrait.turns * 180}deg)` }}>
          <span className="xmimo-tts-provider-face" style={{ backgroundImage: `url(${hostRoute(portrait.front)})` }} />
          <span className="xmimo-tts-provider-face xmimo-tts-provider-face-back" style={{ backgroundImage: `url(${hostRoute(portrait.back)})` }} />
        </span>
      </span>
      <span className="xmimo-tts-character-copy"><strong>{label}</strong></span>
      <span className="xmimo-tts-character-state xmimo-tts-provider-state">{switchIcon}</span>
    </span>
  </button>
}

export interface SwitchModuleProps {
  doubaoEnabled: boolean
  breezeEnabled: boolean
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

export function SwitchModule({ t, provider, doubaoEnabled, breezeEnabled, enabled, autoPlay, soundEnabled, minimal, writable, onProviderChange, onEnabledChange, onAutoPlayChange, onSoundEnabledChange }: SwitchModuleProps): ReactElement {
  const { result } = useSettingsSearch()
  const rowRef = useHoloHover(!minimal && writable)
  const [switching, setSwitching] = useState(false)
  const [switchFailed, setSwitchFailed] = useState(false)
  const changeExternal = (engine: SpeechEngineState, configurationId: string): void => {
    setSwitching(true)
    setSwitchFailed(false)
    void switchExternalConfiguration(engine, configurationId).catch(() => setSwitchFailed(true)).finally(() => setSwitching(false))
  }

  return <section hidden={result !== null && !result.groups.has('switches')} className={minimal ? 'xmimo-tts-switch-module xmimo-tts-switch-module-minimal' : 'xmimo-tts-switch-module'}>
    <div ref={rowRef} className="xmimo-tts-switch-row xmimo-ui-grid">
      <CharacterToggle kind="voice" checked={enabled} disabled={!writable} label={t(minimal ? 'settings.enabled' : enabled ? 'settings.enabledOnLabel' : 'settings.enabledOffLabel')} stateLabel={t(enabled ? 'settings.stateOn' : 'settings.stateOff')} minimal={minimal} onChange={onEnabledChange} />
      <CharacterToggle kind="autoplay" checked={enabled && autoPlay} disabled={!writable} label={t(minimal ? 'settings.autoPlay' : enabled && autoPlay ? 'settings.autoPlayOnLabel' : 'settings.autoPlayOffLabel')} stateLabel={t(enabled && autoPlay ? 'settings.stateOn' : 'settings.stateOff')} minimal={minimal} onChange={onAutoPlayChange} />
      <CharacterToggle kind="sound" checked={soundEnabled} disabled={!writable} label={t(minimal ? 'settings.soundEffectsTitle' : soundEnabled ? 'settings.soundEffectsOnLabel' : 'settings.soundEffectsOffLabel')} stateLabel={t(soundEnabled ? 'settings.stateOn' : 'settings.stateOff')} minimal={minimal} onChange={onSoundEnabledChange} />
      <ProviderToggle t={t} provider={provider} doubaoEnabled={doubaoEnabled} breezeEnabled={breezeEnabled} minimal={minimal} writable={writable} switching={switching} onChange={onProviderChange} onExternalChange={changeExternal} />
    </div>
    {switchFailed ? <p className="xmimo-tts-failed" role="alert">{t('settings.externalSwitchFailed')}</p> : null}
  </section>
}
