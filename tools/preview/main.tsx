import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SettingsCard } from '../../src/client/settings/card.js'
import { createSoundEffectsController } from '../../src/client/sound-effects/index.js'
import { CLIENT_STYLES } from '../../src/client/style/index.js'
import { en, zh, ja, fr } from '../../src/client/localization.js'
import type { LocaleKey, Translate } from '../../src/client/localization.js'
import pluginIcon from '../../assets/plugin-icons/avatar.webp'
import { installPreviewFetch, PreviewSettingsScope } from './mock-settings.js'
import { installPreviewHostIcons } from './host-icons.js'
import { PreviewBackground } from './background-icons.js'
import { UserManual } from './user-manual.js'
import { BundleComponents } from './bundle-components.js'
import { FilterLab } from './filter-lab.js'
import { TTS_VERSION } from '../../src/shared.js'
import enPluginLocale from '../../locale/en.json'
import zhPluginLocale from '../../locale/zh.json'
import jaPluginLocale from '../../locale/ja.json'
import frPluginLocale from '../../locale/fr.json'
import { ActivationGuide } from '../../src/client/settings/activation-guide.js'
import { AudioHistoryTab } from '../../src/client/history/audio-history-tab.js'
import { unrestrictedAudioFocus } from '../../src/client/playback/tab-audio-focus.js'
import './preview.css'
import { AudioHistory } from '../../src/client/history/audio-history.js'
import { ConversationPreview } from './conversation-preview.js'
import { VoiceReadingPreview } from './voice-reading-preview.js'
import { bindApiKeyStatus } from '../../src/client/settings/api-key-status-store.js'
import { PluginDetailPreview, previewPluginChanges } from './plugin-detail-preview.js'
import { PreviewNotice } from './preview-notice.js'

type PreviewLocale = 'zh' | 'en' | 'ja' | 'fr'
type PreviewTheme = 'light' | 'dark'

const TOOLBAR_COPY: Record<'zh' | 'en', {
  subtitle: string
  page: string
  language: string
  theme: string
  readOnly: string
  reset: string
  openManual: string
  closeManual: string
  controls: string
  closeControls: string
  light: string
  dark: string
  settingsTab: string
  filterTab: string
  previewNotice: string
  dismissPreviewNotice: string
}> = {
  zh: {
    subtitle: '真实组件 · Vite 热更新 · 本地模拟数据',
    page: '页面',
    language: '语言',
    theme: '主题',
    readOnly: '只读',
    reset: '重置',
    openManual: '打开设置手册',
    closeManual: '关闭设置手册',
    controls: '展开控制项',
    closeControls: '收起控制项',
    light: '浅色',
    dark: '深色',
    settingsTab: '设置预览',
    filterTab: '文本过滤测试',
    previewNotice: '当前为预览模式，所有修改（包括保存）均不会影响 DSH 设置。',
    dismissPreviewNotice: '关闭预览提示',
  },
  en: {
    subtitle: 'Real components · Vite HMR · local mock data',
    page: 'Page',
    language: 'Language',
    theme: 'Theme',
    readOnly: 'Read-only',
    reset: 'Reset',
    openManual: 'Open settings manual',
    closeManual: 'Close settings manual',
    controls: 'Open controls',
    closeControls: 'Close controls',
    light: 'Light',
    dark: 'Dark',
    settingsTab: 'Settings preview',
    filterTab: 'Text filter lab',
    previewNotice: 'You’re in preview mode. All changes, including saves, leave your DSH settings untouched.',
    dismissPreviewNotice: 'Dismiss preview notice',
  },
}

