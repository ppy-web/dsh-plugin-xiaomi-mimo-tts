import { useCallback, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { TTS_FORMATS, TTS_MODELS, TTS_VOICE_DESIGN_PLAYBACK_MODES } from '../shared.js'
import type { TtsSettings } from '../shared.js'

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function decodeSettings(value: unknown): TtsSettings | undefined {
  if (!isRecord(value)) return undefined
  const decoded: TtsSettings = {}
  if (typeof value.enabled === 'boolean') decoded.enabled = value.enabled
  if (typeof value.apiKey === 'string') decoded.apiKey = value.apiKey
  if (typeof value.baseURL === 'string') decoded.baseURL = value.baseURL
  if (TTS_MODELS.includes(value.model as typeof TTS_MODELS[number])) decoded.model = value.model as typeof TTS_MODELS[number]
  if (typeof value.voice === 'string') decoded.voice = value.voice
  if (typeof value.voiceDesignPrompt === 'string') decoded.voiceDesignPrompt = value.voiceDesignPrompt
  if (typeof value.voiceDesignCustomPrompt === 'string') decoded.voiceDesignCustomPrompt = value.voiceDesignCustomPrompt
  if (TTS_FORMATS.includes(value.format as typeof TTS_FORMATS[number])) decoded.format = value.format as typeof TTS_FORMATS[number]
  if (TTS_VOICE_DESIGN_PLAYBACK_MODES.includes(value.voiceDesignPlaybackMode as typeof TTS_VOICE_DESIGN_PLAYBACK_MODES[number])) decoded.voiceDesignPlaybackMode = value.voiceDesignPlaybackMode as typeof TTS_VOICE_DESIGN_PLAYBACK_MODES[number]
  if (typeof value.autoPlay === 'boolean') decoded.autoPlay = value.autoPlay
  if (typeof value.maxTextLength === 'number') decoded.maxTextLength = value.maxTextLength
  if (typeof value.requestTimeoutMs === 'number') decoded.requestTimeoutMs = value.requestTimeoutMs
  if (typeof value.maxPausedPcmBytes === 'number') decoded.maxPausedPcmBytes = value.maxPausedPcmBytes
  return decoded
}

export function useSettingsSnapshot<T>(scope: SettingsScope<T>) {
  const subscribe = useCallback((listener: () => void) => scope.subscribe(listener), [scope])
  const getSnapshot = useCallback(() => scope.getSnapshot(), [scope])
  return useSyncExternalStore(
    subscribe,
    getSnapshot,
    getSnapshot,
  )
}
