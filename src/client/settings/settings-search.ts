import type { LocaleKey, Translate } from '../localization.js'
import type { TtsProvider } from '../../types/providers.js'

export type SearchGroup = 'switches' | 'credentials' | 'mixer' | 'playback' | 'local' | 'preview' | 'providers' | 'host' | 'sources' | 'integrations' | 'sound' | 'footer'

const GROUPS: Record<SearchGroup, readonly LocaleKey[]> = {
  switches: [],
  credentials: [],
  mixer: ['settings.detailedVoiceConfig'],
  playback: ['settings.detailedVoiceConfig'],
  local: ['settings.detailedVoiceConfig'],
  preview: ['settings.previewTitle'],
  providers: ['settings.previewTitle', 'settings.provider'],
  host: ['settings.previewTitle', 'settings.hostIntegration'],
  sources: ['settings.previewTitle', 'settings.announcementsTitle'],
  integrations: ['settings.previewTitle', 'settings.announcementsPlugins'],
  sound: ['settings.soundEffectsTitle'],
  footer: [],
}

interface SearchEntry {
  group: SearchGroup
  terms: readonly LocaleKey[]
  aliases?: string
}

const ENTRIES = {
  enabled: { group: 'switches', terms: ['settings.enabled', 'settings.enabledOnLabel', 'settings.enabledOffLabel'] },
  autoPlay: { group: 'switches', terms: ['settings.autoPlay', 'settings.autoPlayHint', 'settings.autoPlayOnLabel', 'settings.autoPlayOffLabel'], aliases: '自动朗读 autoplay' },
  soundEnabled: { group: 'switches', terms: ['settings.soundEffectsEnabled', 'settings.soundEffectsOnLabel', 'settings.soundEffectsOffLabel', 'settings.soundEffectsTurnOn', 'settings.soundEffectsTurnOff'] },
  provider: { group: 'switches', terms: ['settings.switchProvider', 'settings.provider'] },
  apiKey: { group: 'credentials', terms: ['settings.apiKey', 'settings.getApiKey'], aliases: '密钥 credential' },
  model: { group: 'mixer', terms: ['settings.model'] },
  voice: { group: 'mixer', terms: ['settings.voice'] },
  externalVoice: { group: 'mixer', terms: ['settings.voiceReadingVoice'] },
  clonedVoice: { group: 'mixer', terms: ['settings.doubaoClonedVoiceLabel', 'settings.doubaoCloneHint'], aliases: '克隆 clone' },
  voiceDesign: { group: 'mixer', terms: ['settings.voiceDesignPrompt', 'settings.voiceDesignPromptHint'], aliases: '自定义音色 VoiceDesign' },
  instruction: { group: 'mixer', terms: ['settings.speechInstruction', 'settings.speechInstructionLimitations'] },
  voiceVolume: { group: 'playback', terms: ['settings.voiceVolume'], aliases: '朗读音量' },
  voiceRate: { group: 'playback', terms: ['settings.voiceRate', 'settings.voiceRateHint'], aliases: '速度 倍速 speed' },
  readScope: { group: 'playback', terms: ['settings.readScope'], aliases: '文本过滤 精简' },
  localSpeechMode: { group: 'local', terms: ['settings.localSpeechMode', 'settings.localSpeechAuto', 'settings.localSpeechFirst', 'settings.localSpeechDisabled'] },
  browserVoice: { group: 'local', terms: ['settings.localVoice', 'settings.localVoiceEngineBrowser'], aliases: 'Edge 浏览器音色' },
  localEngine: { group: 'local', terms: ['settings.localVoiceEngine', 'settings.localVoiceEngineMoss'] },
  mossBaseURL: { group: 'local', terms: ['settings.mossBaseURL', 'settings.mossProbe', 'settings.mossCopyDeployHint'] },
  mossVoice: { group: 'local', terms: ['settings.mossVoice'] },
  preview: { group: 'preview', terms: ['settings.previewText', 'settings.previewPlay', 'settings.previewPresets', 'settings.previewDownload'] },
  xiaomiEnabled: { group: 'providers', terms: ['settings.providerXiaomi'] },
  doubaoEnabled: { group: 'providers', terms: ['settings.providerDoubao'], aliases: 'Doubao Seed' },
  breezeEnabled: { group: 'providers', terms: ['settings.breezeEnabled'] },
  mossEnabled: { group: 'providers', terms: ['settings.mossProvider'] },
  'settings.readingCaptions': { group: 'host', terms: ['settings.readingCaptions', 'settings.readingCaptionsHint'], aliases: '字幕 captions subtitles' },
  'settings.voiceRecognitionService': { group: 'host', terms: ['settings.voiceRecognitionService', 'settings.voiceRecognitionServiceHint'], aliases: '语音识别 听写 asr speech recognition' },
  'settings.voiceInputCompatibility': { group: 'host', terms: ['settings.voiceInputCompatibility', 'settings.voiceInputCompatibilityHint'] },
  'settings.showInHostSettings': { group: 'host', terms: ['settings.showInHostSettings', 'settings.showInHostSettingsHint'] },
  'settings.showFeatureGuide': { group: 'host', terms: ['settings.showFeatureGuide', 'settings.showFeatureGuideHint'] },
  'settings.acceptExternalProviders': { group: 'host', terms: ['settings.acceptExternalProviders', 'settings.acceptExternalProvidersHint'] },
  'settings.inputAvoidance': { group: 'host', terms: ['settings.inputAvoidance', 'settings.inputAvoidanceHint'] },
  'settings.importantAnnouncementsFirst': { group: 'host', terms: ['settings.importantAnnouncementsFirst', 'settings.importantAnnouncementsFirstHint'] },
  'question-titles': { group: 'sources', terms: ['settings.announcementsQuestions', 'settings.announcementsQuestionsHint'] },
  approvals: { group: 'sources', terms: ['settings.announcementsApprovals', 'settings.announcementsApprovalsHint'] },
  'job-results': { group: 'sources', terms: ['settings.announcementsJobs', 'settings.announcementsJobsHint'] },
  'subagent-results': { group: 'sources', terms: ['settings.announcementsSubagents', 'settings.announcementsSubagentsHint'] },
  'dsh-pet': { group: 'integrations', terms: ['settings.announcementsPet', 'settings.announcementsPetHint'] },
  'dsh-whale-musume': { group: 'integrations', terms: ['settings.announcementsWhale', 'settings.announcementsWhaleHint'] },
  qqbot: { group: 'integrations', terms: ['settings.qqbotIntegration', 'settings.qqbotIntegrationHint'] },
  passport: { group: 'integrations', terms: ['settings.passportIntegration', 'settings.passportIntegrationHint'] },
  soundScope: { group: 'sound', terms: ['settings.soundEffectsScope', 'settings.soundEffectsClickOnly', 'settings.soundEffectsTaskOnly'] },
  soundVolume: { group: 'sound', terms: ['settings.soundEffectsVolume'] },
  soundPack: { group: 'sound', terms: ['settings.soundEffectsPack'] },
  soundPreview: { group: 'sound', terms: ['settings.soundEffectsPreviewLabel'] },
  sidebar: { group: 'footer', terms: ['settings.mountSidebar', 'settings.unmountSidebar', 'settings.sidebarPlacementHint'] },
  minimalMode: { group: 'footer', terms: ['settings.minimalMode', 'settings.defaultModeShort'] },
} satisfies Record<string, SearchEntry>

