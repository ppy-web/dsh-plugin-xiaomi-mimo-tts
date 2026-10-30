import { useState } from 'react'
import pluginIcon from '../../assets/plugin-icons/avatar.webp'
import whaleGirlIcon from '../../assets/plugin-icons/preset.webp'
import qqbotIcon from '../../assets/plugin-icons/qqbot.webp'

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
    qqbotTitle: 'QQ Bot 传声',
    qqbotDescription: '包含 QQ 语音发送适配和 QQ 鲸鱼娘预设。开启组件后，在播报台保存 QQ Bot 来源开关，并在 QQ 中发送 /preset qq-speech-assistant、/new 完成接入。',
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
    qqbotTitle: 'QQ Bot Voice Relay',
    qqbotDescription: 'QQ voice delivery and the QQ 鲸鱼娘 preset in one component. Save the QQ Bot source switch in Broadcast Desk, then send /preset qq-speech-assistant and /new in QQ.',
  },
} as const

export function BundleComponents({ locale }: { locale: PreviewLocale }) {
  const copy = COPY[locale]
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [agentEnabled, setAgentEnabled] = useState(false)
  const [qqbotEnabled, setQqbotEnabled] = useState(false)
  const components = [
    { id: 'xiaomi-mimo-tts', icon: pluginIcon, title: copy.ttsTitle, description: copy.ttsDescription, module: 'dsh-xiaomi-tts', enabled: ttsEnabled, setEnabled: setTtsEnabled },
    { id: 'speech-delivery-qqbot', icon: qqbotIcon, title: copy.qqbotTitle, description: copy.qqbotDescription, module: 'dsh-xiaomi-tts/qqbot', enabled: qqbotEnabled, setEnabled: setQqbotEnabled },
    { id: 'preset-whale-girl', icon: whaleGirlIcon, title: copy.agentTitle, description: copy.agentDescription, module: 'dsh-xiaomi-tts/whale-girl', enabled: agentEnabled, setEnabled: setAgentEnabled },
  ]

  return <section className="preview-bundle" aria-label={copy.heading}>
    <header className="preview-bundle-heading">
      <h2>{copy.heading}</h2>
      <span>{copy.count(components.length, components.filter((item) => item.enabled).length)}</span>
    </header>
    <ul className="preview-bundle-list">
      {components.map((component) => <li className="preview-bundle-item" key={component.id}>
        <img src={component.icon} alt="" aria-hidden="true" />
        <div className="preview-bundle-copy">
          <strong>{component.title}</strong>
          <p>{component.description}</p>
          <code>{component.id}</code>
          <code>{component.module}</code>
        </div>
        <span className={`preview-bundle-status${component.enabled ? ' preview-bundle-status-running' : ''}`}>
          {component.enabled ? copy.running : copy.stopped}
        </span>
        <label className="preview-bundle-switch">
          <input
            type="checkbox"
            role="switch"
            checked={component.enabled}
            aria-label={copy.toggle(component.title)}
            onChange={(event) => { component.setEnabled(event.target.checked) }}
          />
          <span aria-hidden="true" />
        </label>
      </li>)}
    </ul>
  </section>
}
