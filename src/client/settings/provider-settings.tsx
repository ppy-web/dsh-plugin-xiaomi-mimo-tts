import type { CSSProperties, ReactElement } from 'react'
import { Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_BREEZE_WORDMARK_ASSET_ROUTE, TTS_PROVIDER_LOGO_ASSET_ROUTES } from '../../shared.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { SettingFieldHeading } from './field-heading.js'

export interface ProviderSettingsProps {
  t: Translate
  writable: boolean
  doubaoEnabled: boolean
  breezeEnabled: boolean
  onProviderEnabledChange: (provider: 'doubao' | 'breeze', enabled: boolean) => void
}

export function ProviderSettings({ t, writable, doubaoEnabled, breezeEnabled, onProviderEnabledChange }: ProviderSettingsProps): ReactElement {
  return <section className="xmimo-tts-format xmimo-tts-provider-settings" aria-label={t('settings.provider')}>
    <SettingFieldHeading label={t('settings.provider')} resettable={false} disabled={!writable} />
    <small>{t('settings.providerMinimum')}</small>
    <div className="xmimo-tts-announcement-source">
      <span className="xmimo-tts-provider-settings-brand"><img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.xiaomi)} alt="" /><span>{t('settings.providerXiaomi')}</span></span>
      <Switch checked disabled label={t('settings.providerXiaomi')} onChange={() => {}} />
    </div>
    <div className="xmimo-tts-announcement-source">
      <span className="xmimo-tts-provider-settings-brand"><img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.doubao)} alt="" /><span>{t('settings.providerDoubao')}</span></span>
      <Switch checked={doubaoEnabled} disabled={!writable || (doubaoEnabled && !breezeEnabled)} label={t('settings.providerDoubao')} onChange={next => onProviderEnabledChange('doubao', next)} />
    </div>
    <div className="xmimo-tts-announcement-source">
      <span className="xmimo-tts-more-provider-brand">
        <span className="xmimo-tts-breeze-wordmark" role="img" aria-label="Breeze Blue" style={{ '--xmimo-breeze-wordmark': `url(${hostRoute(TTS_BREEZE_WORDMARK_ASSET_ROUTE)})` } as CSSProperties} />
        <Tag tone="info" className="xmimo-tts-experimental-tag">{t('settings.experimental')}</Tag>
      </span>
      <Switch checked={breezeEnabled} disabled={!writable || (breezeEnabled && !doubaoEnabled)} label={t('settings.breezeEnabled')} onChange={next => onProviderEnabledChange('breeze', next)} />
    </div>
  </section>
}
