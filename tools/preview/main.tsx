import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { LuPanelLeft, LuSun, LuMoon, LuChevronRight } from 'react-icons/lu'
import { BundleSettingsCard } from '../../src/client/settings/bundle-settings.js'
import { VoiceSettingsPage } from '../../src/client/settings/voice-settings-page.js'
import { PluginDetailActions } from '../../src/client/settings/plugin-detail.js'
import { createSoundEffectsController } from '../../src/client/sound-effects/index.js'
import { CLIENT_STYLES } from '../../src/client/style/index.js'
import { en, zh, ja, fr } from '../../src/client/localization.js'
import type { LocaleKey, Translate } from '../../src/client/localization.js'
import pluginIcon from '../../assets/plugin-icons/avatar.webp'
import { installPreviewFetch, PreviewSettingsScope } from './mock-settings.js'
import { installPreviewHostIcons } from './host-icons.js'
import { UserManual } from './user-manual.js'
import { DocumentPage } from './document-page.js'
import { QQBOT_GUIDE } from './qqbot-guide.js'
import { DOUBAO_GUIDE } from './doubao-guide.js'
import { XIAOMI_GUIDE } from './xiaomi-guide.js'
import { BREEZE_GUIDE } from './breeze-guide.js'
import { PASSPORT_GUIDE } from './passport-guide.js'
import { BundleComponents } from './bundle-components.js'
import { FilterLab } from './filter-lab.js'
import { useSettingsSnapshot } from '../../src/client/settings/scope.js'
import { TTS_VERSION } from '../../src/shared.js'
import { ActivationGuide } from '../../src/client/settings/activation-guide.js'
import { unrestrictedAudioFocus } from '../../src/client/playback/tab-audio-focus.js'
import { AudioHistory } from '../../src/client/history/audio-history.js'
import { ConversationPreview } from './conversation-preview.js'
import { VoiceReadingPreview } from './voice-reading-preview.js'
import { bindApiKeyStatus } from '../../src/client/settings/api-key-status-store.js'
import { PluginDetailPreview, previewPluginChanges, PREVIEW_PLUGIN_SUBJECT } from './plugin-detail-preview.js'
import { PREVIEW_COPY, previewDocumentSectionId, previewViewFromHash } from './preview-copy.js'
import type { PreviewLocale, PreviewView } from './preview-copy.js'
import { PreviewSidebar } from './preview-sidebar.js'
import { VoiceReadingSelect } from '../../src/client/settings/voice-reading-select.js'
import { engineStateStore } from '../../src/client/engine-state.js'
import './preview.css'
import './preview-shell.css'

const scope = new PreviewSettingsScope()
// Development-only takeover fixture; production activation belongs to the external Host plugin.
const externalDemo = new URL(window.location.href).searchParams.get('external')
const adapterDemo = externalDemo === 'adapter'
engineStateStore.accept({ provider: externalDemo ? 'external:demo-tone' : 'xiaomi', revision: 1,
  name: adapterDemo ? 'SenseAudio · 预览演示' : externalDemo ? '外部测试音（非语音）' : 'xiaomi', ready: externalDemo !== 'unready',
  formats: externalDemo ? ['wav'] : ['mp3', 'wav'], maxTextLength: externalDemo ? 1000 : 12000, streaming: externalDemo === 'pcm',
  ...(adapterDemo ? { configurable: true, configurationId: 'senseaudio',
    selection: { model: 'sensenova-tts-2.0', voice: 'female_0033_b', speechInstruction: '' },
    models: ['sensenova-tts-2.0', 'senseaudio-tts-1.5-260319'].map(id => ({ id, name: id, streaming: false, speechInstruction: false,
      voices: [{ id: 'female_0033_b', name: '女声 · 预览演示' }, { id: 'male_0004_a', name: '男声 · 预览演示' }], audioTags: [{ value: '<break time=500>', name: 'Pause' }] })) } : {}) })
const restorePreviewFetch = installPreviewFetch(scope)
const restorePreviewHostIcons = installPreviewHostIcons()
const unbindApiKeyStatus = bindApiKeyStatus(scope, previewPluginChanges)
const soundEffects = createSoundEffectsController()
const history = new AudioHistory()
const localeOptions = [
  { id: 'zh', label: '中文' }, { id: 'en', label: 'English' },
  { id: 'ja', label: '日本語' }, { id: 'fr', label: 'Français' },
] as const

if (import.meta.hot) import.meta.hot.dispose(() => { unbindApiKeyStatus(); restorePreviewFetch(); restorePreviewHostIcons(); void soundEffects.dispose(); void history.dispose() })

