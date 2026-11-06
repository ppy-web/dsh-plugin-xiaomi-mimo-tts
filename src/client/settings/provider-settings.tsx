import type { CSSProperties, ReactElement } from 'react'
import { Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { TTS_BREEZE_WORDMARK_ASSET_ROUTE, TTS_MOSS_LOGO_ASSET_ROUTE, TTS_PROVIDER_LOGO_ASSET_ROUTES } from '../../shared.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { FieldInfo } from './controls/field-info.js'
import { SettingFieldHeading } from './field-heading.js'
import { SPEECH_PROVIDER_ADAPTER_URL } from './plugin-links.js'

export interface ProviderSettingsProps {
  t: Translate
  writable: boolean
  providerLocked?: boolean
  doubaoEnabled: boolean
  breezeEnabled: boolean
  mossEnabled: boolean
  onMossEnabledChange: (enabled: boolean) => void
  onProviderEnabledChange: (provider: 'doubao' | 'breeze', enabled: boolean) => void
}

export function ProviderSettings({ t, writable, providerLocked = false, doubaoEnabled, breezeEnabled, mossEnabled, onMossEnabledChange, onProviderEnabledChange }: ProviderSettingsProps): ReactElement {
  const providerWritable = writable && !providerLocked
  return <section className="xmimo-tts-format xmimo-tts-provider-settings xmimo-tts-switch-grid" aria-label={t('settings.provider')}>
    <SettingFieldHeading label={t('settings.provider')} suffix={<>
      <FieldInfo label={t('settings.provider')} text={t('settings.providerMinimum')} />
      <a className="xmimo-tts-api-key-link" href={SPEECH_PROVIDER_ADAPTER_URL} target="_blank" rel="noopener noreferrer">{t('settings.externalProviderAdapter')} ↗</a>
    </>} resettable={false} disabled={!writable} />
    <div className="xmimo-tts-announcement-source">
      <span className="xmimo-tts-provider-settings-brand"><img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.xiaomi)} alt="" /><span>XiaoMi Mimo</span></span>
      <Switch checked disabled label="XiaoMi Mimo" onChange={() => {}} />
    </div>
    <div className="xmimo-tts-announcement-source">
      <span className="xmimo-tts-provider-settings-brand"><img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.doubao)} alt="" /><span>DouBao Seed</span></span>
      <Switch checked={doubaoEnabled} disabled={!providerWritable || (doubaoEnabled && !breezeEnabled)} label="DouBao Seed" onChange={next => onProviderEnabledChange('doubao', next)} />
    </div>
    <div className="xmimo-tts-announcement-source">
      <span className="xmimo-tts-more-provider-brand">
        <span className="xmimo-tts-breeze-wordmark" role="img" aria-label="Breeze Blue" style={{ '--xmimo-breeze-wordmark': `url(${hostRoute(TTS_BREEZE_WORDMARK_ASSET_ROUTE)})` } as CSSProperties} />
        <Tag tone="info" className="xmimo-tts-experimental-tag">{t('settings.experimental')}</Tag>
      </span>
      <Switch checked={breezeEnabled} disabled={!providerWritable || (breezeEnabled && !doubaoEnabled)} label={t('settings.breezeEnabled')} onChange={next => onProviderEnabledChange('breeze', next)} />
    </div>
    <div className="xmimo-tts-announcement-source">
      <span className="xmimo-tts-provider-settings-brand xmimo-tts-provider-settings-local">
        <img src={hostRoute(TTS_MOSS_LOGO_ASSET_ROUTE)} alt="" />
        <span>{t('settings.mossProvider')}</span>
        <Tag tone="info" className="xmimo-tts-experimental-tag">{t('settings.experimental')}</Tag>
      </span>
      <Switch checked={mossEnabled} disabled={!writable} label={t('settings.mossProvider')} onChange={onMossEnabledChange} />
    </div>
  </section>
}
