import type TextToSpeech from '@deepseek-ai/dsh-text-to-speech'
import type { SynthesisFailureCode, SynthesisProviderView } from '@deepseek-ai/dsh-text-to-speech/types'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { abortable } from './abortable.js'
import { TtsProviderError } from './provider-error.js'

export type HostTextToSpeech = Pick<TextToSpeech, 'snapshot' | 'resolve' | 'synthesize'>

const FAILURE_STATUS: Record<SynthesisFailureCode, { code: string; status: number }> = {
  'sign-in-required': { code: 'api-key-not-configured', status: 409 },
  'api-key-invalid': { code: 'api-key-rejected', status: 401 },
  'rate-limited': { code: 'rate-limited', status: 429 },
  'quota-exceeded': { code: 'resource-unavailable', status: 402 },
  'service-unavailable': { code: 'deepseek-request-failed', status: 502 },
  'text-rejected': { code: 'content-filtered', status: 400 },
  'timeout': { code: 'tts-timeout', status: 504 },
  'service-error': { code: 'deepseek-request-failed', status: 502 },
}

export function selectedHostProvider(service?: Pick<TextToSpeech, 'snapshot'>): SynthesisProviderView | undefined {
  if (!service) return undefined
  const snapshot = service.snapshot()
  return snapshot.providers.find(provider => provider.id === snapshot.selected)
}

export function hostDeepseekReady(service?: Pick<TextToSpeech, 'snapshot'>): boolean {
  return selectedHostProvider(service)?.availability.phase === 'ready'
}

function mapHostSynthesisError(error: unknown): TtsProviderError {
  if (error instanceof TtsProviderError) return error
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
    ? error.code as SynthesisFailureCode
    : undefined
  const mapped = code && Object.hasOwn(FAILURE_STATUS, code) ? FAILURE_STATUS[code] : undefined
  return mapped
    ? new TtsProviderError(mapped.code, undefined, mapped.status)
    : new TtsProviderError('deepseek-request-failed', undefined, 502)
}

export async function streamDeepseek(
  text: string,
  settings: ResolvedTtsSettings,
  signal: AbortSignal,
  consume: (bytes: Uint8Array) => void | Promise<void>,
  textToSpeech?: HostTextToSpeech,
): Promise<void> {
  signal.throwIfAborted()
  if (!text.trim()) throw new TtsProviderError('text-required', undefined, 400)
  const provider = selectedHostProvider(textToSpeech)
  if (!textToSpeech || provider === undefined || provider.availability.phase === 'unavailable') {
    throw new TtsProviderError('api-key-not-configured', 'Enable DeepSeek Read Aloud and sign in on the Host.', 409)
  }
  if (provider.availability.phase === 'failed') {
    throw new TtsProviderError('deepseek-request-failed', undefined, 502)
  }

  const voice = provider.voices.includes(settings.deepseekVoice) ? settings.deepseekVoice : provider.voice
  let audioBytes = 0
  let tail = Buffer.alloc(0)
  try {
    const spec = textToSpeech.resolve({ text, voice })
    for await (const raw of textToSpeech.synthesize(spec, signal)) {
      signal.throwIfAborted()
      const chunk = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength)
      if (!chunk.length) continue
      audioBytes += chunk.length
      if (audioBytes + 44 > settings.maxWavAudioBytes) throw new TtsProviderError('audio-too-large')
      const bytes = tail.length ? Buffer.concat([tail, chunk]) : chunk
      const end = bytes.length - bytes.length % 2
      tail = Buffer.from(bytes.subarray(end))
      if (end) await abortable(Promise.resolve(consume(bytes.subarray(0, end))), signal)
    }
    signal.throwIfAborted()
    if (!audioBytes || tail.length) throw new TtsProviderError('stream-incomplete')
  } catch (error) {
    signal.throwIfAborted()
    throw mapHostSynthesisError(error)
  }
}
