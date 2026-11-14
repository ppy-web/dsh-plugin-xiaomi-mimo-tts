export type PreviewLocale = 'zh' | 'en'
export const PREVIEW_PALETTES = ['vintage-paper', 'notebook', 'kodama-grove', 'ocean-breeze', 'amethyst-haze', 'original'] as const
export type PreviewPalette = typeof PREVIEW_PALETTES[number]
export type PreviewView = 'settings' | 'workbench' | 'live2d' | 'voice' | 'conversation' | 'detail' | 'components' | 'filter' | 'manual' | 'qqbot' | 'xiaomi' | 'doubao' | 'breeze' | 'passport'

export interface PreviewCopy {
  workspace: string
  skipContent: string
  navigation: string
  closeNavigation: string
  toggleNavigation: string
  speech: string
  plugin: string
  help: string
  source: string
  language: string
  palette: string
  palettes: Record<PreviewPalette, string>
  lightTheme: string
  darkTheme: string
  dayMode: string
  activation: string
  notice: string
  externalTakeover: string
  pages: Record<PreviewView, { title: string; description: string }>
}

export const PREVIEW_COPY: Record<PreviewLocale, PreviewCopy> = {
  zh: {
    skipContent: '跳至内容',
    workspace: '交互预览', navigation: '功能导航', closeNavigation: '关闭导航', toggleNavigation: '切换侧栏',
    speech: '语音体验', plugin: '插件管理', help: '工具与帮助',
    source: '查看源码', language: '语言',
    palette: '配色', palettes: {
      'vintage-paper': '复古纸张', notebook: '素描笔记', 'kodama-grove': '苔绿林间',
      'ocean-breeze': '海风薄荷', 'amethyst-haze': '紫晶薄雾', original: '原始配色',
    },
    lightTheme: '切换浅色主题', darkTheme: '切换深色主题', dayMode: '浅色主题', activation: '版本新功能',
    notice: '仅用于预览，不会修改 DSH 设置。', externalTakeover: '模拟外部接管',
    pages: {
      live2d: { title: 'Live2D 设置', description: '选择角色，调整大小和位置。' },
      settings: { title: '插件设置', description: '配置语音服务商、音色与音效，体验完整的设置面板。' },
      workbench: { title: '音色工坊', description: '在音色工坊配置音色、试听与音效。' },
      voice: { title: '语音朗读', description: '宿主设置中的快捷入口，调整音色、语速和自动朗读。' },
      conversation: { title: '对话效果', description: '在一段示例对话中体验消息朗读与播放控制。' },
      detail: { title: '插件详情', description: '检查详情扩展在不同服务商和密钥状态下的显示。' },
      components: { title: '包含的组件', description: '查看语音插件和鲸鱼娘 Agent 预设的组件列表。' },
      filter: { title: '文本过滤', description: '比较原始文本与朗读内容，试用自定义输入或测试样例。' },
      manual: { title: '用户手册', description: '了解各项配置与操作。手册提供中文和英文版本。' },
      qqbot: { title: 'QQBot 接入', description: '从机器人连接到语音消息，逐步完成 DSH 与 QQ 的联动。' },
      passport: { title: 'AI Passport 接入', description: '准备固件、配置宿主和设备，通过 Wi-Fi 与 DSH 语音对话。' },
      doubao: { title: '豆包语音接入', description: '开通语音服务，配置密钥与音色，验证云端合成和实时朗读。' },
      xiaomi: { title: '小米 MiMo 接入', description: '了解免费体验与使用限制，配置密钥、预置音色和自定义声音。' },
      breeze: { title: 'Breeze 接入', description: '准备外网环境，注册领取积分，配置密钥、音色与情感语气。' },
    },
  },
  en: {
    skipContent: 'Skip to content',
    workspace: 'Interactive preview', navigation: 'Navigation', closeNavigation: 'Close navigation', toggleNavigation: 'Toggle sidebar',
    speech: 'Speech', plugin: 'Plugin', help: 'Tools & help',
    source: 'View source', language: 'Language',
    lightTheme: 'Switch to light theme', darkTheme: 'Switch to dark theme', dayMode: 'Light theme', activation: 'What’s new',
    palette: 'Color palette', palettes: {
      'vintage-paper': 'Vintage Paper', notebook: 'Notebook', 'kodama-grove': 'Kodama Grove',
      'ocean-breeze': 'Ocean Breeze', 'amethyst-haze': 'Amethyst Haze', original: 'Original',
    },
    notice: 'Preview only. Your DSH settings stay unchanged.', externalTakeover: 'Simulate external takeover',
    pages: {
      live2d: { title: 'Live2D settings', description: 'Choose a character and adjust its size and position.' },
      settings: { title: 'Plugin settings', description: 'Explore providers, voices, and sound effects in the full settings panel.' },
      workbench: { title: 'Voice Studio', description: 'Configure voices, previews, and sound effects in a dedicated studio.' },
      voice: { title: 'Voice reading', description: 'Quick voice, speed, and automatic reading controls from host settings.' },
      conversation: { title: 'Conversation', description: 'Try message reading and playback controls in a sample conversation.' },
      detail: { title: 'Plugin details', description: 'Inspect contributions across providers and key states.' },
      components: { title: 'Included components', description: 'Explore the speech plugin and Whale Girl Agent preset.' },
      filter: { title: 'Text filtering', description: 'Compare source text with spoken text using your input or test samples.' },
      manual: { title: 'User manual', description: 'A guide to settings and controls, available in Chinese and English.' },
      qqbot: { title: 'QQBot setup', description: 'Connect your bot, select its preset, and verify voice messages in QQ.' },
      passport: { title: 'AI Passport setup', description: 'Prepare firmware, configure the host and device, and talk to DSH over Wi-Fi.' },
      doubao: { title: 'Doubao voice setup', description: 'Enable the service, configure a key and voice, and verify cloud speech and streaming.' },
      xiaomi: { title: 'Xiaomi MiMo setup', description: 'Review the free trial and limitations, then configure a key and voice.' },
      breeze: { title: 'Breeze setup', description: 'Prepare network access, register for credits, and configure a key, voice, and delivery.' },
    },
  },
}

/** Resolve old tutorial links as well as each document's section anchors. */
export function previewDocumentSectionId(hash: string): string | undefined {
  const value = hash.replace(/^#/, '')
  if (value === 'manual-qqbot') return 'qqbot-start'
  if (value === 'manual-doubao') return 'doubao-start'
  if (value === 'manual-xiaomi') return 'xiaomi-start'
  if (value === 'manual-breeze') return 'breeze-start'
  if (value === 'manual-passport') return 'passport-start'
  return /^(manual|qqbot|xiaomi|doubao|breeze|passport)-/.test(value) ? value : undefined
}

export function previewViewFromHash(hash: string): PreviewView {
  const value = hash.replace(/^#/, '')
  if (/^components-(desktop|qqbot|passport)$/.test(value)) return 'components'
  const sectionId = previewDocumentSectionId(hash)
  if (sectionId) return sectionId.split('-')[0] as PreviewView
  return Object.hasOwn(PREVIEW_COPY.zh.pages, value) ? value as PreviewView : 'settings'
}
