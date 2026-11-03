import { useState } from 'react'
import pluginIcon from '../../assets/plugin-icons/avatar.webp'
import whaleGirlIcon from '../../assets/plugin-icons/preset.webp'
import qqbotIcon from '../../assets/plugin-icons/qqbot.webp'
import passportIcon from '../../assets/plugin-icons/passport.webp'
import { PersonaSettingsPreview } from './persona-settings-preview.js'
import { ExperimentalComponentListBadge } from '../../src/client/settings/plugin-detail.js'
import { zh, en } from '../../src/client/localization.js'

type PreviewLocale = 'zh' | 'en'

const COPY = {
  zh: {
    heading: '包含的组件',
    count: (total: number, running: number) => `共 ${total} 个 · ${running} 运行中`,
    running: '运行中',
    stopped: '已关闭',
    toggle: (name: string) => `切换${name}组件`,
    ttsTitle: 'MiMo & Seed TTS',
    ttsDescription: '为 DSH 添加 Xiaomi MiMo TTS、豆包 Seed TTS，浏览器语音；音频下载、 UI 音效、桌宠联动、QQBot 语音；',
    agentTitle: '鲸鱼娘 Agent 预设',
    agentDescription: '白饭续航、机灵嘴硬，会一本正经接梗，也会温柔陪伴和可靠办事。',
    qqbotTitle: 'QQ Bot 传声筒',
    qqbotDescription: '提供独立 QQ 鲸鱼娘与自定义人设。播报台打开 QQ Bot，在 QQ 中发送 /preset qq-speech-assistant 和 /new 接入。',
  },
  en: {
    heading: 'Included components',
    count: (total: number, running: number) => `${total} total · ${running} running`,
    running: 'Running',
    stopped: 'Disabled',
    toggle: (name: string) => `Toggle ${name} component`,
    ttsTitle: 'MiMo & Seed TTS',
    ttsDescription: 'Xiaomi MiMo and Doubao read-aloud for DSH, with Doubao Standard Synthesis 2.0, Voice Cloning 2.0, streaming playback, browser speech fallback, and optional UI sounds.',
    agentTitle: 'Whale Girl Agent preset',
    agentDescription: 'A rice-powered whale maid with deadpan wit, a soft heart, and reliable practical help.',
    qqbotTitle: 'QQ Bot Megaphone',
    qqbotDescription: 'Independent QQ Whale Girl with custom persona settings. Enable the QQ Bot source, then send /preset qq-speech-assistant and /new in QQ.',
  },
} as const

export function BundleComponents({ locale, readOnly = false }: { locale: PreviewLocale; readOnly?: boolean }) {
  const copy = COPY[locale]
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [agentEnabled, setAgentEnabled] = useState(false)
  const [qqbotEnabled, setQqbotEnabled] = useState(false)
  const [passportEnabled, setPassportEnabled] = useState(false)
  const components = [
    { id: 'xiaomi-mimo-tts', icon: pluginIcon, title: copy.ttsTitle, description: copy.ttsDescription, module: 'dsh-xiaomi-tts', enabled: ttsEnabled, setEnabled: setTtsEnabled },
    { id: 'speech-delivery-qqbot', icon: qqbotIcon, title: copy.qqbotTitle, description: copy.qqbotDescription, module: 'dsh-xiaomi-tts/qqbot', enabled: qqbotEnabled, setEnabled: setQqbotEnabled },
    { id: 'speech-delivery-passport', icon: passportIcon, title: (locale === 'zh' ? zh : en)['passport.title'], description: (locale === 'zh' ? zh : en)['passport.description'], module: 'dsh-xiaomi-tts/passport', enabled: passportEnabled, setEnabled: setPassportEnabled },
    { id: 'preset-whale-girl', icon: whaleGirlIcon, title: copy.agentTitle, description: copy.agentDescription, module: 'dsh-xiaomi-tts/whale-girl', enabled: agentEnabled, setEnabled: setAgentEnabled },
  ]

  return <section className="preview-bundle" aria-label={copy.heading} data-plugin-detail="dsh-xiaomi-tts">
    <ExperimentalComponentListBadge label={(locale === 'zh' ? zh : en)['settings.experimental']} />
    <header className="preview-bundle-heading">
      <h2>{copy.heading}</h2>
      <span>{copy.count(components.length, components.filter((item) => item.enabled).length)}</span>
    </header>
    <ul className="preview-bundle-list">
      {components.map((component) => <li className="preview-bundle-item" key={component.id}>
        <img src={component.icon} alt="" aria-hidden="true" />
        <div className="preview-bundle-copy">
          <strong data-xmimo-experimental-title={['speech-delivery-qqbot', 'speech-delivery-passport'].includes(component.id) ? '' : undefined}>{component.title}</strong>
          <p>{component.description}</p>
          <code>{component.id}</code>
          <code>{component.module}</code>
          <a className="preview-component-config-link" href={component.id === 'xiaomi-mimo-tts' ? '#settings' : `#components-${component.id === 'preset-whale-girl' ? 'desktop' : component.id === 'speech-delivery-qqbot' ? 'qqbot' : 'passport'}`}>{locale === 'zh' ? '配置组件' : 'Configure'}</a>
        </div>
        <span className={`preview-bundle-status${component.enabled ? ' preview-bundle-status-running' : ''}`}>
          {component.enabled ? copy.running : copy.stopped}
        </span>
        <label className="preview-bundle-switch">
          <input
            type="checkbox"
            role="switch"
            checked={component.enabled}
            disabled={readOnly}
            aria-label={copy.toggle(component.title)}
            onChange={(event) => { component.setEnabled(event.target.checked) }}
          />
          <span aria-hidden="true" />
        </label>
      </li>)}
    </ul>
    <PersonaSettingsPreview locale={locale} readOnly={readOnly} />
  </section>
}
