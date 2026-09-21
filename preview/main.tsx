import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SettingsCard } from '../src/client/settings/card.js'
import { createSoundEffectsController } from '../src/client/sound-effects/index.js'
import { CLIENT_STYLES } from '../src/client/style/index.js'
import { en, zh } from '../src/client/localization.js'
import type { LocaleKey, Translate } from '../src/client/localization.js'
import { installPreviewFetch, PreviewSettingsScope } from './mock-settings.js'
import { PreviewBackground } from './background-icons.js'
import { UserManual } from './user-manual.js'
import { TTS_VERSION } from '../src/shared.js'
import './preview.css'

type PreviewLocale = 'zh' | 'en'
type PreviewTheme = 'light' | 'dark'

const TOOLBAR_COPY: Record<PreviewLocale, {
  subtitle: string
  language: string
  theme: string
  readOnly: string
  reset: string
  playSong: string
  pauseSong: string
  volume: string
  openManual: string
  closeManual: string
  controls: string
  closeControls: string
  light: string
  dark: string
}> = {
  zh: {
    subtitle: '真实组件 · Vite 热更新 · 本地模拟数据',
    language: '语言',
    theme: '主题',
    readOnly: '只读',
    reset: '重置状态',
    playSong: '播放歌曲',
    pauseSong: '暂停歌曲',
    volume: '音量',
    openManual: '打开设置手册',
    closeManual: '关闭设置手册',
    controls: '展开控制项',
    closeControls: '收起控制项',
    light: '浅色',
    dark: '深色',
  },
  en: {
    subtitle: 'Real components · Vite HMR · local mock data',
    language: 'Language',
    theme: 'Theme',
    readOnly: 'Read-only',
    reset: 'Reset state',
    playSong: 'Play song',
    pauseSong: 'Pause song',
    volume: 'Volume',
    openManual: 'Open settings manual',
    closeManual: 'Close settings manual',
    controls: 'Open controls',
    closeControls: 'Close controls',
    light: 'Light',
    dark: 'Dark',
  },
}

const PREVIEW_PLUGIN_META = {
  title: 'xiaomi-tts',
  packageName: 'dsh-xiaomi-tts',
  description: '为 DeepSeek Harness Web 助手消息提供 Xiaomi MiMo 语音朗读控制',
} as const

const scope = new PreviewSettingsScope()
const restorePreviewFetch = installPreviewFetch(scope)
const soundEffects = createSoundEffectsController()

if (import.meta.hot) import.meta.hot.dispose(() => { restorePreviewFetch(); void soundEffects.dispose() })

function translator(locale: PreviewLocale): Translate {
  const dictionary: Record<LocaleKey, string> = locale === 'zh' ? zh : en
  return (key) => dictionary[key]
}