export type SearchSetting = keyof typeof ENTRIES
type SearchContext = {
  provider: TtsProvider
  externalName?: string | undefined
  voiceDesign: boolean
  doubaoClone: boolean
  soundEnabled: boolean
  mossEnabled: boolean
  mossSelected: boolean
}

const ROWS = Object.entries(ENTRIES) as [SearchSetting, SearchEntry][]
const PROVIDER_LABELS = { xiaomi: 'settings.providerXiaomi', doubao: 'settings.providerDoubao', breeze: 'settings.providerBreeze' } as const
const normalize = (text: string): string => text.normalize('NFKC').toLowerCase()

type Prerequisite = { message: LocaleKey; controls: readonly SearchSetting[] }
const SOUND: Prerequisite = { message: 'settings.searchEnableSound', controls: ['soundEnabled'] }
const MOSS_ENABLE: Prerequisite = { message: 'settings.searchEnableMoss', controls: ['mossEnabled'] }
const MOSS_SELECT: Prerequisite = { message: 'settings.searchSelectMoss', controls: ['localEngine'] }
const BROWSER_SELECT: Prerequisite = { message: 'settings.searchSelectBrowser', controls: ['localEngine'] }
const DESIGN_MODEL: Prerequisite = { message: 'settings.searchSelectVoiceDesign', controls: ['model'] }
const CLONE_MODEL: Prerequisite = { message: 'settings.searchSelectClone', controls: ['model'] }

