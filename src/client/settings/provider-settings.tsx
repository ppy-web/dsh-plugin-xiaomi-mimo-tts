import type { ReactElement } from 'react'
import { Switch, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiPlugLine } from 'react-icons/ri'
import { TTS_MOSS_LOGO_ASSET_ROUTE, TTS_PROVIDER_LOGO_ASSET_ROUTES } from '../../shared.js'
import { availableTtsProviders } from '../../types/providers.js'
import type { OptionalTtsProvider } from '../../types/providers.js'
import type { Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { FieldInfo } from './controls/field-info.js'
import { SettingFieldHeading } from './field-heading.js'
import { SPEECH_PROVIDER_ADAPTER_URL } from './plugin-links.js'
import type { SearchSetting } from './settings-search.js'

export interface ProviderSettingsProps {
  t: Translate
  writable: boolean
  providerLocked?: boolean
  doubaoEnabled: boolean
  breezeEnabled: boolean
  deepseekEnabled?: boolean
  mossEnabled: boolean
  acceptExternalProviders: boolean
  onAcceptExternalProvidersChange: (enabled: boolean) => void
  visibleSettings?: ReadonlySet<SearchSetting> | undefined
  onMossEnabledChange: (enabled: boolean) => void
  onProviderEnabledChange: (provider: OptionalTtsProvider, enabled: boolean) => void
}

export function ProviderSettings({
  t, writable, providerLocked = false, doubaoEnabled, breezeEnabled, deepseekEnabled = false,
  mossEnabled, onMossEnabledChange, onProviderEnabledChange, visibleSettings,
  acceptExternalProviders, onAcceptExternalProvidersChange,
}: ProviderSettingsProps): ReactElement {
  const providerWritable = writable && !providerLocked
  const count = availableTtsProviders(doubaoEnabled, breezeEnabled, deepseekEnabled).length
  const locked = (enabled: boolean): boolean => !providerWritable || (enabled ? count <= 2 : count >= 3)
  const hide = (...ids: SearchSetting[]): boolean => visibleSettings !== undefined && !ids.some(id => visibleSettings.has(id))
  const showLimit = count >= 3 && providerWritable && !hide('doubaoEnabled', 'breezeEnabled', 'deepseekEnabled')
  return <section className="xmimo-tts-format xmimo-tts-provider-settings xmimo-tts-switch-grid" aria-label={t('settings.provider')} hidden={hide('xiaomiEnabled', 'doubaoEnabled', 'breezeEnabled', 'deepseekEnabled', 'mossEnabled', 'settings.acceptExternalProviders')}>
    <SettingFieldHeading label={t('settings.provider')} suffix={<>
      <FieldInfo label={t('settings.provider')} text={t('settings.providerMinimum')} />
      <a className="xmimo-tts-api-key-link" href={SPEECH_PROVIDER_ADAPTER_URL} target="_blank" rel="noopener noreferrer">{t('settings.externalProviderAdapter')} ↗</a>
    </>} resettable={false} disabled={!writable} />
    <div className="xmimo-tts-announcement-source" hidden={hide('xiaomiEnabled')}>
      <span className="xmimo-tts-provider-settings-brand"><img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.xiaomi)} alt="" /><span>XiaoMi Mimo</span></span>
      <Switch checked disabled label="XiaoMi Mimo" onChange={() => {}} />
    </div>
    <div className="xmimo-tts-announcement-source" hidden={hide('doubaoEnabled')}>
      <span className="xmimo-tts-provider-settings-brand"><img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.doubao)} alt="" /><span>DouBao Seed</span></span>
      <Switch checked={doubaoEnabled} disabled={locked(doubaoEnabled)} label="DouBao Seed" onChange={next => onProviderEnabledChange('doubao', next)} />
    </div>
    <div className="xmimo-tts-announcement-source" hidden={hide('breezeEnabled')}>
      <span className="xmimo-tts-provider-settings-brand">
        <img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.breeze)} alt="" /><span>Breeze Blue</span>
        <Tag tone="info" className="xmimo-tts-experimental-tag">{t('settings.experimental')}</Tag>
      </span>
      <Switch checked={breezeEnabled} disabled={locked(breezeEnabled)} label={t('settings.breezeEnabled')} onChange={next => onProviderEnabledChange('breeze', next)} />
    </div>
    <div className="xmimo-tts-announcement-source" hidden={hide('deepseekEnabled')}>
      <span className="xmimo-tts-provider-settings-brand"><img src={hostRoute(TTS_PROVIDER_LOGO_ASSET_ROUTES.deepseek)} alt="" /><span>DeepSeek</span></span>
      <Switch checked={deepseekEnabled} disabled={locked(deepseekEnabled)} label={t('settings.deepseekEnabled')} onChange={next => onProviderEnabledChange('deepseek', next)} />
    </div>
    {showLimit ? <small role="status">{t('settings.providerLimit')}</small> : null}
    <div className="xmimo-tts-announcement-source" hidden={hide('mossEnabled')}>
      <span className="xmimo-tts-provider-settings-brand xmimo-tts-provider-settings-local">
        <img src={hostRoute(TTS_MOSS_LOGO_ASSET_ROUTE)} alt="" />
        <span>{t('settings.mossProvider')}</span>
        <Tag tone="info" className="xmimo-tts-experimental-tag">{t('settings.experimental')}</Tag>
      </span>
      <Switch checked={mossEnabled} disabled={!writable} label={t('settings.mossProvider')} onChange={onMossEnabledChange} />
    </div>
    <div className="xmimo-tts-announcement-source" hidden={hide('settings.acceptExternalProviders')}>
      <RiPlugLine className="xmimo-tts-provider-plug" size={24} aria-hidden="true" focusable="false" />
      <div className="xmimo-tts-external-provider-copy">
        <span>{t('settings.acceptExternalProviders')}</span>
        <small>{t('settings.acceptExternalProvidersHint')}</small>
      </div>
      <Switch checked={acceptExternalProviders} disabled={!writable} label={t('settings.acceptExternalProviders')} onChange={onAcceptExternalProvidersChange} />
    </div>
  </section>
}
