import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { SettingsCard } from '../src/client/settings/card.js'
import { createSoundEffectsController } from '../src/client/sound-effects/index.js'
import { CLIENT_STYLES } from '../src/client/style/index.js'
import { en, zh } from '../src/client/localization.js'
import type { LocaleKey, Translate } from '../src/client/localization.js'
import {
  VOICE_DESIGN_AI_RPC_CHANNEL,
  VOICE_DESIGN_AI_RPC_ENDPOINT,
} from '../src/shared.js'
import { installPreviewFetch, PreviewSettingsScope } from './mock-settings.js'
import { PreviewBackground } from './background-icons.js'
import { UserManual } from './user-manual.js'
import './preview.css'

type PreviewLocale = 'zh' | 'en'
type PreviewTheme = 'light' | 'dark'

const TOOLBAR_COPY: Record<PreviewLocale, {
  subtitle: string
  language: string
  theme: string
  readOnly: string
  reset: string
  light: string
  dark: string
}> = {
  zh: {
    subtitle: '真实组件 · Vite 热更新 · 本地模拟数据',
    language: '语言',
    theme: '主题',
    readOnly: '只读',
    reset: '重置状态',
    light: '浅色',
    dark: '深色',
  },
  en: {
    subtitle: 'Real components · Vite HMR · local mock data',
    language: 'Language',
    theme: 'Theme',
    readOnly: 'Read-only',
    reset: 'Reset state',
    light: 'Light',
    dark: 'Dark',
  },
}

const scope = new PreviewSettingsScope()
const uninstallPreviewFetch = installPreviewFetch(scope)
const soundEffects = createSoundEffectsController()

if (import.meta.hot) import.meta.hot.dispose(() => { uninstallPreviewFetch(); void soundEffects.dispose() })

const rpc = {
  async call(channel: string, endpoint: string, payload: unknown): Promise<unknown> {
    if (channel !== VOICE_DESIGN_AI_RPC_CHANNEL || endpoint !== VOICE_DESIGN_AI_RPC_ENDPOINT) {
      return { ok: false, error: { message: 'Unknown preview RPC endpoint' } }
    }
    const input = typeof payload === 'object' && payload !== null && 'input' in payload
      ? String((payload as { input?: unknown }).input ?? '').trim()
      : ''
    return {
      ok: true,
      value: {
        text: input.length > 0
          ? `${input.replace(/[。.!！?？]+$/u, '')}，气息自然，语速舒缓，情绪温柔而有亲和力。`
          : '青年女性，声线清亮柔和，吐字清楚，语速舒缓，情绪自然亲切。',
      },
    }
  },
} as unknown as ClientConnectionRpc

function translator(locale: PreviewLocale): Translate {
  const dictionary: Record<LocaleKey, string> = locale === 'zh' ? zh : en
  return (key) => dictionary[key]
}

function PreviewApp() {
  const [locale, setLocale] = useState<PreviewLocale>('zh')
  const [theme, setTheme] = useState<PreviewTheme>('light')
  const [readOnly, setReadOnly] = useState(false)
  const [instance, setInstance] = useState(0)
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

  return <div className="preview-shell">
    <PreviewBackground />
    <header className="preview-toolbar">
      <div>
        <strong>MiMo TTS UI Lab</strong>
        <span>{toolbar.subtitle}</span>
      </div>
      <div className="preview-controls">
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
      </div>
    </header>
    <main className="preview-stage">
      <div className="preview-workspace">
        <UserManual locale={locale} />
        <section className="preview-settings-pane" aria-label={locale === 'zh' ? '设置页预览' : 'Settings preview'}>
          <div className="preview-note" role="note">
            {locale === 'zh'
              ? <>这里渲染的是插件实际设置卡片；修改 <code>src/client</code> 后页面会直接刷新。远程语音、卸载和保存均为本地模拟。</>
              : <>This is the real plugin settings card. Changes in <code>src/client</code> hot-reload here; remote speech, uninstall, and save are mocked locally.</>}
          </div>
          <ul className="preview-settings-list" ref={listRef} key={instance}>
            <SettingsCard scope={scope} t={t} connection={{ rpc }} controller={soundEffects} />
          </ul>
        </section>
      </div>
    </main>
    <style>{CLIENT_STYLES}</style>
  </div>
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Preview root element was not found')
createRoot(rootElement).render(<PreviewApp />)
