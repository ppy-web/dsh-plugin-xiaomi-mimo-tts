import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { LuPanelLeft, LuSun, LuMoon, LuChevronRight } from 'react-icons/lu'
import { SettingsCard } from '../../src/client/settings/card.js'
import { createSoundEffectsController } from '../../src/client/sound-effects/index.js'
import { CLIENT_STYLES } from '../../src/client/style/index.js'
import { en, zh, ja, fr } from '../../src/client/localization.js'
import type { LocaleKey, Translate } from '../../src/client/localization.js'
import pluginIcon from '../../assets/plugin-icons/avatar.webp'
import { installPreviewFetch, PreviewSettingsScope } from './mock-settings.js'
import { installPreviewHostIcons } from './host-icons.js'
import { UserManual } from './user-manual.js'
import { BundleComponents } from './bundle-components.js'
import { FilterLab } from './filter-lab.js'
import { TTS_VERSION } from '../../src/shared.js'
import { ActivationGuide } from '../../src/client/settings/activation-guide.js'
import { AudioHistoryTab } from '../../src/client/history/audio-history-tab.js'
import { unrestrictedAudioFocus } from '../../src/client/playback/tab-audio-focus.js'
import { AudioHistory } from '../../src/client/history/audio-history.js'
import { ConversationPreview } from './conversation-preview.js'
import { VoiceReadingPreview } from './voice-reading-preview.js'
import { bindApiKeyStatus } from '../../src/client/settings/api-key-status-store.js'
import { PluginDetailPreview, previewPluginChanges } from './plugin-detail-preview.js'
import { PREVIEW_COPY, previewViewFromHash } from './preview-copy.js'
import type { PreviewLocale, PreviewView } from './preview-copy.js'
import { PreviewSidebar } from './preview-sidebar.js'
import './preview.css'
import './preview-shell.css'

const scope = new PreviewSettingsScope()
const restorePreviewFetch = installPreviewFetch(scope)
const restorePreviewHostIcons = installPreviewHostIcons()
const unbindApiKeyStatus = bindApiKeyStatus(scope, previewPluginChanges)
const soundEffects = createSoundEffectsController()
const history = new AudioHistory()

if (import.meta.hot) import.meta.hot.dispose(() => { unbindApiKeyStatus(); restorePreviewFetch(); restorePreviewHostIcons(); void soundEffects.dispose(); void history.dispose() })

function translator(locale: PreviewLocale): Translate {
  const dictionary: Record<LocaleKey, string> = { zh, en, ja, fr }[locale]
  return (key) => dictionary[key]
}

