import { useState } from 'react'
import pluginIcon from '../assets/plugin-icons/avatar.png'
import whaleGirlIcon from '../assets/voice-presets/energetic-girl.webp'

type PreviewLocale = 'zh' | 'en'

const COPY = {
  zh: {
    heading: '包含的组件',
    count: (total: number, running: number) => `共 ${total} 个 · ${running} 运行中`,
    running: '运行中',
    stopped: '已关闭',
    toggle: (name: string) => `切换${name}组件`,
    ttsTitle: '语音播报（MiMo TTS）',
    ttsDescription: '为 DSH Web 添加 Xiaomi MiMo 语音朗读、浏览器本地语音兜底和可选 UI 音效。',
    agentTitle: '鲸鱼娘 Agent 预设',
    agentDescription: '会聊天、陪伴和认真办事的鲸鱼娘女仆助手。',
    note: '此处模拟宿主的组件列表；开关仅影响预览显示，不修改实际插件配置。',
  },
  en: {
    heading: 'Included components',
    count: (total: number, running: number) => `${total} total · ${running} running`,
    running: 'Running',
    stopped: 'Disabled',
    toggle: (name: string) => `Toggle ${name} component`,
    ttsTitle: 'Text To Speech (MiMo TTS)',
    ttsDescription: 'MiMo read-aloud, browser-local speech fallback, and optional UI sounds for DSH Web.',
    agentTitle: 'Whale Girl Agent preset',
    agentDescription: 'A witty whale-maid assistant for conversation, companionship, and practical help.',
    note: 'This is a simulation of the host component list. Switches change only this preview.',
  },
} as const

export function BundleComponents({ locale }: { locale: PreviewLocale }) {
  const copy = COPY[locale]
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [agentEnabled, setAgentEnabled] = useState(true)
  const components = [
    { id: 'xiaomi-mimo-tts', icon: pluginIcon, title: copy.ttsTitle, description: copy.ttsDescription, module: 'dsh-xiaomi-tts', enabled: ttsEnabled, setEnabled: setTtsEnabled },
    { id: 'preset-whale-girl', icon: whaleGirlIcon, title: copy.agentTitle, description: copy.agentDescription, module: '@deepseek-ai/dsh-agent-preset', enabled: agentEnabled, setEnabled: setAgentEnabled },
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
    <p className="preview-bundle-note">{copy.note}</p>
  </section>
}
