/**
 * Host half of the MiMo ASR dictation route: `/plugins/xiaomi-mimo-tts/transcribe-stream`.
 *
 * Accepts one raw `audio/wav` upload (16 kHz mono PCM16, ≤120 s, ~4 MiB),
 * validates the RIFF/WAVE container, converts it to Base64, and issues exactly
 * one upstream `/chat/completions` request with `model: mimo-v2.5-asr` and
 * `stream: true`. The SSE response is proxied verbatim; aborting the browser
 * request aborts the upstream call. No retry is attempted so one recording
 * stays one billable request.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { ASR_LANGUAGE, ASR_MAX_DURATION_SECONDS, ASR_MAX_WAV_BYTES, ASR_MODEL, ASR_SAMPLE_RATE } from './shared.js'

export interface AsrWavValidation {
  /** PCM16 sample frame count implied by the data chunk. */
  frames: number
}

export type AsrWavErrorCode = 'invalid-wav' | 'wav-not-pcm16' | 'wav-channels-unsupported' | 'wav-sample-rate-unsupported' | 'wav-too-long'

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let text = ''
  for (let index = 0; index < length; index++) text += String.fromCharCode(bytes[offset + index] ?? 0)
  return text
}

/**
 * Validate an uploaded WAV container without decoding its samples.
 * Accepts standard chunk layouts (`fmt ` and `data` in any order, extra
 * chunks allowed) and enforces PCM16, mono, 16 kHz, and the 120-second limit.
 */
export function validateAsrWav(bytes: Uint8Array): AsrWavValidation | AsrWavErrorCode {
  if (bytes.byteLength < 44 || readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WAVE') {
    return 'invalid-wav'
  }

  let format: number | undefined
  let channels: number | undefined
  let sampleRate: number | undefined
  let bitsPerSample: number | undefined
  let dataBytes: number | undefined
  let offset = 12
  while (offset + 8 <= bytes.byteLength) {
    const id = readAscii(bytes, offset, 4)
    const size = bytes[offset + 4]! | (bytes[offset + 5]! << 8) | (bytes[offset + 6]! << 16) | (bytes[offset + 7]! << 24)
    const payloadStart = offset + 8
    if (size < 0 || payloadStart + size > bytes.byteLength) return 'invalid-wav'
    if (id === 'fmt ' && size >= 16) {
      const view = new DataView(bytes.buffer, bytes.byteOffset + payloadStart, size)
      format = view.getUint16(0, true)
      channels = view.getUint16(2, true)
      sampleRate = view.getUint32(4, true)
      bitsPerSample = view.getUint16(14, true)
    } else if (id === 'data') {
      dataBytes = size
    }
    offset = payloadStart + size + (size % 2) // chunks are word-aligned
  }

  if (format === undefined || dataBytes === undefined) return 'invalid-wav'
  if (format !== 1 || bitsPerSample !== 16) return 'wav-not-pcm16'
  if (channels !== 1) return 'wav-channels-unsupported'
  if (sampleRate !== ASR_SAMPLE_RATE) return 'wav-sample-rate-unsupported'
  if (dataBytes % 2 !== 0) return 'invalid-wav'
  const frames = dataBytes / 2
  if (frames > ASR_SAMPLE_RATE * ASR_MAX_DURATION_SECONDS) return 'wav-too-long'
  return { frames }
}

/** Build the single upstream transcription request body (one Data URL message). */
export function asrRequestBody(wavBase64: string): Record<string, unknown> {
  return {
    model: ASR_MODEL,
    messages: [{
      role: 'user',
      content: [{
        type: 'input_audio',
        input_audio: { data: `data:audio/wav;base64,${wavBase64}` },
      }],
    }],
    asr_options: { language: ASR_LANGUAGE },
    stream: true,
  }
}

interface UpstreamErrorShape {
  error?: string | { message?: string }
  message?: string
}

