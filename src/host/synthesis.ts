import type { ResolvedTtsSettings } from '../types/index.js'

export interface SynthesizeBody {
  provider?: unknown
  text?: unknown
  /** Segmented VoiceDesign playback requests WAV for reliable per-segment decoding. */
  format?: unknown
  /** Optional, validated overrides used by the settings-card preview. */
  model?: unknown
  voice?: unknown
  voiceDesignPrompt?: unknown
  /** Optional speech instruction. Empty string clears the selected provider's saved value for this request. */
  speechInstruction?: unknown
  /** Optional Doubao synthesis speed in multiples of the original rate (0.5–2). */
  voiceRate?: unknown
}

export interface XiaomiAudioResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: unknown
      }
    }
  }>
  error?: string | { message?: string }
  message?: string
}

export function apiErrorMessage(status: number, parsed: XiaomiAudioResponse | undefined): string {
  const detail = typeof parsed?.error === 'string'
    ? parsed.error
    : parsed?.error?.message ?? parsed?.message
  return detail && detail.length > 0
    ? detail
    : `Xiaomi MiMo TTS request failed (HTTP ${status})`
}

export function requestMessages(options: ResolvedTtsSettings, text: string): Array<{ role: 'user' | 'assistant'; content: string }> {
  const instruction = options.instruction.trim()
  const context = options.model === 'mimo-v2.5-tts-voicedesign'
    ? [options.voiceDesignPrompt.trim(), instruction].filter(Boolean).join('\n')
    : instruction || options.presetStylePrompt.trim()
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  if (context.length > 0) messages.push({ role: 'user', content: context })
  messages.push({ role: 'assistant', content: text })
  return messages
}

export function upstreamModel(options: ResolvedTtsSettings): 'mimo-v2.5-tts' | 'mimo-v2.5-tts-voicedesign' {
  return options.model === 'mimo-v2.5-tts-voicedesign' ? options.model : 'mimo-v2.5-tts'
}
