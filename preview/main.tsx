import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import { SettingsCard } from '../src/client/settings-card.js'
import { CLIENT_STYLES } from '../src/client/styles.js'
import { en, zh } from '../src/client/localization.js'
import type { LocaleKey, Translate } from '../src/client/localization.js'
import {
  VOICE_DESIGN_AI_RPC_CHANNEL,
  VOICE_DESIGN_AI_RPC_ENDPOINT,
} from '../src/shared.js'
import { installPreviewFetch, PreviewSettingsScope } from './mock-settings.js'
import './preview.css'

type PreviewLocale = 'zh' | 'en'
type PreviewTheme = 'light' | 'dark'

const scope = new PreviewSettingsScope()
const uninstallPreviewFetch = installPreviewFetch(scope)

if (import.meta.hot) import.meta.hot.dispose(uninstallPreviewFetch)

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
    <header className="preview-toolbar">
      <div>
        <strong>MiMo TTS UI Lab</strong>
        <span>真实组件 · Vite 热更新 · 本地模拟数据</span>
      </div>
      <div className="preview-controls">
        <label>
          <span>语言</span>
          <select value={locale} onChange={(event) => { changeLocale(event.target.value as PreviewLocale) }}>
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          <span>主题</span>
          <select value={theme} onChange={(event) => { setTheme(event.target.value as PreviewTheme) }}>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </label>
        <label className="preview-checkbox">
          <input type="checkbox" checked={readOnly} onChange={(event) => { toggleReadOnly(event.target.checked) }} />
          <span>只读</span>
        </label>
        <button type="button" onClick={reset}>重置状态</button>
      </div>
    </header>
    <main className="preview-stage">
      <div className="preview-note" role="note">
        这里渲染的是插件实际设置卡片；修改 <code>src/client</code> 后页面会直接刷新。远程语音、卸载和保存均为本地模拟。
      </div>
      <ul className="preview-settings-list" ref={listRef} key={instance}>
        <SettingsCard scope={scope} t={t} connection={{ rpc }} />
      </ul>
    </main>
    <style>{CLIENT_STYLES}</style>
  </div>
}

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('Preview root element was not found')
createRoot(rootElement).render(<PreviewApp />)
