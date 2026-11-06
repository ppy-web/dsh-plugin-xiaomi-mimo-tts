import type { ReactElement } from 'react'
import { LuBookOpen, LuSettings } from 'react-icons/lu'
import { AiFillGithub } from 'react-icons/ai'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { SettingsCard } from './card.js'
import type { SettingsCardProps } from './card.js'
import { MANUAL_URL, SOURCE_URL } from './plugin-links.js'
import { QqGroupAction } from './voice-reading-links.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from '../../shared.js'
import { hostRoute } from '../host-route.js'

export type VoiceSettingsPageProps = Omit<SettingsCardProps, 'view'> & { onOpenPluginSettings: () => void }

/** Shared settings and playback services inside the host's independent main panel. */
export function VoiceSettingsPage(props: VoiceSettingsPageProps): ReactElement {
  return <section className="xmimo-ui-scope xmimo-tts-settings-page" aria-label={props.t('settings.voiceSettingsNav')}>
    <div className="xmimo-tts-settings-page-content">
      <header className="xmimo-tts-settings-page-header">
        <div className="xmimo-tts-settings-page-identity">
          <div className="xmimo-tts-settings-page-icon">
            <img src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)} width={56} height={56} alt="" />
          </div>
          <div className="xmimo-tts-settings-page-heading">
            <h1>
              <span className="xmimo-tts-settings-page-title">{props.t('settings.voiceSettingsNav')}</span>
              <span className="xmimo-tts-settings-page-wave" aria-hidden="true">
                <span /><span /><span /><span /><span />
              </span>
            </h1>
            <p>{props.t('settings.voiceSettingsDescription')}</p>
          </div>
        </div>
        <div className="xmimo-voice-reading-actions xmimo-tts-settings-page-actions">
          <Tooltip label={props.t('settings.pluginDetails')} side="bottom" align="end" portal>
            <button type="button" className="xmimo-voice-reading-action" aria-label={props.t('settings.pluginDetails')} onClick={props.onOpenPluginSettings}>
              <LuSettings size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label={props.t('detail.manual')} side="bottom" align="end" portal>
            <a className="xmimo-voice-reading-action" href={MANUAL_URL} target="_blank" rel="noopener noreferrer" aria-label={props.t('detail.manual')}>
              <LuBookOpen size={16} aria-hidden="true" />
            </a>
          </Tooltip>
          <QqGroupAction t={props.t} />
          <Tooltip label={props.t('settings.voiceReadingSource')} side="bottom" align="end" portal>
            <a className="xmimo-voice-reading-action" href={SOURCE_URL} target="_blank" rel="noopener noreferrer" aria-label={props.t('settings.voiceReadingSource')}>
              <AiFillGithub size={16} aria-hidden="true" focusable="false" />
            </a>
          </Tooltip>
        </div>
      </header>
      <SettingsCard {...props} view="page" initialPanel="mixer" />
    </div>
  </section>
}
