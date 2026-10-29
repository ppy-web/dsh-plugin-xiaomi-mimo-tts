import { LuSettings2, LuVolume2, LuMessageSquare, LuHistory, LuInfo, LuPackage, LuBookOpen, LuTextSearch, LuSparkles, LuRotateCcw, LuGithub, LuArrowUpRight, LuX } from 'react-icons/lu'
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import type { IconType } from 'react-icons'
import type { PreviewCopy, PreviewView } from './preview-copy.js'
import pluginIcon from '../../assets/plugin-icons/avatar.webp'
import { TTS_VERSION } from '../../src/shared.js'
import { SOURCE_URL } from '../../src/client/settings/plugin-links.js'

const GROUPS: { label: 'speech' | 'plugin' | 'help'; items: { view: PreviewView; icon: IconType }[] }[] = [
  { label: 'speech', items: [{ view: 'settings', icon: LuSettings2 }, { view: 'voice', icon: LuVolume2 }, { view: 'conversation', icon: LuMessageSquare }, { view: 'history', icon: LuHistory }] },
  { label: 'plugin', items: [{ view: 'detail', icon: LuInfo }, { view: 'components', icon: LuPackage }] },
  { label: 'help', items: [{ view: 'filter', icon: LuTextSearch }, { view: 'manual', icon: LuBookOpen }] },
]

interface PreviewSidebarProps {
  copy: PreviewCopy
  activeView: PreviewView
  readOnly: boolean
  onReadOnlyChange: (value: boolean) => void
  onNavigate: () => void
  onActivation: () => void
  onReset: () => void
  onClose?: () => void
}

export function PreviewSidebar({ copy, activeView, readOnly, onReadOnlyChange, onNavigate, onActivation, onReset, onClose }: PreviewSidebarProps) {
  return <div className="preview-sidebar-content">
    <div className="preview-workspace-brand">
      <img src={pluginIcon} alt="" width={36} height={36} />
      <div className="preview-sidebar-label"><strong>MiMo & Seed TTS</strong><span>{copy.workspace}</span></div>
      {onClose ? <button type="button" className="preview-icon-button" aria-label={copy.closeNavigation} onClick={onClose}><LuX /></button> : null}
    </div>
    <nav aria-label={copy.navigation} className="preview-navigation">
      {GROUPS.map(group => <div className="preview-nav-group" key={group.label}>
        <p className="preview-nav-group-label">{copy[group.label]}</p>
        <ul>
          {group.items.map(({ view, icon: Icon }) => <li key={view}>
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
      <details className="preview-environment" open={onClose === undefined}>
        <summary className="preview-nav-group-label">{copy.environment}</summary>
        <label className="preview-readonly-row"><span>{copy.readOnly}</span><Switch checked={readOnly} onChange={onReadOnlyChange} label={copy.readOnly} /></label>
        <button type="button" className="preview-reset-button" onClick={onReset} title={copy.reset}><LuRotateCcw aria-hidden="true" /><span>{copy.reset}</span></button>
      </details>
      <a href={SOURCE_URL} className="preview-source-link" target="_blank" rel="noopener noreferrer" title={copy.source}><LuGithub aria-hidden="true" /><span className="preview-sidebar-label">{copy.source}</span><span className="preview-version">v{TTS_VERSION}</span></a>
      <p className="preview-sidebar-notice">{copy.notice}</p>
    </div>
  </div>
}
