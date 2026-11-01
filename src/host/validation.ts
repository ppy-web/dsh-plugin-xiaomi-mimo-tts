import type { ResolvedTtsSettings } from '../types/index.js'
import { TTS_MODELS, TTS_VOICES, DOUBAO_TTS_MODELS, isSupportedTtsApiKey, ttsApiKey, ttsSelection, normalizeVoiceRate } from '../shared.js'
import { TtsProviderError } from './provider-error.js'
import type { SynthesizeBody } from './synthesis.js'

export function synthesisOptions(options: ResolvedTtsSettings, body: SynthesizeBody): ResolvedTtsSettings {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new TtsProviderError('invalid-request', 'Expected an object.', 400)
  if (body.provider !== undefined && body.provider !== 'xiaomi' && body.provider !== 'doubao' && body.provider !== 'breeze') throw new TtsProviderError('invalid-provider', 'Unknown speech provider.', 400)
  const provider = body.provider ?? options.provider
  if (body.speechInstruction !== undefined && typeof body.speechInstruction !== 'string') throw new TtsProviderError('invalid-speech-instruction', 'Speech instruction must be a string.', 400)
  if (provider === 'doubao') {
    if (body.voiceRate !== undefined && (typeof body.voiceRate !== 'number' || !Number.isFinite(body.voiceRate) || body.voiceRate < 0.5 || body.voiceRate > 2)) throw new TtsProviderError('invalid-voice-rate', 'Speech speed must be between 0.5 and 2.', 400)
    if (body.model !== undefined && !DOUBAO_TTS_MODELS.includes(body.model as typeof DOUBAO_TTS_MODELS[number])) throw new TtsProviderError('invalid-model', 'Select a Doubao model.', 400)
    if (body.voice !== undefined && (typeof body.voice !== 'string' || body.voice.trim().length === 0)) throw new TtsProviderError('voice-required', 'Enter a voice ID.', 400)
    const doubaoModel = (body.model ?? options.doubaoModel) as typeof DOUBAO_TTS_MODELS[number]
    return { ...options, provider, doubaoModel, ...(typeof body.voiceRate === 'number' ? { voiceRate: normalizeVoiceRate(body.voiceRate) } : {}), ...(typeof body.speechInstruction === 'string' ? { doubaoInstruction: body.speechInstruction.trim() } : {}), ...(typeof body.voice === 'string' ? { [doubaoModel === 'seed-icl-2.0' ? 'doubaoClonedVoice' : 'doubaoVoice']: body.voice.trim() } : {}) }
  }
  if (provider === 'breeze') {
    if (body.voiceRate !== undefined && (typeof body.voiceRate !== 'number' || !Number.isFinite(body.voiceRate) || body.voiceRate < 0.5 || body.voiceRate > 2)) throw new TtsProviderError('invalid-voice-rate', 'Speech speed must be between 0.5 and 2.', 400)
    if (body.voice !== undefined && (typeof body.voice !== 'string' || body.voice.trim().length === 0)) throw new TtsProviderError('voice-required', 'Enter a voice ID.', 400)
    return { ...options, provider: 'breeze', ...(typeof body.voiceRate === 'number' ? { voiceRate: normalizeVoiceRate(body.voiceRate) } : {}), ...(typeof body.speechInstruction === 'string' ? { breezeInstruction: body.speechInstruction.trim() } : {}), ...(typeof body.voice === 'string' ? { breezeVoice: body.voice.trim() } : {}) }
  }
  if (body.model !== undefined && !TTS_MODELS.includes(body.model as typeof TTS_MODELS[number])) throw new TtsProviderError('invalid-model', 'Select a Xiaomi model.', 400)
  const model = TTS_MODELS.includes(body.model as typeof TTS_MODELS[number])
    ? body.model as typeof TTS_MODELS[number]
    : options.model
  const voice = TTS_VOICES.includes(body.voice as typeof TTS_VOICES[number])
    ? body.voice as typeof TTS_VOICES[number]
    : options.voice
  const voiceDesignPrompt = typeof body.voiceDesignPrompt === 'string' && body.voiceDesignPrompt.trim().length > 0
    ? body.voiceDesignPrompt
    : options.voiceDesignPrompt
  return { ...options, provider: 'xiaomi', model, voice, voiceDesignPrompt, ...(typeof body.speechInstruction === 'string' ? { instruction: body.speechInstruction.trim() } : {}) }
}

export function validateSynthesisSettings(settings: ResolvedTtsSettings): void {
  const key = ttsApiKey(settings)
  if (!key) throw new TtsProviderError('api-key-not-configured', 'Configure the selected provider API key.', 409)
  if (!isSupportedTtsApiKey(key, settings.provider)) throw new TtsProviderError('api-key-rejected', 'Unsupported API key format.', 400)
  if (!ttsSelection(settings).voice.trim()) throw new TtsProviderError('voice-required', 'Enter a voice ID.', 400)
}

export type CompleteAudioFormat = 'mp3' | 'wav'

export function completeAudioFormat(options: ResolvedTtsSettings): CompleteAudioFormat {
  return options.format === 'wav' ? 'wav' : 'mp3'
}

export function completeAudioLimit(options: ResolvedTtsSettings, format: CompleteAudioFormat): number {
  return format === 'mp3' ? options.maxMp3AudioBytes : options.maxWavAudioBytes
}

export function completeAudioJsonLimit(audioLimit: number): number {
  return 4 * Math.ceil(audioLimit / 3) + 1024 * 1024 // TTS_AUDIO_RESPONSE_JSON_OVERHEAD_BYTES
}

export class CompleteAudioResponseError extends Error {
  constructor(readonly code: 'xiaomi-response-too-large' | 'invalid-audio-base64' | 'audio-too-large' | 'invalid-audio-format') {
    super(code)
  }
}

export function chatCompletionsEndpoint(apiKey: string, baseURL: string): string {
  const resolvedBaseURL = apiKey.trim().startsWith('tp-')
    ? 'https://token-plan-cn.xiaomimimo.com/v1'
    : baseURL

  let end = resolvedBaseURL.length
  while (end > 0 && resolvedBaseURL[end - 1] === '/') end -= 1
  const normalized = resolvedBaseURL.slice(0, end)

  const endpoint = `${normalized}/chat/completions`
  if (!URL.canParse(endpoint)) throw new Error('baseURL must be a valid absolute URL')
  return endpoint
}
