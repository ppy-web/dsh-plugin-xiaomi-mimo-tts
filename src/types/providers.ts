import type { TtsModel } from './models.js'
import type { ResolvedTtsSettings } from './settings.js'
import { normalizeVoiceRate } from '../utils/encoding.js'

export const TTS_PROVIDERS = ['xiaomi', 'doubao', 'breeze'] as const
export type TtsProvider = typeof TTS_PROVIDERS[number]

/** Available choices, in the order used by the provider switch. */
export function availableTtsProviders(doubaoEnabled: boolean, breezeEnabled: boolean): TtsProvider[] {
  return TTS_PROVIDERS.filter(provider => provider === 'xiaomi' || (provider === 'doubao' ? doubaoEnabled : breezeEnabled))
}

export function nextTtsProvider(provider: TtsProvider, doubaoEnabled: boolean, breezeEnabled: boolean): TtsProvider {
  const options = availableTtsProviders(doubaoEnabled, breezeEnabled)
  return options[(options.indexOf(provider) + 1) % options.length]!
}
export const DOUBAO_TTS_MODELS = ['seed-tts-2.0', 'seed-icl-2.0'] as const
export type DoubaoTtsModel = typeof DOUBAO_TTS_MODELS[number]
export const BREEZE_TTS_MODEL = 'breeze-tts-2' as const
// Official public catalog: https://breezeblue.ai/zh/voice-library (verified 2026-11-02)
export const BREEZE_VOICE_PRESETS = [
  { value: 'voc_rh6e8hdbraz6', name: '哈基米娘', language: 'zh' },
  { value: 'voc_b86bfwct4cjn', name: '香农小姐', language: 'zh' },
  { value: 'voc_8yud7hz7c9q2', name: '大肥鱼（迷糊版）', language: 'zh' },
  { value: 'voc_u3nxkd5578wc', name: '大肥鱼（机灵版）', language: 'zh' },
  { value: 'voc_reys5un5t4ed', name: '深思先生', language: 'zh' },
  { value: 'voc_pczdutjax3bc', name: '实录观察者', language: 'zh' },
  { value: 'voc_ytteeuvt48pm', name: '岁月回声', language: 'zh' },
  { value: 'voc_mmbkawdhpk29', name: '晨光记录员', language: 'zh' },
  { value: 'voc_dzumjsqzf948', name: '素言叙事', language: 'zh' },
  { value: 'voc_3n4rhszjst3f', name: '青衿师语', language: 'zh' },
  { value: 'voc_zbggdxky3yu3', name: '深夜观察者', language: 'zh' },
  { value: 'voc_xb3zjqcmwp44', name: '晨曦讲解员', language: 'zh' },
  { value: 'voc_ynfyjw6yrv7p', name: '雅致述评人', language: 'zh' },
  { value: 'voc_vhv3b2252en7', name: '星海引路人', language: 'zh' },
  { value: 'voc_tzneby749yja', name: '灵动汐语', language: 'zh' },
  { value: 'voc_nmea5hnwvwcu', name: '幽兰语者', language: 'zh' },
  { value: 'voc_t2kpg5h4ebah', name: '热点快评员', language: 'zh' },
  { value: 'voc_rye44d226x46', name: '雅韵谈锋', language: 'zh' },
  { value: 'voc_kvzxd25fpshp', name: '晨露花语', language: 'zh' },
  { value: 'voc_chsmgh7pkufq', name: '元气茶香', language: 'zh' },
  { value: 'voc_7jsxftc2rm3n', name: '墨香少女', language: 'zh' },
  { value: 'voc_csdwmam68z4k', name: '疾风信使', language: 'zh' },
  { value: 'voc_shetwnrd3q3q', name: '静谧流年', language: 'zh' },
  { value: 'voc_2z7zu82z2eu3', name: '林间漫语者', language: 'zh' },
  { value: 'voc_wuwu3ckdfe4q', name: '云端播报员', language: 'zh' },
  { value: 'voc_yu7t5b4tx7c7', name: '深夜树洞', language: 'zh' },
  { value: 'voc_9zyu28uzmjsk', name: '八方馆掌柜', language: 'zh' },
  { value: 'voc_2b358584ukkb', name: '晨曦热血少年', language: 'zh' },
  { value: 'voc_ge466ug83952', name: '智械管家', language: 'zh' },
  { value: 'voc_f3zbgr88pz5m', name: '月夜低语者', language: 'zh' },
] as const

/** Public synthesis selection. Secrets and upstream addresses are Host-only. */
export type TtsSelection =
  | { provider: 'xiaomi'; model: TtsModel; voice: string; voiceDesignPrompt: string; speechInstruction?: string }
  | { provider: 'doubao'; model: DoubaoTtsModel; voice: string; voiceRate?: number; speechInstruction?: string }
  | { provider: 'breeze'; model: typeof BREEZE_TTS_MODEL; voice: string; voiceRate?: number; speechInstruction?: string }

export function ttsSelection(settings: ResolvedTtsSettings): TtsSelection {
  if (settings.provider === 'doubao') return { provider: 'doubao', model: settings.doubaoModel, voice: settings.doubaoModel === 'seed-icl-2.0' ? settings.doubaoClonedVoice : settings.doubaoVoice, voiceRate: normalizeVoiceRate(settings.voiceRate), ...(settings.doubaoModel === 'seed-tts-2.0' ? { speechInstruction: settings.doubaoInstruction.trim() } : {}) }
  if (settings.provider === 'breeze') return { provider: 'breeze', model: BREEZE_TTS_MODEL, voice: settings.breezeVoice, voiceRate: normalizeVoiceRate(settings.voiceRate), speechInstruction: settings.breezeInstruction.trim() }
  return { provider: 'xiaomi', model: settings.model, voice: settings.voice, voiceDesignPrompt: settings.voiceDesignPrompt, speechInstruction: settings.instruction.trim() }
}

export function supportsRealtimeTts(settings: ResolvedTtsSettings): boolean {
  if (settings.provider === 'doubao' || settings.provider === 'breeze') return true
  return settings.provider === 'xiaomi' && settings.model === 'mimo-v2.5-tts'
}

export function ttsApiKey(settings: ResolvedTtsSettings): string {
  const key = settings.provider === 'doubao' ? settings.doubaoApiKey : settings.provider === 'breeze' ? settings.breezeApiKey : settings.apiKey
  return key.trim()
}
