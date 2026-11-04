import type { TtsSettings, ResolvedTtsSettings } from '../types/index.js'
import { DEFAULT_TTS_SETTINGS, TTS_LOCAL_VOICE_ENGINES, TTS_READ_SCOPES, TTS_VOICE_DESIGN_PRESETS, SOUND_PACKS, DOUBAO_TTS_MODELS, ANNOUNCEMENT_SOURCES } from '../types/index.js'
import { DEFAULT_MOSS_BASE_URL } from '../constants.js'
import { normalizeVoiceRate } from './encoding.js'

export function resolveTtsSettings(value: TtsSettings | undefined): ResolvedTtsSettings {
  const resolved = { ...DEFAULT_TTS_SETTINGS, ...value }
  const soundVolume = Number.isFinite(resolved.soundVolume)
    ? Math.max(0, Math.min(1, resolved.soundVolume))
    : DEFAULT_TTS_SETTINGS.soundVolume
  const voiceVolume = Number.isFinite(resolved.voiceVolume)
    ? Math.max(0, Math.min(1, resolved.voiceVolume))
    : DEFAULT_TTS_SETTINGS.voiceVolume
  const voiceRate = normalizeVoiceRate(resolved.voiceRate)
  const readScope = value?.readScope !== undefined && TTS_READ_SCOPES.includes(value.readScope)
    ? value.readScope
    : value?.voiceDesignPlaybackMode === 'first-segment'
      ? 'first-segment'
      : DEFAULT_TTS_SETTINGS.readScope
  const model = resolved.model === 'browser-local-fallback' ? 'mimo-v2.5-tts' : resolved.model
  const voiceDesignCustomPrompt = typeof value?.voiceDesignCustomPrompt === 'string'
    ? value.voiceDesignCustomPrompt
    : TTS_VOICE_DESIGN_PRESETS.some((item) => item.prompt === resolved.voiceDesignPrompt)
      ? DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt
      : resolved.voiceDesignPrompt
  const mossEnabled = resolved.mossEnabled === true
  const localVoiceEngine = TTS_LOCAL_VOICE_ENGINES.includes(resolved.localVoiceEngine) && (resolved.localVoiceEngine !== 'moss' || mossEnabled)
    ? resolved.localVoiceEngine
    : 'browser'
  const mossBaseURL = typeof resolved.mossBaseURL === 'string' && resolved.mossBaseURL.trim().length > 0
    ? resolved.mossBaseURL.trim().replace(/\/+$/u, '')
    : DEFAULT_MOSS_BASE_URL
  return {
    ...resolved,
    showInSidebar: resolved.showInSidebar === true,
    qqbotEnabled: resolved.qqbotEnabled === true,
    announcementSources: ANNOUNCEMENT_SOURCES.filter(source => (Array.isArray(value?.announcementSources) ? value.announcementSources : DEFAULT_TTS_SETTINGS.announcementSources).includes(source)),
    breezeEnabled: resolved.breezeEnabled === true,
    doubaoEnabled: resolved.doubaoEnabled !== false || resolved.breezeEnabled !== true,
    provider: (resolved.provider === 'doubao' && (resolved.doubaoEnabled !== false || resolved.breezeEnabled !== true)) || (resolved.provider === 'breeze' && resolved.breezeEnabled === true) ? resolved.provider : 'xiaomi',
    instruction: typeof resolved.instruction === 'string' ? resolved.instruction : DEFAULT_TTS_SETTINGS.instruction,
    doubaoInstruction: typeof resolved.doubaoInstruction === 'string' ? resolved.doubaoInstruction : '',
    doubaoModel: DOUBAO_TTS_MODELS.includes(resolved.doubaoModel) ? resolved.doubaoModel : 'seed-tts-2.0',
    model,
    voiceDesignCustomPrompt,
    localVoiceEngine,
    mossEnabled,
    mossBaseURL,
    mossVoice: typeof resolved.mossVoice === 'string' ? resolved.mossVoice : '',
    mossVoiceName: typeof resolved.mossVoiceName === 'string' ? resolved.mossVoiceName : '',
    autoPlay: resolved.enabled ? resolved.autoPlay : false,
    soundVolume,
    voiceVolume,
    voiceRate,
    readScope,
    soundPack: SOUND_PACKS.includes(resolved.soundPack) ? resolved.soundPack : DEFAULT_TTS_SETTINGS.soundPack,
  }
}