export function searchSettings(query: string, t: Translate, context: SearchContext) {
  const tokens = normalize(query).trim().split(/\s+/u).filter(Boolean)
  if (tokens.length === 0) return null

  const visible = new Set<SearchSetting>()
  const groups = new Set<SearchGroup>()
  const unavailable: { id: SearchSetting; label: string; message: LocaleKey }[] = []
  const show = (id: SearchSetting): void => {
    visible.add(id)
    groups.add(ENTRIES[id].group)
  }
  const { provider, externalName, voiceDesign, doubaoClone, soundEnabled, mossEnabled, mossSelected } = context
  const providerName = externalName ?? t(PROVIDER_LABELS[provider])

  for (const [id, entry] of ROWS) {
    // Cloud settings describe the current provider and model only.
    if (id === 'model' && !externalName && provider === 'breeze') continue
    if (id === 'voice' && (externalName || (provider === 'xiaomi' && voiceDesign) || (provider === 'doubao' && doubaoClone))) continue
    if (id === 'externalVoice' && !externalName) continue
    if (id === 'clonedVoice' && (externalName || provider !== 'doubao')) continue
    if (id === 'voiceDesign' && (externalName || provider !== 'xiaomi')) continue
    if (id === 'instruction' && !externalName && provider === 'doubao' && doubaoClone) continue
    const ownTerms = normalize([
      ...entry.terms.map(t), entry.aliases,
      ...((id === 'provider' || id === 'apiKey') ? [providerName] : []),
    ].join(' '))
    const haystack = `${ownTerms} ${normalize(GROUPS[entry.group].map(t).join(' '))}`
    if (!tokens.every(token => haystack.includes(token))) continue

    let prerequisite: Prerequisite | null = null
    if (entry.group === 'sound' && !soundEnabled) prerequisite = SOUND
    else if (id === 'localEngine' && !mossEnabled) prerequisite = MOSS_ENABLE
    else if (id === 'mossBaseURL' || id === 'mossVoice') prerequisite = !mossEnabled ? MOSS_ENABLE : !mossSelected ? MOSS_SELECT : null
    else if (id === 'browserVoice' && mossSelected) prerequisite = BROWSER_SELECT
    else if (id === 'voiceDesign' && !voiceDesign) prerequisite = DESIGN_MODEL
    else if (id === 'clonedVoice' && !doubaoClone) prerequisite = CLONE_MODEL

    if (prerequisite) {
      // A group match opens that group; only explicit field matches need a prerequisite hint.
      if (entry.group !== 'sound' && !tokens.some(token => ownTerms.includes(token))) continue
      unavailable.push({ id, label: t(entry.terms[0]!), message: prerequisite.message })
      prerequisite.controls.forEach(show)
    } else {
      show(id)
      if (id === 'mossVoice') show('mossBaseURL') // The catalog is populated by the probe beside the URL.
    }
  }

  return { visible, groups, unavailable }
}

export type SettingsSearchResult = ReturnType<typeof searchSettings>
