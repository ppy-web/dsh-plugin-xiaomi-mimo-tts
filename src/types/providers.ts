import type { TtsModel } from './models.js'
import type { ResolvedTtsSettings } from './settings.js'
import { normalizeVoiceRate } from '../utils/encoding.js'

export const TTS_PROVIDERS = ['xiaomi', 'doubao', 'breeze'] as const
export type TtsProvider = typeof TTS_PROVIDERS[number]
export const DOUBAO_TTS_MODELS = ['seed-tts-2.0', 'seed-icl-2.0'] as const
export type DoubaoTtsModel = typeof DOUBAO_TTS_MODELS[number]
export const BREEZE_TTS_MODEL = 'breeze-tts-2' as const
export const BREEZE_VOICE_PRESETS = [
  { value: 'voc_rh6e8hdbraz6', name: '哈基米娘', language: 'zh' },
  { value: 'voc_b86bfwct4cjn', name: '香农小姐', language: 'zh' },
  { value: 'voc_8yud7hz7c9q2', name: '大肥鱼（迷糊版）', language: 'zh' },
  { value: 'voc_u3nxkd5578wc', name: '大肥鱼（机灵版）', language: 'zh' },
  { value: 'voc_reys5un5t4ed', name: '深思先生', language: 'zh' },
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
  // Breeze has no incremental speech protocol in this plugin: reading a reply
  // from complete audio keeps its documented audio tags intact.
  if (settings.provider === 'doubao') return true
  return settings.provider === 'xiaomi' && settings.model === 'mimo-v2.5-tts'
}

export function ttsApiKey(settings: ResolvedTtsSettings): string {
  const key = settings.provider === 'doubao' ? settings.doubaoApiKey : settings.provider === 'breeze' ? settings.breezeApiKey : settings.apiKey
  return key.trim()
}
