import { hasMp3Header, hasWavHeader } from './audio-format.js'
import type { ResolvedTtsSettings } from '../types/settings.js'
import { BREEZE_TTS_MODEL } from '../types/providers.js'
import { readLimitedResponseBytes, readLimitedResponseText } from './http.js'
import { TtsProviderError } from './provider-error.js'
import type { CompleteAudioFormat } from './validation.js'

const ERROR_BODY_LIMIT = 64 * 1024

const BREEZE_BASE_URL = 'https://api.breeze.blue/v1'

function voiceEndpoint(settings: ResolvedTtsSettings, format: string, stream = false): string {
  return `${BREEZE_BASE_URL}/text-to-speech/${encodeURIComponent(settings.breezeVoice.trim())}${stream ? '/stream' : ''}?output_format=${format}`
}

async function upstreamError(response: Response): Promise<never> {
  let code = `HTTP_${response.status}`
  let message = `Breeze TTS request failed (HTTP ${response.status})`
  try {
    const raw = await readLimitedResponseText(response, ERROR_BODY_LIMIT)
    const body = raw ? JSON.parse(raw) as { code?: unknown; detail?: unknown; error?: unknown } : {}
    if (typeof body.code === 'string' && body.code) code = body.code
    if (typeof body.detail === 'string' && body.detail) message = body.detail
    else if (typeof body.error === 'string' && body.error) message = body.error
  } catch { /* retain status fallback */ }
  throw new TtsProviderError('breeze-api-error', message, response.status, code)
}

function requestBody(settings: ResolvedTtsSettings, text: string): string {
  return JSON.stringify({
    text,
    model_id: BREEZE_TTS_MODEL,
    ...(settings.breezeInstruction.trim() ? { instructions: settings.breezeInstruction.trim() } : {}),
    voice_settings: { speed: settings.voiceRate },
  })
}

export async function synthesizeBreeze(settings: ResolvedTtsSettings, text: string, format: CompleteAudioFormat, limit: number, signal: AbortSignal): Promise<Buffer> {
  const target = voiceEndpoint(settings, format)
  const response = await fetch(target, {
    method: 'POST', redirect: 'error', signal,
    headers: { 'xi-api-key': settings.breezeApiKey.trim(), 'content-type': 'application/json', accept: format === 'wav' ? 'audio/wav' : 'audio/mpeg', 'user-agent': 'dsh-xiaomi-tts' },
    body: requestBody(settings, text),
  })
  if (!response.ok) await upstreamError(response)
  if (!response.body) throw new TtsProviderError('invalid-breeze-response', 'Breeze returned an empty audio response.')
  const length = response.headers.get('content-length')
  if (length && /^\d+$/u.test(length) && Number(length) > limit) {
    await response.body.cancel().catch(() => {})
    throw new TtsProviderError('audio-too-large', 'Breeze audio exceeds the configured limit.', 413)
  }
  const audio = await readLimitedResponseBytes(
    response,
    limit,
    () => new TtsProviderError('audio-too-large', 'Breeze audio exceeds the configured limit.', 413),
  )
  const valid = format === 'wav' ? hasWavHeader(audio) : hasMp3Header(audio)
  if (!valid) throw new TtsProviderError('invalid-audio-format', 'Breeze returned an invalid audio format.')
  return audio
}

export async function streamBreeze(settings: ResolvedTtsSettings, text: string, signal: AbortSignal): Promise<Response> {
  const response = await fetch(voiceEndpoint(settings, 'pcm', true), {
    method: 'POST', redirect: 'error', signal,
    headers: { 'xi-api-key': settings.breezeApiKey.trim(), 'content-type': 'application/json', accept: 'audio/pcm', 'user-agent': 'dsh-xiaomi-tts' },
    body: requestBody(settings, text),
  })
  if (!response.ok) await upstreamError(response)
  if (!response.body) throw new TtsProviderError('invalid-breeze-response')
  return response
}

/**
 * Upstream chunks are not guaranteed to end on a 16-bit sample boundary. The
 * player decodes every SSE event independently, so carry the odd byte into
 * the next frame and emit even-sized PCM only.
 */
export async function* evenPcmChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Buffer> {
  const reader = body.getReader()
  let pending: Buffer | null = null
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value === undefined || value.byteLength === 0) continue
      let chunk: Buffer = pending === null ? Buffer.from(value) : Buffer.concat([pending, Buffer.from(value)])
      pending = null
      if (chunk.length % 2 === 1) {
        pending = Buffer.from(chunk.subarray(chunk.length - 1))
        chunk = chunk.subarray(0, chunk.length - 1)
      }
      if (chunk.length > 0) yield chunk
    }
    if (pending !== null) yield Buffer.from([pending[0]!, 0])
  } finally {
    reader.releaseLock()
  }
}
