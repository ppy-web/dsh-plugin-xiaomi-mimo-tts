export type PreviewLocale = 'zh' | 'en' | 'ja' | 'fr'
export type PreviewView = 'settings' | 'workbench' | 'voice' | 'conversation' | 'detail' | 'components' | 'filter' | 'manual' | 'qqbot' | 'xiaomi' | 'doubao' | 'breeze' | 'passport'

export interface PreviewCopy {
  workspace: string
  skipContent: string
  navigation: string
  closeNavigation: string
  toggleNavigation: string
  speech: string
  plugin: string
  help: string
  environment: string
  readOnly: string
  reset: string
  source: string
  language: string
  lightTheme: string
  darkTheme: string
  activation: string
  notice: string
  pages: Record<PreviewView, { title: string; description: string }>
}

export const PREVIEW_COPY: Record<PreviewLocale, PreviewCopy> = {
  zh: {
    skipContent: '跳至内容',
    workspace: '交互预览', navigation: '功能导航', closeNavigation: '关闭导航', toggleNavigation: '切换侧栏',
    speech: '语音体验', plugin: '插件管理', help: '工具与帮助', environment: '预览环境',
    readOnly: '只读配置', reset: '重置演示配置', source: '查看源码', language: '语言',
    lightTheme: '切换浅色主题', darkTheme: '切换深色主题', activation: '版本新功能',
    notice: '仅用于预览，不会修改 DSH 设置。',
    pages: {
      settings: { title: '插件设置', description: '配置语音服务商、音色与音效，体验完整的设置面板。' },
      workbench: { title: '语音工作台', description: '在独立工作台配置音色、试听与音效。' },
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
    speech: 'Speech', plugin: 'Plugin', help: 'Tools & help', environment: 'Preview controls',
    readOnly: 'Read-only settings', reset: 'Reset demo settings', source: 'View source', language: 'Language',
    lightTheme: 'Switch to light theme', darkTheme: 'Switch to dark theme', activation: 'What’s new',
    notice: 'Preview only. Your DSH settings stay unchanged.',
    pages: {
      settings: { title: 'Plugin settings', description: 'Explore providers, voices, and sound effects in the full settings panel.' },
      workbench: { title: 'Voice workbench', description: 'Configure voices, previews, and sound effects in a dedicated workbench.' },
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
  ja: {
    skipContent: '本文に移動',
    workspace: '操作プレビュー', navigation: '機能ナビゲーション', closeNavigation: 'ナビゲーションを閉じる', toggleNavigation: 'サイドバーを切り替え',
    speech: '音声体験', plugin: 'プラグイン管理', help: 'ツールとヘルプ', environment: 'プレビュー設定',
    readOnly: '設定を読み取り専用にする', reset: 'デモ設定をリセット', source: 'ソースを見る', language: '言語',
    lightTheme: 'ライトテーマに切り替え', darkTheme: 'ダークテーマに切り替え', activation: '新機能のご紹介',
    notice: 'プレビュー専用です。DSH の設定は変更しません。',
    pages: {
      settings: { title: 'プラグイン設定', description: 'サービス、音声、効果音を設定できる実際のパネルです。' },
      workbench: { title: 'Voice workbench', description: 'Configure voices, previews, and sound effects in a dedicated workbench.' },
      voice: { title: '音声読み上げ', description: 'ホスト設定から音声、速度、自動読み上げを調整します。' },
      conversation: { title: '会話プレビュー', description: 'サンプル会話でメッセージの読み上げと再生操作を試せます。' },
      detail: { title: 'プラグイン詳細', description: 'サービス、キー状態ごとの詳細表示を確認します。' },
      components: { title: '含まれるコンポーネント', description: '音声プラグインとクジラメイドの Agent プリセットを確認します。' },
      filter: { title: 'テキストフィルター', description: '入力文やサンプルで、元の文章と読み上げ用テキストを比較します。' },
      manual: { title: 'ユーザーマニュアル', description: '設定と操作のガイドです。中国語と英語で提供しています。' },
      qqbot: { title: 'QQBot 連携', description: 'QQ の接続から音声メッセージの確認まで。本文は英語で表示します。' },
      passport: { title: 'AI Passport 接続', description: 'ホストと端末を設定して Wi-Fi 音声会話を始めます。本文は英語で表示します。' },
      doubao: { title: '豆包音声の接続', description: 'サービスの有効化、キーと音声の設定、動作確認。本文は英語で表示します。' },
      xiaomi: { title: '小米 MiMo の接続', description: '無料体験と制限、キーと音声の設定。本文は英語で表示します。' },
      breeze: { title: 'Breeze の接続', description: 'ネットワーク、登録とクレジット、音声の設定。本文は英語で表示します。' },
    },
  },
  fr: {
    skipContent: 'Aller au contenu',
    workspace: 'Aperçu interactif', navigation: 'Navigation', closeNavigation: 'Fermer la navigation', toggleNavigation: 'Afficher ou masquer le menu',
    speech: 'Lecture vocale', plugin: 'Plugin', help: 'Outils et aide', environment: 'Réglages de l’aperçu',
    readOnly: 'Configuration en lecture seule', reset: 'Réinitialiser la démo', source: 'Voir le code', language: 'Langue',
    lightTheme: 'Passer au thème clair', darkTheme: 'Passer au thème sombre', activation: 'Les nouveautés',
    notice: 'Aperçu uniquement. Les réglages de DSH restent inchangés.',
    pages: {
      settings: { title: 'Réglages du plugin', description: 'Découvrez les services, les voix et les effets sonores du panneau complet.' },
      workbench: { title: 'Voice workbench', description: 'Configure voices, previews, and sound effects in a dedicated workbench.' },
      voice: { title: 'Lecture vocale', description: 'Réglez la voix, la vitesse et la lecture automatique depuis les paramètres de l’hôte.' },
      conversation: { title: 'Conversation', description: 'Essayez la lecture des messages dans un exemple de conversation.' },
      detail: { title: 'Détails du plugin', description: 'Vérifiez l’affichage selon le service et l’état de la clé.' },
      components: { title: 'Composants inclus', description: 'Découvrez le plugin vocal et le préréglage Agent Whale Girl.' },
      filter: { title: 'Filtrage du texte', description: 'Comparez le texte source et le texte lu avec votre saisie ou les exemples.' },
      manual: { title: 'Manuel utilisateur', description: 'Le guide des réglages et des commandes, disponible en chinois et en anglais.' },
      qqbot: { title: 'Connexion QQBot', description: 'Connectez le bot et vérifiez les messages vocaux. Guide en anglais.' },
      passport: { title: 'Connexion AI Passport', description: 'Configurez l’hôte et l’appareil pour parler à DSH via Wi-Fi. Guide en anglais.' },
      doubao: { title: 'Connexion vocale Doubao', description: 'Activez le service, configurez la clé et testez la voix. Guide en anglais.' },
      xiaomi: { title: 'Connexion Xiaomi MiMo', description: 'Découvrez l’essai gratuit et les limites, puis configurez la voix. Guide en anglais.' },
      breeze: { title: 'Connexion Breeze', description: 'Préparez le réseau, les crédits et les réglages de voix. Guide en anglais.' },
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
