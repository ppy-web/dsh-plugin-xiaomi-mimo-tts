import { LuSettings2, LuVolume2, LuMessageSquare, LuInfo, LuPackage, LuBookOpen, LuTextSearch, LuSparkles, LuArrowUpRight, LuX, LuMessagesSquare, LuCpu, LuAudioLines, LuWind, LuRadio } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { PreviewCopy, PreviewView } from './preview-copy.js'
import pluginIcon from '../../assets/plugin-icons/avatar.webp'
import { TTS_VERSION } from '../../src/shared.js'
import { SOURCE_URL } from '../../src/client/settings/plugin-links.js'

const GROUPS: { label: 'speech' | 'plugin' | 'help'; items: { view: PreviewView; icon: IconType }[] }[] = [
  { label: 'speech', items: [{ view: 'settings', icon: LuSettings2 }, { view: 'voice', icon: LuVolume2 }, { view: 'conversation', icon: LuMessageSquare }] },
  { label: 'plugin', items: [{ view: 'detail', icon: LuInfo }, { view: 'components', icon: LuPackage }] },
  { label: 'help', items: [{ view: 'filter', icon: LuTextSearch }, { view: 'manual', icon: LuBookOpen }, { view: 'qqbot', icon: LuMessagesSquare }, { view: 'xiaomi', icon: LuCpu }, { view: 'doubao', icon: LuAudioLines }, { view: 'breeze', icon: LuWind }, { view: 'passport', icon: LuRadio }] },
]

interface PreviewSidebarProps {
  voiceSettingsLabel?: string | undefined
  showInHostSettings: boolean
  copy: PreviewCopy
  activeView: PreviewView
  onNavigate: () => void
  onActivation: () => void
  onClose?: () => void
}

export function PreviewSidebar({ copy, activeView, onNavigate, onActivation, onClose, voiceSettingsLabel, showInHostSettings }: PreviewSidebarProps) {
  return <div className="preview-sidebar-content">
    <div className="preview-workspace-brand">
      <img src={pluginIcon} alt="" width={36} height={36} />
      <div className="preview-sidebar-label"><strong>{copy.pages.workbench.title}</strong><span>{copy.workspace}</span></div>
      {onClose ? <button type="button" className="preview-icon-button" aria-label={copy.closeNavigation} onClick={onClose}><LuX /></button> : null}
    </div>
    <nav aria-label={copy.navigation} className="preview-navigation">
      {voiceSettingsLabel ? <div className="preview-nav-group"><ul><li><a href="#workbench" title={voiceSettingsLabel} aria-current={activeView === 'workbench' ? 'page' : undefined} onClick={onNavigate}><LuVolume2 aria-hidden="true" /><span className="preview-sidebar-label">{voiceSettingsLabel}</span></a></li></ul></div> : null}
      {GROUPS.map(group => <div className="preview-nav-group" key={group.label}>
        <p className="preview-nav-group-label">{copy[group.label]}</p>
        <ul>
          {group.items.filter(({ view }) => view !== 'voice' || showInHostSettings).map(({ view, icon: Icon }) => <li key={view}>
            <a href={`#${view}`} onClick={onNavigate} aria-current={view === activeView ? 'page' : undefined} title={copy.pages[view].title}>
              <Icon aria-hidden="true" /><span className="preview-sidebar-label">{copy.pages[view].title}</span>
            </a>
          </li>)}
          {group.label === 'plugin' ? <li><button type="button" onClick={onActivation} aria-haspopup="dialog" title={copy.activation}>
            <LuSparkles aria-hidden="true" /><span className="preview-sidebar-label">{copy.activation}</span><LuArrowUpRight className="preview-nav-trailing" aria-hidden="true" />
          </button></li> : null}
        </ul>
      </div>)}
    </nav>
    <div className="preview-sidebar-bottom">
      <a href={SOURCE_URL} className="preview-source-link" target="_blank" rel="noopener noreferrer" title={copy.source}><span className="preview-sidebar-label">{copy.source}</span><span className="preview-version">v{TTS_VERSION}</span></a>
      <p className="preview-sidebar-notice">{copy.notice}</p>
    </div>
  </div>
}
