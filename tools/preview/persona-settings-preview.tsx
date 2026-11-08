import { useEffect, useState } from 'react'
import type { ConfigForm, ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import { DEFAULT_WHALE_SETTINGS } from '../../src/types/whale.js'
import { WhalePersonaSettings } from '../../src/client/settings/whale-settings.js'
import { QqbotSpeechSettings } from '../../src/client/settings/qqbot-settings.js'
import { en, zh, type Translate } from '../../src/client/localization.js'
import { PreviewSettingsScope } from './mock-settings.js'
import { PassportSettingsPage } from '../../src/client/settings/passport-settings.js'
import { DEFAULT_PASSPORT_SETTINGS } from '../../src/types/passport.js'
import pluginIcon from '../../assets/plugin-icons/preset.webp'
import qqbotIcon from '../../assets/plugin-icons/qqbot.webp'
import passportIcon from '../../assets/plugin-icons/passport.webp'
import { IDLE_PLUGIN_CHANGES } from '../../src/client/plugin-activity.js'

function componentScope<T extends object>(initial: T): ConfigForm<T> & { setWritable(writable: boolean): void } {
  let value = structuredClone(initial)
  let revision = 1
  const listeners = new Set<() => void>()
  const base = structuredClone(initial)
  let snapshot: ConfigFormSnapshot<T> = { status: 'ready', value, base, user: {}, writable: true, revision }
  const scope: ConfigForm<T> & { setWritable(writable: boolean): void } = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    setWritable(writable) {
      snapshot = { ...snapshot, writable }
      for (const listener of listeners) listener()
    },
    async set(field, next) { return scope.mutate([{ op: 'set', path: [field], value: next }]) },
    async unset(field) { return scope.mutate([{ op: 'unset', path: [field] }]) },
    async mutate(ops, expectedRevision) {
      if (!snapshot.writable || (expectedRevision !== undefined && expectedRevision !== revision)) return false
      const next = structuredClone(value) as unknown as Record<string, unknown>
      for (const op of ops) {
        const [group, field] = op.path
        if (!group) continue
        const target = field ? next[group] as Record<string, unknown> : next
        const key = field ?? group
        if (op.op === 'set') target[key] = op.value
        else target[key] = field ? (base[group as keyof T] as unknown as Record<string, unknown>)[field] : base[group as keyof T]
      }
      value = next as unknown as T
      snapshot = { status: 'ready', value, base, user: value, writable: snapshot.writable, revision: ++revision }
      for (const listener of listeners) listener()
      return true
    },
  }
  return scope
}

const COMPONENTS = ['desktop', 'qqbot', 'passport'] as const
type Component = typeof COMPONENTS[number]
function componentFromHash(): Component {
  const id = window.location.hash.replace('#components-', '')
  return COMPONENTS.includes(id as Component) ? id as Component : 'desktop'
}

export function PersonaSettingsPreview({ locale, readOnly = false }: { locale: 'zh' | 'en'; readOnly?: boolean }) {
  const [desktop] = useState(() => componentScope(structuredClone(DEFAULT_WHALE_SETTINGS)))
  const [qq] = useState(() => componentScope(structuredClone(DEFAULT_WHALE_SETTINGS)))
  const [passport] = useState(() => componentScope({ ...DEFAULT_PASSPORT_SETTINGS }))
  const [speech] = useState(() => new PreviewSettingsScope())
  const [selected, setSelected] = useState<Component>(componentFromHash)
  const t: Translate = key => (locale === 'zh' ? zh : en)[key]
  useEffect(() => {
    for (const scope of [desktop, qq, passport, speech]) scope.setWritable(!readOnly)
  }, [readOnly, desktop, qq, passport, speech])
  useEffect(() => {
    const navigate = (): void => {
      if (!window.location.hash.startsWith('#components-')) return
      setSelected(componentFromHash())
      requestAnimationFrame(() => document.getElementById('preview-component-settings')?.scrollIntoView({ block: 'start' }))
    }
    navigate()
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  const labels = { desktop: locale === 'zh' ? 'DSH 鲸鱼娘' : 'DSH Whale Girl', qqbot: locale === 'zh' ? 'QQ Bot 传声筒' : 'QQ Bot Megaphone', passport: t('passport.title') }
  const icons = { desktop: pluginIcon, qqbot: qqbotIcon, passport: passportIcon }
  const select = (component: Component): void => { setSelected(component); window.location.hash = `components-${component}` }
  return <section className="preview-component-settings" id="preview-component-settings" aria-label={locale === 'zh' ? '组件配置' : 'Component settings'}>
    <header><h2>{locale === 'zh' ? '组件配置' : 'Component settings'}</h2>
      <p>{locale === 'zh' ? '选择组件查看独立配置。保存仅用于演示，不会启用服务或连接真实设备。' : 'Choose a component to explore its settings. Saving only updates demo data; it does not start services or connect a device.'}</p>
    </header>
    <div className="preview-component-tabs" role="tablist" aria-label={locale === 'zh' ? '选择组件' : 'Choose a component'}>
      {COMPONENTS.map(component => <button type="button" role="tab" id={`preview-tab-${component}`} key={component}
        aria-selected={selected === component} aria-controls={`preview-panel-${component}`} tabIndex={selected === component ? 0 : -1}
        onClick={() => select(component)} onKeyDown={event => {
          const index = COMPONENTS.indexOf(component)
          const next = event.key === 'ArrowRight' ? COMPONENTS[(index + 1) % COMPONENTS.length]
            : event.key === 'ArrowLeft' ? COMPONENTS[(index + COMPONENTS.length - 1) % COMPONENTS.length]
            : event.key === 'Home' ? COMPONENTS[0] : event.key === 'End' ? COMPONENTS[COMPONENTS.length - 1] : undefined
          if (!next) return
          event.preventDefault(); select(next); document.getElementById(`preview-tab-${next}`)?.focus()
        }}><img src={icons[component]} alt="" width={28} height={28} /><span>{labels[component]}</span></button>)}
    </div>
    <div className="preview-component-panel" role="tabpanel" id="preview-panel-desktop" aria-labelledby="preview-tab-desktop" hidden={selected !== 'desktop'}>
      <WhalePersonaSettings view="page" scope={desktop} t={t} />
    </div>
    <div className="preview-component-panel" role="tabpanel" id="preview-panel-qqbot" aria-labelledby="preview-tab-qqbot" hidden={selected !== 'qqbot'}>
      <QqbotSpeechSettings view="page" scope={speech} personaScope={qq} t={t} />
    </div>
    <div className="preview-component-panel" role="tabpanel" id="preview-panel-passport" aria-labelledby="preview-tab-passport" hidden={selected !== 'passport'}>
      <PassportSettingsPage view="page" scope={passport} t={t} guideHref="#passport" openTtsSettings={() => { window.location.hash = 'settings' }} tokenConfigured={IDLE_PLUGIN_CHANGES}
        presets={[{ id: 'whale-girl', name: locale === 'zh' ? '鲸鱼娘' : 'Whale Girl' }, { id: 'standard', name: locale === 'zh' ? '通用助手' : 'General assistant' }]}
        connectionStatus={{ configured: false, listening: false, connected: false, servicesReady: true, recognitionReady: true,
          recognitionChoices: [{ id: 'host', configured: true }, { id: 'xiaomi', configured: true }, { id: 'doubao', configured: true }],
          host: '127.0.0.1', port: 3101, addresses: [{ name: locale === 'zh' ? '演示电脑' : 'Demo computer', address: '192.168.1.10' }] }} />
    </div>
  </section>
}