function PreviewApp() {
  const [locale, setLocale] = useState<PreviewLocale>('zh')
  const [theme, setTheme] = useState<PreviewTheme>('light')
  const [readOnly, setReadOnly] = useState(false)
  const [instance, setInstance] = useState(0)
  const [isSongPlaying, setIsSongPlaying] = useState(false)
  const [songVolume, setSongVolume] = useState(0.5)
  const [isToolbarCompact, setIsToolbarCompact] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [isControlsOpen, setIsControlsOpen] = useState(false)
  const songRef = useRef<HTMLAudioElement | null>(null)
  const lastScrollYRef = useRef(0)
  const toolbarRef = useRef<HTMLElement | null>(null)
  const manualToggleRef = useRef<HTMLButtonElement | null>(null)
  const controlsToggleRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const t = useMemo(() => translator(locale), [locale])
  const toolbar = TOOLBAR_COPY[locale]

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en'
    document.documentElement.dataset.theme = theme
  }, [locale, theme])

  useEffect(() => {
    const header = listRef.current?.querySelector<HTMLButtonElement>('.xmimo-tts-card-header')
    if (header?.getAttribute('aria-expanded') === 'false') header.click()
  }, [instance])

  useEffect(() => {
    const song = songRef.current
    if (song === null) return
    song.volume = songVolume
  }, [songVolume])

  useEffect(() => {
    const song = songRef.current
    if (song === null) return
    song.volume = 0.5
    void song.play().catch(() => { setIsSongPlaying(false) })
  }, [])

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
    scope.reset()
    setReadOnly(false)
    setInstance((current) => current + 1)
  }

  const reset = (): void => {
    scope.reset()
    setReadOnly(false)
    setInstance((current) => current + 1)
  }

  const toggleSong = (): void => {
    const song = songRef.current
    if (song === null) return
    if (song.paused) {
      void song.play().catch(() => { setIsSongPlaying(false) })
    } else {
      song.pause()
    }
  }

  return <div className="preview-shell">
    <PreviewBackground />
    <header ref={toolbarRef} className={`preview-toolbar${isToolbarCompact ? ' preview-toolbar-compact' : ''}`}>
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
      <div className="preview-brand">
        <strong>MiMo TTS UI Lab</strong>
        <span>{toolbar.subtitle}</span>
      </div>
      <div className="preview-song-control">
        <button
          className="preview-song-button"
          type="button"
          onClick={toggleSong}
          aria-label={isSongPlaying ? toolbar.pauseSong : toolbar.playSong}
          aria-pressed={isSongPlaying}
          title={isSongPlaying ? toolbar.pauseSong : toolbar.playSong}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
            {isSongPlaying
              ? <><path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-13Z" />
                </>
              : <path d="M8.4 4.8A1.8 1.8 0 0 0 5.5 6.3v11.4a1.8 1.8 0 0 0 2.9 1.5l8.2-5.7a1.8 1.8 0 0 0 0-3L8.4 4.8Z" />}
          </svg>
        </button>
        <label className="preview-volume" title={toolbar.volume}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
            <path d="M4 9.5v5h3.4l4.1 3.4V6.1L7.4 9.5H4Zm10.7-.8a1 1 0 0 0-1.4 1.4 3.4 3.4 0 0 1 0 4.8 1 1 0 1 0 1.4 1.4 5.4 5.4 0 0 0 0-7.6Zm2.8-2.8a1 1 0 1 0-1.4 1.4 7.4 7.4 0 0 1 0 10.4 1 1 0 1 0 1.4 1.4 9.4 9.4 0 0 0 0-13.2Z" />
          </svg>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={songVolume}
            aria-label={toolbar.volume}
            onChange={(event) => { setSongVolume(Number(event.target.value)) }}
          />
        </label>
      </div>
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
        <label>
          <span>{toolbar.language}</span>
          <select value={locale} onChange={(event) => { changeLocale(event.target.value as PreviewLocale) }}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          <span>{toolbar.theme}</span>
          <select value={theme} onChange={(event) => { setTheme(event.target.value as PreviewTheme) }}>
            <option value="light">{toolbar.light}</option>
            <option value="dark">{toolbar.dark}</option>
          </select>
        </label>
        <label className="preview-checkbox">
          <input type="checkbox" checked={readOnly} onChange={(event) => { toggleReadOnly(event.target.checked) }} />
          <span>{toolbar.readOnly}</span>
        </label>
        <button type="button" onClick={reset}>{toolbar.reset}</button>
        <audio
          ref={songRef}
          autoPlay
          preload="auto"
          src={`${import.meta.env.BASE_URL}plugins/xiaomi-mimo-tts/preview-audio/preview-song.mp3`}
          onPlay={() => { setIsSongPlaying(true) }}
          onPause={() => { setIsSongPlaying(false) }}
          onEnded={() => { setIsSongPlaying(false) }}
        />
      </div>
    </header>
    <main className="preview-stage">
      <div className="preview-workspace">
        <UserManual
          locale={locale}
          isOpen={isManualOpen}
          onOpenChange={setIsManualOpen}
          onFocusToggle={() => { manualToggleRef.current?.focus() }}
        />
        <section className="preview-settings-pane" aria-label={locale === 'zh' ? '设置页预览' : 'Settings preview'}>
          <header className="preview-plugin-header">
            <div className="preview-plugin-title-row">
              <h1>{PREVIEW_PLUGIN_META.title}</h1>
              <span className="preview-plugin-version">v{TTS_VERSION}</span>
            </div>
            <code className="preview-plugin-name">{PREVIEW_PLUGIN_META.packageName}</code>
            <p>{PREVIEW_PLUGIN_META.description}</p>
          </header>
          <ul className="preview-settings-list" ref={listRef} key={instance}>
             <SettingsCard view="page" scope={scope} t={t} controller={soundEffects} />
          </ul>
          <div className="preview-note" role="note">
            {locale === 'zh'
              ? <>这里渲染的是插件实际设置卡片；修改 <code>src/client</code> 后页面会直接刷新。远程语音和保存均为本地模拟。</>
              : <>This is the real plugin settings card. Changes in <code>src/client</code> hot-reload here; remote speech and save are mocked locally.</>}
          </div>
        </section>
      </div>
    </main>
    <style>{CLIENT_STYLES}</style>
  </div>
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Preview root element was not found')
createRoot(rootElement).render(<PreviewApp />)
