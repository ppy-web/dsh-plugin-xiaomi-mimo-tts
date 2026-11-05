import type { ReactElement } from 'react'
import { LuBookOpen, LuSettings } from 'react-icons/lu'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { SettingsCard } from './card.js'
import type { SettingsCardProps } from './card.js'
import { MANUAL_URL } from './plugin-links.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../../shared.js'
import { hostRoute } from '../host-route.js'

export type VoiceSettingsPageProps = Omit<SettingsCardProps, 'view'> & { onOpenPluginSettings: () => void }

/** Shared settings and playback services inside the host's independent main panel. */
export function VoiceSettingsPage(props: VoiceSettingsPageProps): ReactElement {
  return <section className="xmimo-ui-scope xmimo-tts-settings-page" aria-label={props.t('settings.voiceSettingsNav')}>
    <div className="xmimo-tts-settings-page-content">
      <header className="xmimo-tts-settings-page-header">
        <h1><img src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)} width={32} height={32} alt="" />{props.t('settings.voiceSettingsNav')}</h1>
        <div className="xmimo-tts-settings-page-actions">
          <Button type="button" variant="ghost" size="sm" className="xmimo-tts-action-button" onClick={props.onOpenPluginSettings}>
            <LuSettings size={12} aria-hidden="true" />{props.t('settings.pluginDetails')}
          </Button>
          <a className="xmimo-tts-action-button" href={MANUAL_URL} target="_blank" rel="noopener noreferrer">
            <LuBookOpen size={12} aria-hidden="true" />{props.t('detail.manual')}
          </a>
        </div>
      </header>
      <SettingsCard {...props} view="page" initialPanel="mixer" />
    </div>
  </section>
}
