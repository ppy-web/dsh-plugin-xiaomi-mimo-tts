import type { MossVoice } from '../moss.js'
import { normalizeMossBaseURL, parseMossDemoList } from '../moss.js'
import { strictBase64DecodedLength } from '../utils/encoding.js'
import { TtsProviderError } from './provider-error.js'

/** Bounded slice of the MOSS health payload the settings UI can display. */
export interface MossProbeHealth {
  status?: string
  device?: string
  cpuRuntimeLoaded?: boolean
  textNormalizationStatus?: string
}

/** Bounded slice of `/api/warmup-status`. */
export interface MossWarmupStatus {
  ready: boolean
  failed: boolean
  state: string
  progress: number
  message: string
}

export interface MossProbeResult {
  baseURL: string
  health: MossProbeHealth
  warmup: MossWarmupStatus | null
  voices: MossVoice[]
}

const HEALTH_JSON_LIMIT = 1024 * 1024
const WARMUP_JSON_LIMIT = 1024 * 1024
const DEMO_PAGE_LIMIT = 8 * 1024 * 1024

function hasHeader(response: Response, name: string): string | null {
  return response.headers.get(name)
}

async function readLimitedText(response: Response, limit: number): Promise<string> {
  const declared = hasHeader(response, 'content-length')
  if (declared !== null && /^\d+$/u.test(declared) && Number(declared) > limit) {
    await response.body?.cancel().catch(() => {})
    throw new TtsProviderError('moss-response-too-large', 'The MOSS service response is too large.', 413)
  }
  if (response.body === null) return ''
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) {
        await reader.cancel().catch(() => {})
        throw new TtsProviderError('moss-response-too-large', 'The MOSS service response is too large.', 413)
      }
      chunks.push(Buffer.from(chunk.value))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size).toString('utf8')
}

async function readLimitedJson(response: Response, limit: number): Promise<unknown> {
  const text = await readLimitedText(response, limit)
  if (text.trim().length === 0) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** Fetch the MOSS server while distinguishing transport failures from cancellation. */
async function mossFetch(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal })
  } catch (error) {
    if (signal.aborted) throw error
    throw new TtsProviderError('moss-unreachable', 'Cannot reach the local MOSS service.', 502)
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function healthView(value: unknown): MossProbeHealth {
  const source = record(value) ?? {}
  const text = (key: string): string | undefined => typeof source[key] === 'string' ? source[key] as string : undefined
  const status = text('status')
  const device = text('device')
  const normalization = text('text_normalization_status')
  return {
    ...(status === undefined ? {} : { status }),
    ...(device === undefined ? {} : { device }),
    ...(typeof source.cpu_runtime_loaded === 'boolean' ? { cpuRuntimeLoaded: source.cpu_runtime_loaded } : {}),
    ...(normalization === undefined ? {} : { textNormalizationStatus: normalization }),
  }
}

function warmupView(value: unknown): MossWarmupStatus | null {
  const source = record(value)
  if (source === undefined) return null
  return {
    ready: source.ready === true,
    failed: source.failed === true,
    state: typeof source.state === 'string' ? source.state : 'unknown',
    progress: typeof source.progress === 'number' && Number.isFinite(source.progress) ? Math.max(0, Math.min(1, source.progress)) : 0,
    message: typeof source.message === 'string' ? source.message.slice(0, 500) : '',
  }
}

async function fetchHealth(baseURL: string, signal: AbortSignal): Promise<MossProbeHealth> {
  const response = await mossFetch(`${baseURL}/health`, { headers: { accept: 'application/json' } }, signal)
  if (!response.ok) throw new TtsProviderError('moss-api-error', `MOSS health check failed (${response.status}).`, response.status)
  return healthView(await readLimitedJson(response, HEALTH_JSON_LIMIT))
}

async function fetchWarmup(baseURL: string, signal: AbortSignal): Promise<MossWarmupStatus | null> {
  try {
    const response = await mossFetch(`${baseURL}/api/warmup-status`, { headers: { accept: 'application/json' } }, signal)
    if (!response.ok) return null
    return warmupView(await readLimitedJson(response, WARMUP_JSON_LIMIT))
  } catch (error) {
    if (signal.aborted) throw error
    // Warmup reporting is optional; the health endpoint already proved reachability.
    return null
  }
}

async function fetchVoices(baseURL: string, signal: AbortSignal): Promise<MossVoice[]> {
  try {
    const response = await mossFetch(`${baseURL}/`, { headers: { accept: 'text/html' } }, signal)
    if (!response.ok) return []
    return parseMossDemoList(await readLimitedText(response, DEMO_PAGE_LIMIT))
  } catch (error) {
    if (signal.aborted) throw error
    // Voice discovery is optional: a reachable server without a demo page can
    // still synthesize if the user already stored a demo id.
    if (error instanceof TtsProviderError && error.code === 'moss-response-too-large') return []
    return []
  }
}

/** Probe a local MOSS-TTS-Nano server and return its health, warmup state and demo voices. */
export async function probeMoss(baseURL: string, signal: AbortSignal): Promise<MossProbeResult> {
  const normalized = normalizeMossBaseURL(baseURL)
  const health = await fetchHealth(normalized, signal)
  const warmup = await fetchWarmup(normalized, signal)
  const voices = await fetchVoices(normalized, signal)
  return { baseURL: normalized, health, warmup, voices }
}

export interface MossSynthesisOptions {
  maxAudioBytes: number
}

/**
 * Synthesize one utterance with the deployed MOSS demo server.
 *
 * `/api/generate` returns a Base64 WAV envelope; the caller owns timeouts and
 * cancellation through `signal`.
 */
export async function synthesizeMoss(baseURL: string, voice: string, text: string, signal: AbortSignal, options: MossSynthesisOptions): Promise<Buffer> {
  const normalized = normalizeMossBaseURL(baseURL)
  const demoId = voice.trim()
  if (demoId.length === 0) throw new TtsProviderError('moss-voice-required', 'Select a MOSS local voice.', 400)

  const form = new FormData()
  form.set('text', text)
  form.set('demo_id', demoId)
  form.set('max_new_frames', '1024')
  form.set('enable_text_normalization', '1')
  form.set('enable_normalize_tts_text', '1')

  const response = await mossFetch(`${normalized}/api/generate`, { method: 'POST', body: form }, signal)
  const audioLimit = Math.max(1, Math.floor(options.maxAudioBytes))
  const jsonLimit = 4 * Math.ceil(audioLimit / 3) + 1024 * 1024
  const payload = await readLimitedJson(response, jsonLimit)
  if (!response.ok) {
    const message = typeof record(payload)?.error === 'string' ? (record(payload)?.error as string).slice(0, 500) : `MOSS synthesis failed (${response.status}).`
    throw new TtsProviderError('moss-api-error', message, response.status)
  }
  const audioBase64 = record(payload)?.audio_base64
  if (typeof audioBase64 !== 'string' || audioBase64.length === 0) throw new TtsProviderError('moss-invalid-response', 'MOSS returned no audio.', 502)
  const decodedLength = strictBase64DecodedLength(audioBase64)
  if (decodedLength === null) throw new TtsProviderError('moss-invalid-response', 'MOSS returned invalid audio.', 502)
  if (decodedLength > audioLimit) throw new TtsProviderError('moss-audio-too-large', 'MOSS audio exceeds the configured limit.', 413)
  const audio = Buffer.from(audioBase64, 'base64')
  if (audio.byteLength !== decodedLength || audio.byteLength < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new TtsProviderError('moss-invalid-response', 'MOSS returned invalid audio.', 502)
  }
  return audio
}