function PreviewApp() {
  const [locale, setLocale] = useState<PreviewLocale>('zh')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [readOnly, setReadOnly] = useState(false)
  const [instance, setInstance] = useState(0)
  const [activeView, setActiveView] = useState<PreviewView>(() => previewViewFromHash(window.location.hash))
  const [collapsed, setCollapsed] = useState(false)
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 1023px)').matches)
  const [navigationOpen, setNavigationOpen] = useState(false)
  const [activationOpen, setActivationOpen] = useState(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const t = useMemo(() => translator(locale), [locale])
  const copy = PREVIEW_COPY[locale]
  const page = copy.pages[activeView]

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale
    document.documentElement.dataset.theme = theme
    document.title = `${page.title} · MiMo & Seed TTS`
  }, [locale, theme, page.title])

  useEffect(() => {
    const navigate = (): void => {
      setActiveView(previewViewFromHash(window.location.hash))
      setNavigationOpen(false)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])

  useEffect(() => { history.stopReplay() }, [activeView])

  useLayoutEffect(() => {
    if (window.location.hash.startsWith('#manual-')) return
    window.scrollTo({ top: 0 })
    headingRef.current?.focus({ preventScroll: true })
  }, [activeView])

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')
    const update = (): void => {
      setMobile(query.matches)
      if (!query.matches) setNavigationOpen(false)
    }
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  const toggleReadOnly = (next: boolean): void => {
    setReadOnly(next)
    scope.setWritable(!next)
  }
  const reset = (): void => {
    scope.reset()
    setReadOnly(false)
    setInstance(current => current + 1)
  }
  const openActivation = (): void => { setNavigationOpen(false); setActivationOpen(true) }
  const sidebarProps = {
    copy, activeView, readOnly, onReadOnlyChange: toggleReadOnly,
    onNavigate: () => setNavigationOpen(false), onActivation: openActivation, onReset: reset,
  }

  return <div className="preview-app" data-collapsed={collapsed && !mobile}>
    <a className="preview-skip-link" href="#preview-main" onClick={event => { event.preventDefault(); headingRef.current?.focus() }}>{copy.skipContent}</a>
    <aside className="preview-sidebar" id="preview-sidebar" hidden={mobile}>
      <PreviewSidebar {...sidebarProps} />
    </aside>
    <div className="preview-main-column">
      <header className="preview-topbar">
        <div className="preview-topbar-location">
          <button type="button" className="preview-icon-button" aria-label={copy.toggleNavigation}
            aria-expanded={mobile ? navigationOpen : !collapsed} aria-controls={mobile ? 'preview-mobile-navigation' : 'preview-sidebar'}
            onClick={() => mobile ? setNavigationOpen(open => !open) : setCollapsed(value => !value)}><LuPanelLeft aria-hidden="true" /></button>
          <nav aria-label={copy.workspace} className="preview-breadcrumb"><ol>
            <li className="preview-breadcrumb-root">{copy.workspace}</li><li className="preview-breadcrumb-root" aria-hidden="true"><LuChevronRight /></li>
            <li aria-current="page">{page.title}</li>
          </ol></nav>
        </div>
        <div className="preview-topbar-actions">
          <select className="preview-locale-select" aria-label={copy.language} value={locale} onChange={event => { setLocale(event.target.value as PreviewLocale) }}>
            <option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option><option value="fr">Français</option>
          </select>
          <button type="button" className="preview-icon-button" title={theme === 'light' ? copy.darkTheme : copy.lightTheme} aria-label={theme === 'light' ? copy.darkTheme : copy.lightTheme}
            onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <LuMoon aria-hidden="true" /> : <LuSun aria-hidden="true" />}</button>
        </div>
      </header>
      <main className="preview-canvas" id="preview-main">
        <div className="preview-page">
          <header className="preview-page-heading">
            <h1 ref={headingRef} tabIndex={-1}>{page.title}</h1><p>{page.description}</p>
          </header>
          <div className="preview-page-body" key={instance}>
            {activeView === 'settings' ? <div className="preview-plugin-surface">
              <div className="preview-surface-heading"><img src={pluginIcon} alt="" width={36} height={36} /><div><strong>MiMo & Seed TTS</strong><span>dsh-xiaomi-tts</span></div><span className="preview-surface-version">v{TTS_VERSION}</span></div>
              <SettingsCard view="page" scope={scope} t={t} controller={soundEffects} history={history} />
            </div>
              : activeView === 'voice' ? <div className="preview-voice-surface"><VoiceReadingPreview scope={scope} t={t} onOpenPluginSettings={() => { window.location.hash = 'settings' }} /></div>
              : activeView === 'conversation' ? <ConversationPreview scope={scope} />
              : activeView === 'history' ? <AudioHistoryTab history={history} scope={scope} t={t} beforePlayback={() => {}} />
              : activeView === 'detail' ? <PluginDetailPreview scope={scope} t={t} />
              : activeView === 'components' ? <BundleComponents locale={locale === 'zh' ? 'zh' : 'en'} />
              : activeView === 'filter' ? <FilterLab locale={locale === 'zh' ? 'zh' : 'en'} />
              : <UserManual locale={locale === 'zh' ? 'zh' : 'en'} />}
          </div>
        </div>
      </main>
    </div>
    {mobile && navigationOpen ? <Modal open headless title={copy.navigation} onClose={() => setNavigationOpen(false)} className="preview-mobile-sidebar">
      <div id="preview-mobile-navigation"><PreviewSidebar {...sidebarProps} onClose={() => setNavigationOpen(false)} /></div>
    </Modal> : null}
    {activationOpen ? <ActivationGuide packageName="dsh-xiaomi-tts" scope={scope} t={t} audioFocus={unrestrictedAudioFocus} beforePreview={() => history.stopReplay()}
      onOpenDetails={() => { setActivationOpen(false); window.location.hash = 'settings' }} onDismiss={() => setActivationOpen(false)} /> : null}
    <style>{CLIENT_STYLES}</style>
  </div>
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Preview root element was not found')
createRoot(rootElement).render(<PreviewApp />)
