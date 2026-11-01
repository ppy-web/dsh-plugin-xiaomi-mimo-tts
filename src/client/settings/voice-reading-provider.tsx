import type { ReactElement } from 'react'
import { useId } from 'react'
import { TTS_PROVIDERS, TTS_PROVIDER_LOGO_ASSET_ROUTES } from '../../shared.js'
import type { TtsProvider } from '../../shared.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'

const PROVIDER_NAMES: Record<TtsProvider, string> = {
  xiaomi: 'Xiaomi-MiMo',
  doubao: 'Doubao-Seed',
  breeze: 'Breeze Blue',
}

interface VoiceReadingProviderProps {
  value: TtsProvider
  disabled: boolean
  t: Translate
  onChange: (provider: TtsProvider) => void
}

export function VoiceReadingProvider({ value, disabled, t, onChange }: VoiceReadingProviderProps): ReactElement {
  const name = useId()
  return <fieldset className="xmimo-voice-reading-provider" disabled={disabled}>
    <legend className="xmimo-voice-reading-row-title">{t('settings.provider')}</legend>
    <div className="xmimo-voice-reading-provider-options">
      {TTS_PROVIDERS.map(provider => <label key={provider} className="xmimo-voice-reading-provider-option">
        <input type="radio" name={name} value={provider} checked={value === provider} onChange={() => { onChange(provider) }} />
        <span className="xmimo-voice-reading-provider-face">
          {provider === 'breeze'
            ? <span className="xmimo-voice-reading-provider-text-logo" aria-hidden="true">B</span>
            : <img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES[provider])} width={32} height={32} alt="" />}
          <span>{PROVIDER_NAMES[provider]}</span>
        </span>
      </label>)}
    </div>
  </fieldset>
}
