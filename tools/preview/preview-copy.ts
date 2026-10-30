export type PreviewLocale = 'zh' | 'en' | 'ja' | 'fr'
export type PreviewView = 'settings' | 'voice' | 'conversation' | 'detail' | 'components' | 'filter' | 'manual' | 'qqbot' | 'doubao'

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
    lightTheme: '切换浅色主题', darkTheme: '切换深色主题', activation: '启用引导',
    notice: '仅用于预览，不会修改 DSH 设置。',
    pages: {
      settings: { title: '插件设置', description: '配置语音服务商、音色与音效，体验完整的设置面板。' },
      voice: { title: '语音朗读', description: '宿主设置中的快捷入口，调整音色、语速和自动朗读。' },
      conversation: { title: '对话效果', description: '在一段示例对话中体验消息朗读与播放控制。' },
      detail: { title: '插件详情', description: '检查详情扩展在不同服务商和密钥状态下的显示。' },
      components: { title: '包含的组件', description: '查看语音插件和鲸鱼娘 Agent 预设的组件列表。' },
      filter: { title: '文本过滤', description: '比较原始文本与朗读内容，试用自定义输入或测试样例。' },
      manual: { title: '用户手册', description: '了解各项配置与操作。手册提供中文和英文版本。' },
      qqbot: { title: 'QQBot 接入', description: '从机器人连接到语音消息，逐步完成 DSH 与 QQ 的联动。' },
      doubao: { title: '豆包语音接入', description: '开通语音服务，配置密钥与音色，验证云端合成和实时朗读。' },
    },
  },
  en: {
    skipContent: 'Skip to content',
    workspace: 'Interactive preview', navigation: 'Navigation', closeNavigation: 'Close navigation', toggleNavigation: 'Toggle sidebar',
    speech: 'Speech', plugin: 'Plugin', help: 'Tools & help', environment: 'Preview controls',
    readOnly: 'Read-only settings', reset: 'Reset demo settings', source: 'View source', language: 'Language',
    lightTheme: 'Switch to light theme', darkTheme: 'Switch to dark theme', activation: 'Activation guide',
    notice: 'Preview only. Your DSH settings stay unchanged.',
    pages: {
      settings: { title: 'Plugin settings', description: 'Explore providers, voices, and sound effects in the full settings panel.' },
      voice: { title: 'Voice reading', description: 'Quick voice, speed, and automatic reading controls from host settings.' },
      conversation: { title: 'Conversation', description: 'Try message reading and playback controls in a sample conversation.' },
      detail: { title: 'Plugin details', description: 'Inspect contributions across providers and key states.' },
      components: { title: 'Included components', description: 'Explore the speech plugin and Whale Girl Agent preset.' },
      filter: { title: 'Text filtering', description: 'Compare source text with spoken text using your input or test samples.' },
      manual: { title: 'User manual', description: 'A guide to settings and controls, available in Chinese and English.' },
      qqbot: { title: 'QQBot setup', description: 'Connect your bot, select its preset, and verify voice messages in QQ.' },
      doubao: { title: 'Doubao voice setup', description: 'Enable the service, configure a key and voice, and verify cloud speech and streaming.' },
    },
  },
  ja: {
    skipContent: '本文に移動',
    workspace: '操作プレビュー', navigation: '機能ナビゲーション', closeNavigation: 'ナビゲーションを閉じる', toggleNavigation: 'サイドバーを切り替え',
    speech: '音声体験', plugin: 'プラグイン管理', help: 'ツールとヘルプ', environment: 'プレビュー設定',
    readOnly: '設定を読み取り専用にする', reset: 'デモ設定をリセット', source: 'ソースを見る', language: '言語',
    lightTheme: 'ライトテーマに切り替え', darkTheme: 'ダークテーマに切り替え', activation: '有効化ガイド',
    notice: 'プレビュー専用です。DSH の設定は変更しません。',
    pages: {
      settings: { title: 'プラグイン設定', description: 'サービス、音声、効果音を設定できる実際のパネルです。' },
      voice: { title: '音声読み上げ', description: 'ホスト設定から音声、速度、自動読み上げを調整します。' },
      conversation: { title: '会話プレビュー', description: 'サンプル会話でメッセージの読み上げと再生操作を試せます。' },
      detail: { title: 'プラグイン詳細', description: 'サービス、キー状態ごとの詳細表示を確認します。' },
      components: { title: '含まれるコンポーネント', description: '音声プラグインとクジラメイドの Agent プリセットを確認します。' },
      filter: { title: 'テキストフィルター', description: '入力文やサンプルで、元の文章と読み上げ用テキストを比較します。' },
      manual: { title: 'ユーザーマニュアル', description: '設定と操作のガイドです。中国語と英語で提供しています。' },
      qqbot: { title: 'QQBot 連携', description: 'QQ の接続から音声メッセージの確認まで。本文は英語で表示します。' },
      doubao: { title: '豆包音声の接続', description: 'サービスの有効化、キーと音声の設定、動作確認。本文は英語で表示します。' },
    },
  },
  fr: {
    skipContent: 'Aller au contenu',
    workspace: 'Aperçu interactif', navigation: 'Navigation', closeNavigation: 'Fermer la navigation', toggleNavigation: 'Afficher ou masquer le menu',
    speech: 'Lecture vocale', plugin: 'Plugin', help: 'Outils et aide', environment: 'Réglages de l’aperçu',
    readOnly: 'Configuration en lecture seule', reset: 'Réinitialiser la démo', source: 'Voir le code', language: 'Langue',
    lightTheme: 'Passer au thème clair', darkTheme: 'Passer au thème sombre', activation: 'Guide d’activation',
    notice: 'Aperçu uniquement. Les réglages de DSH restent inchangés.',
    pages: {
      settings: { title: 'Réglages du plugin', description: 'Découvrez les services, les voix et les effets sonores du panneau complet.' },
      voice: { title: 'Lecture vocale', description: 'Réglez la voix, la vitesse et la lecture automatique depuis les paramètres de l’hôte.' },
      conversation: { title: 'Conversation', description: 'Essayez la lecture des messages dans un exemple de conversation.' },
      detail: { title: 'Détails du plugin', description: 'Vérifiez l’affichage selon le service et l’état de la clé.' },
      components: { title: 'Composants inclus', description: 'Découvrez le plugin vocal et le préréglage Agent Whale Girl.' },
      filter: { title: 'Filtrage du texte', description: 'Comparez le texte source et le texte lu avec votre saisie ou les exemples.' },
      manual: { title: 'Manuel utilisateur', description: 'Le guide des réglages et des commandes, disponible en chinois et en anglais.' },
      qqbot: { title: 'Connexion QQBot', description: 'Connectez le bot et vérifiez les messages vocaux. Guide en anglais.' },
      doubao: { title: 'Connexion vocale Doubao', description: 'Activez le service, configurez la clé et testez la voix. Guide en anglais.' },
    },
  },
}

/** Resolve old tutorial links as well as each document's section anchors. */
export function previewDocumentSectionId(hash: string): string | undefined {
  const value = hash.replace(/^#/, '')
  if (value === 'manual-qqbot') return 'qqbot-start'
  if (value === 'manual-doubao') return 'doubao-start'
  return /^(manual|qqbot|doubao)-/.test(value) ? value : undefined
}

export function previewViewFromHash(hash: string): PreviewView {
  const value = hash.replace(/^#/, '')
  const sectionId = previewDocumentSectionId(hash)
  if (sectionId) return sectionId.split('-')[0] as PreviewView
  return Object.hasOwn(PREVIEW_COPY.zh.pages, value) ? value as PreviewView : 'settings'
}