const PREVIEW_PLUGIN_META = {
  packageName: 'dsh-xiaomi-tts',
  locales: {
    zh: zhPluginLocale.meta,
    en: enPluginLocale.meta,
    ja: jaPluginLocale.meta,
    fr: frPluginLocale.meta,
  },
} as const

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
  const [theme, setTheme] = useState<PreviewTheme>('light')
  const [readOnly, setReadOnly] = useState(false)
  const [instance, setInstance] = useState(0)
  const [isToolbarCompact, setIsToolbarCompact] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [isControlsOpen, setIsControlsOpen] = useState(false)
  const [activeView, setActiveView] = useState<'settings' | 'filter' | 'history' | 'activation' | 'detail'>('settings')
  const lastScrollYRef = useRef(0)
  const toolbarRef = useRef<HTMLElement | null>(null)
  const manualToggleRef = useRef<HTMLButtonElement | null>(null)
  const controlsToggleRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const t = useMemo(() => translator(locale), [locale])
  const toolbar = TOOLBAR_COPY[locale === 'zh' ? 'zh' : 'en']
  const pluginMeta = PREVIEW_PLUGIN_META.locales[locale]

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : locale
    document.documentElement.dataset.theme = theme
  }, [locale, theme])

  useEffect(() => {
    const header = listRef.current?.querySelector<HTMLButtonElement>('.xmimo-tts-card-header')
    if (header?.getAttribute('aria-expanded') === 'false') header.click()
  }, [instance])

  useEffect(() => {
    const scrollTarget = document.scrollingElement ?? document.documentElement
    const updateToolbar = (): void => {
      const currentScrollY = scrollTarget.scrollTop
      if (window.innerWidth > 1080) {
        setIsToolbarCompact(false)
        setIsControlsOpen(false)
      } else if (currentScrollY <= 8) {
        setIsToolbarCompact(false)
      } else if (currentScrollY > lastScrollYRef.current) {
        setIsToolbarCompact(true)
        setIsControlsOpen(false)
      } else if (currentScrollY < lastScrollYRef.current) {
        setIsToolbarCompact(false)
      }
      lastScrollYRef.current = currentScrollY
    }

    updateToolbar()
    scrollTarget.addEventListener('scroll', updateToolbar, { passive: true })
    window.addEventListener('resize', updateToolbar)
    return () => {
      scrollTarget.removeEventListener('scroll', updateToolbar)
      window.removeEventListener('resize', updateToolbar)
    }
  }, [])

  useEffect(() => {
    if (!isControlsOpen) return

    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !toolbarRef.current?.contains(event.target)) {
        setIsControlsOpen(false)
      }
    }
    const closeWithEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setIsControlsOpen(false)
      controlsToggleRef.current?.focus()
    }

    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeWithEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeWithEscape)
    }
  }, [isControlsOpen])

  const toggleReadOnly = (next: boolean): void => {
    setReadOnly(next)
    scope.setWritable(!next)
  }

  const changeLocale = (next: PreviewLocale): void => {
    setLocale(next)
    setInstance((current) => current + 1)
  }

  const reset = (): void => {
    scope.reset()
    setReadOnly(false)
    setInstance((current) => current + 1)
  }

  return <div className="preview-shell">
    <PreviewBackground />
    <PreviewNotice message={toolbar.previewNotice} dismissLabel={toolbar.dismissPreviewNotice} />
    <header ref={toolbarRef} className={`preview-toolbar${isToolbarCompact ? ' preview-toolbar-compact' : ''}`}>
      <div className="preview-brand">
        <strong>MiMo TTS UI Lab</strong>
        <span>{toolbar.subtitle}</span>
      </div>
      <button
        ref={manualToggleRef}
        className="preview-manual-toggle"
        type="button"
        aria-expanded={isManualOpen}
        aria-controls="preview-manual-panel"
        aria-label={isManualOpen ? toolbar.closeManual : toolbar.openManual}
        title={isManualOpen ? toolbar.closeManual : toolbar.openManual}
        onClick={() => { setIsManualOpen((open) => !open) }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v15H6.5A1.5 1.5 0 0 0 5 20.5v-15Z" />
          <path d="M5 5.5v15M9 8h6M9 11h6M9 14h4" />
        </svg>
      </button>
      <button
        ref={controlsToggleRef}
        className="preview-controls-toggle"
        type="button"
        aria-expanded={isControlsOpen}
        aria-controls="preview-controls-panel"
        aria-label={isControlsOpen ? toolbar.closeControls : toolbar.controls}
        title={isControlsOpen ? toolbar.closeControls : toolbar.controls}
        onClick={() => { setIsControlsOpen((open) => !open) }}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="11" cy="17" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <div
        id="preview-controls-panel"
        className={`preview-controls${isControlsOpen ? ' preview-controls-open' : ''}`}
        role="group"
        aria-label={toolbar.controls}
      >
        <div className="preview-control-selects">
          <select aria-label={toolbar.page} value={activeView} onChange={(event) => { setActiveView(event.target.value as typeof activeView) }}>
            <option value="settings">{toolbar.settingsTab}</option>
            <option value="filter">{toolbar.filterTab}</option>
            <option value="history">{t('history.title')}</option>
            <option value="activation">{t('onboarding.title')}</option>
            <option value="detail">{t('detail.preview')}</option>
          </select>
          <select aria-label={toolbar.language} value={locale} onChange={(event) => { changeLocale(event.target.value as PreviewLocale) }}>
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
            <option value="fr">Français</option>
          </select>
          <select aria-label={toolbar.theme} value={theme} onChange={(event) => { setTheme(event.target.value as PreviewTheme) }}>
            <option value="light">{toolbar.light}</option>
            <option value="dark">{toolbar.dark}</option>
          </select>
        </div>
        <button className="preview-read-only-button" type="button" aria-pressed={readOnly} onClick={() => toggleReadOnly(!readOnly)}>
          <span className="preview-read-only-track" aria-hidden="true" />
          {toolbar.readOnly}
        </button>
        <button type="button" onClick={reset}>{toolbar.reset}</button>
      </div>
    </header>
    <main className={`preview-stage${activeView === 'filter' ? ' preview-stage-filter' : ''}`}>
      {activeView === 'detail' ? <PluginDetailPreview scope={scope} t={t} />
        : activeView === 'history' ? <AudioHistoryTab history={history} scope={scope} t={t} beforePlayback={() => {}} />
        : activeView === 'filter' ? <FilterLab locale={locale === 'zh' ? 'zh' : 'en'} /> :
      <div className={`preview-workspace${isManualOpen ? '' : ' preview-workspace-manual-closed'}`}>
        <UserManual
          locale={locale === 'zh' ? 'zh' : 'en'}
          isOpen={isManualOpen}
          onOpenChange={setIsManualOpen}
          onFocusToggle={() => { manualToggleRef.current?.focus() }}
        />
        <section className="preview-settings-pane" aria-label={locale === 'zh' ? '设置页预览' : 'Settings preview'}>
          <header className="preview-plugin-header">
            <img className="preview-plugin-icon" src={pluginIcon} alt="" aria-hidden="true" />
            <div className="preview-plugin-copy">
              <div className="preview-plugin-title-row">
                <h1>{pluginMeta.title}</h1>
                <span className="preview-plugin-version">v{TTS_VERSION}</span>
              </div>
              <code className="preview-plugin-name">{PREVIEW_PLUGIN_META.packageName}</code>
              <p>{pluginMeta.description}</p>
              <p className="preview-community">
                {locale === 'zh' ? 'QQ 交流群：' : 'QQ discussion group: '}
                <strong>1104616387</strong>
              </p>
            </div>
          </header>
          <ul className="preview-settings-list" ref={listRef} key={instance}>
             <SettingsCard view="page" scope={scope} t={t} controller={soundEffects} history={history} />
          </ul>
          <div className="preview-voice-reading">
            <VoiceReadingPreview scope={scope} t={t} />
          </div>
          <BundleComponents locale={locale === 'zh' ? 'zh' : 'en'} />
          <ConversationPreview scope={scope} />
        </section>
      </div>
      }
    </main>
    {activeView === 'activation' ? <ActivationGuide packageName="dsh-xiaomi-tts" scope={scope} t={t} audioFocus={unrestrictedAudioFocus} beforePreview={() => history.stopReplay()} onOpenDetails={() => setActiveView('settings')} onDismiss={() => setActiveView('settings')} /> : null}
    <style>{CLIENT_STYLES}</style>
  </div>
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Preview root element was not found')
createRoot(rootElement).render(<PreviewApp />)