function translator(locale: PreviewLocale): Translate {
  const dictionary: Record<LocaleKey, string> = { zh, en, ja, fr }[locale]
  return (key) => dictionary[key]
}

function PreviewApp() {
  const [locale, setLocale] = useState<PreviewLocale>('zh')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
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
    document.title = `${page.title} · ${t('settings.voiceSettingsNav')}`
  }, [locale, theme, page.title, t])

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
    if (previewDocumentSectionId(window.location.hash)) return
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

  const openActivation = (): void => { setNavigationOpen(false); setActivationOpen(true) }
  const savedSettings = useSettingsSnapshot(scope)
  const openWorkbench = (): void => { window.location.hash = 'workbench' }
  const settingsPageProps = { scope, t, controller: soundEffects, history,
    onSidebarChange: (mounted: boolean) => { window.location.hash = mounted ? 'workbench' : 'detail' },
  }
  const sidebarProps = {
    voiceSettingsLabel: savedSettings.value?.showInSidebar ? t('settings.voiceSettingsNav') : undefined,
    showInHostSettings: savedSettings.value?.showInHostSettings !== false,
    copy, activeView,
    onNavigate: () => setNavigationOpen(false), onActivation: openActivation,
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
          <div className="preview-locale-select">
            <VoiceReadingSelect label={copy.language} value={locale} options={localeOptions} disabled={false}
              onSelect={id => setLocale(id as PreviewLocale)} />
          </div>
          <button type="button" className="preview-icon-button" title={theme === 'light' ? copy.darkTheme : copy.lightTheme} aria-label={theme === 'light' ? copy.darkTheme : copy.lightTheme}
            onClick={() => setTheme(current => current === 'light' ? 'dark' : 'light')}>{theme === 'light' ? <LuMoon aria-hidden="true" /> : <LuSun aria-hidden="true" />}</button>
        </div>
      </header>
      <main className="preview-canvas" id="preview-main">
        <div className="preview-page">
          {activeView !== 'workbench' ? <header className="preview-page-heading">
            <h1 ref={headingRef} tabIndex={-1}>{page.title}</h1><p>{page.description}</p>
          </header> : null}
          <div className="preview-page-body">
            {activeView === 'settings' ? <div className="preview-plugin-surface">
              <div className="preview-surface-heading"><img src={pluginIcon} alt="" width={36} height={36} /><div><strong>{t('settings.voiceSettingsNav')}</strong><span>dsh-xiaomi-tts</span></div><span className="preview-surface-version">v{TTS_VERSION}</span></div>
              <PluginDetailActions subject={PREVIEW_PLUGIN_SUBJECT} scope={scope} t={t} onOpenWorkbench={openWorkbench} />
              <BundleSettingsCard {...settingsPageProps} view="page" />
            </div>
              : activeView === 'workbench' ? <VoiceSettingsPage {...settingsPageProps} onOpenPluginSettings={() => { window.location.hash = 'detail' }} />
              : activeView === 'voice' ? <div className="preview-voice-surface"><VoiceReadingPreview scope={scope} t={t} onOpenPluginSettings={() => { window.location.hash = 'settings' }} /></div>
              : activeView === 'conversation' ? <ConversationPreview scope={scope} />
              : activeView === 'detail' ? <PluginDetailPreview scope={scope} t={t} settingsProps={settingsPageProps} onOpenWorkbench={openWorkbench} />
              : activeView === 'components' ? <BundleComponents locale={locale === 'zh' ? 'zh' : 'en'} />
              : activeView === 'filter' ? <FilterLab locale={locale === 'zh' ? 'zh' : 'en'} />
              : activeView === 'qqbot' ? <DocumentPage key="qqbot" copy={QQBOT_GUIDE[locale === 'zh' ? 'zh' : 'en']} />
              : activeView === 'doubao' ? <DocumentPage key="doubao" copy={DOUBAO_GUIDE[locale === 'zh' ? 'zh' : 'en']} />
              : activeView === 'xiaomi' ? <DocumentPage key="xiaomi" copy={XIAOMI_GUIDE[locale === 'zh' ? 'zh' : 'en']} />
              : activeView === 'breeze' ? <DocumentPage key="breeze" copy={BREEZE_GUIDE[locale === 'zh' ? 'zh' : 'en']} />
              : activeView === 'passport' ? <DocumentPage key="passport" copy={PASSPORT_GUIDE[locale === 'zh' ? 'zh' : 'en']} />
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
