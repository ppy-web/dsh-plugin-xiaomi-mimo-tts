import { useCallback, useSyncExternalStore } from 'react'
import type { SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import { TTS_MODELS } from '../shared.js'
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
  if (value.format === 'mp3' || value.format === 'wav') decoded.format = value.format
  if (typeof value.autoPlay === 'boolean') decoded.autoPlay = value.autoPlay
  if (typeof value.maxTextLength === 'number') decoded.maxTextLength = value.maxTextLength
  if (typeof value.requestTimeoutMs === 'number') decoded.requestTimeoutMs = value.requestTimeoutMs
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