function upstreamErrorMessage(status: number, parsed: UpstreamErrorShape | undefined): string {
  const detail = typeof parsed?.error === 'string'
    ? parsed.error
    : parsed?.error?.message ?? parsed?.message
  return detail && detail.length > 0
    ? detail
    : `Xiaomi MiMo ASR request failed (HTTP ${status})`
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += bytes.byteLength
    if (size > limit) throw new Error('request-body-too-large')
    chunks.push(bytes)
  }
  return Buffer.concat(chunks, size)
}

export interface TranscribeStreamDeps {
  apiKey: string
  baseURL: string
  requestTimeoutMs: number
  fetchImpl?: typeof fetch
  requestLog?: (message: string, detail?: unknown) => void
  errorLog?: (message: string, detail?: unknown) => void
}

/** Handle one browser transcription request; see the module header for the contract. */
export async function handleTranscribeStream(req: IncomingMessage, res: ServerResponse, deps: TranscribeStreamDeps): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST')
    json(res, 405, { error: 'method-not-allowed' })
    return
  }

  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite !== undefined && fetchSite !== 'same-origin') {
    json(res, 403, { error: 'same-origin-required' })
    return
  }

  const contentType = String(req.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'audio/wav') {
    json(res, 415, { error: 'audio-wav-required' })
    return
  }

  let wav: Buffer
  try {
    wav = await readBody(req, ASR_MAX_WAV_BYTES)
  } catch (error) {
    json(res, error instanceof Error && error.message === 'request-body-too-large' ? 413 : 400, {
      error: error instanceof Error && error.message === 'request-body-too-large' ? 'request-body-too-large' : 'invalid-body',
    })
    return
  }

  const validation = validateAsrWav(wav)
  if (typeof validation === 'string') {
    deps.requestLog?.('拒绝：非法 WAV 上传', { code: validation, bytes: wav.byteLength })
    json(res, 400, { error: validation })
    return
  }

  if (deps.apiKey.length === 0) {
    json(res, 409, { error: 'api-key-not-configured' })
    return
  }

  const fetchImpl = deps.fetchImpl ?? fetch
  const endpoint = `${deps.baseURL.replace(/\/+$/u, '')}/chat/completions`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), deps.requestTimeoutMs)
  const abortOnDisconnect = () => controller.abort()
  req.once('aborted', abortOnDisconnect)
  res.once('close', abortOnDisconnect)

  try {
    // Exactly one upstream request per recording; no retry.
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: `Bearer ${deps.apiKey}`,
        'content-type': 'application/json',
        accept: 'text/event-stream',
      },
      body: JSON.stringify(asrRequestBody(wav.toString('base64'))),
      signal: controller.signal,
    })
    deps.requestLog?.('上游响应', { status: response.status, contentType: response.headers.get('content-type'), frames: validation.frames })

    if (!response.ok) {
      let parsed: UpstreamErrorShape | undefined
      try {
        parsed = await response.json() as UpstreamErrorShape
      } catch {
        parsed = undefined
      }
      json(res, response.status, { error: 'xiaomi-api-error', message: upstreamErrorMessage(response.status, parsed) })
      return
    }
    if (response.body === null) {
      json(res, 502, { error: 'invalid-xiaomi-response', message: 'Xiaomi MiMo ASR response had no body.' })
      return
    }

    res.statusCode = 200
    res.setHeader('content-type', response.headers.get('content-type') ?? 'text/event-stream; charset=utf-8')
    res.setHeader('cache-control', 'no-store')
    res.setHeader('x-accel-buffering', 'no')
    const reader = response.body.getReader()
    try {
      while (!res.destroyed) {
        const chunk = await reader.read()
        if (chunk.done) break
        res.write(chunk.value)
      }
    } finally {
      reader.releaseLock()
    }
    if (!res.destroyed) res.end()
  } catch (error) {
    deps.errorLog?.('转写代理失败', { aborted: controller.signal.aborted, error })
    if (!res.destroyed && !res.writableEnded) {
      const aborted = controller.signal.aborted
      json(res, aborted ? 504 : 502, {
        error: aborted ? 'xiaomi-timeout' : 'xiaomi-request-failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    clearTimeout(timeout)
    req.off('aborted', abortOnDisconnect)
    res.off('close', abortOnDisconnect)
  }
}
