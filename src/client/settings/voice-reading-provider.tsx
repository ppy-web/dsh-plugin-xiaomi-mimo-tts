import type { ReactElement } from 'react'
import { useId } from 'react'
import { availableTtsProviders, TTS_PROVIDER_LOGO_ASSET_ROUTES } from '../../shared.js'
import type { TtsProvider } from '../../shared.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { useEngineState } from '../use-engine-state.js'
import { externalEngine } from '../engine-state.js'
import { useHoloHover } from './use-holo-hover.js'

const PROVIDER_NAMES: Record<TtsProvider, string> = {
  xiaomi: 'Xiaomi-MiMo',
  doubao: 'Doubao-Seed',
  breeze: 'Breeze Blue',
}

interface VoiceReadingProviderProps {
  value: TtsProvider
  doubaoEnabled: boolean
  breezeEnabled: boolean
  disabled: boolean
  t: Translate
  onChange: (provider: TtsProvider) => void
}

export function VoiceReadingProvider({ value, doubaoEnabled, breezeEnabled, disabled, t, onChange }: VoiceReadingProviderProps): ReactElement {
  useEngineState()
  const external = externalEngine()
  const name = useId()
  const noticeId = useId()
  const hoverRef = useHoloHover(external !== null, { selector: '.xmimo-voice-reading-provider-options', allowDisabled: true, mouseOnly: true, tilt: 3 })
  const providers = availableTtsProviders(doubaoEnabled, breezeEnabled)
  return <fieldset className="xmimo-voice-reading-provider" data-external={external ? '' : undefined}
    aria-describedby={external ? noticeId : undefined} disabled={disabled || external !== null}>
    <legend className="xmimo-voice-reading-row-title">{external?.name ?? t('settings.provider')}</legend>
    <div ref={hoverRef} className={providers.length === 3 ? 'xmimo-voice-reading-provider-options xmimo-voice-reading-provider-options-three' : 'xmimo-voice-reading-provider-options'}>
      {providers.map(provider => <label key={provider} className="xmimo-voice-reading-provider-option">
        <input type="radio" name={name} value={provider} checked={value === provider} onChange={() => { onChange(provider) }} />
        <span className="xmimo-voice-reading-provider-face">
          <img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES[provider])} width={32} height={32} alt="" />
          <span>{breezeEnabled ? ({ xiaomi: 'Xiaomi', doubao: 'Doubao', breeze: 'Breeze' } as const)[provider] : PROVIDER_NAMES[provider]}</span>
        </span>
      </label>)}
      {external ? <div id={noticeId} className="xmimo-voice-reading-takeover-notice"><span>{t('settings.externalTakeover')}</span></div> : null}
    </div>
  </fieldset>
}
