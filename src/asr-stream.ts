/**
 * Browser transport for one ASR dictation request: POST the recorded WAV to
 * the same-origin transcription route and surface each upstream transcription
 * delta (`choices[0].delta.content`) as it arrives over SSE.
 */
import { asrDeltasFromChunk } from './asr-core.js'
import { debugConsole } from './debug-console.js'
import { ASR_STREAM_ROUTE } from './shared.js'

const STREAM_LOG = '[MiMoTTS ASR]'
let nextAsrRequestId = 1

export type AsrDeltaConsumer = (fullText: string) => void

function errorMessageFromBody(body: unknown, status: number): string {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const record = body as Record<string, unknown>
    const error = record.error
    if (typeof error === 'string' && error.length > 0) return error
    if (error !== null && typeof error === 'object' && !Array.isArray(error)) {
      const message = (error as Record<string, unknown>).message
      if (typeof message === 'string' && message.length > 0) return message
    }
    if (typeof record.message === 'string' && record.message.length > 0) return record.message
  }
  return `transcribe-request-${status}`
}

async function errorFromBody(response: Response): Promise<Error> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    body = undefined
  }
  return new Error(errorMessageFromBody(body, response.status))
}

/** Request one transcription stream and deliver the accumulated text after every delta. */
export async function streamAsrTranscription(wav: Uint8Array<ArrayBuffer>, signal: AbortSignal, consume: AsrDeltaConsumer): Promise<string> {
  const requestId = nextAsrRequestId++
  if (signal.aborted) {
    debugConsole?.warn(STREAM_LOG, `[请求 ${requestId}] 发起前已取消`)
    return ''
  }
  debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] POST ${ASR_STREAM_ROUTE}`, { wavBytes: wav.byteLength })
  const response = await fetch(ASR_STREAM_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
    body: new Blob([wav], { type: 'audio/wav' }),
    signal,
  })
  debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 收到 HTTP 响应`, { ok: response.ok, status: response.status, contentType: response.headers.get('content-type') })
  if (!response.ok) throw await errorFromBody(response)
  if (response.body === null) throw new Error('transcribe-response-empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let text = ''
  let deltas = 0
  try {
    while (!signal.aborted) {
      const result = await reader.read()
      if (result.done || signal.aborted) break
      pending += decoder.decode(result.value, { stream: true })
      const parsed = asrDeltasFromChunk(pending)
      pending = parsed.remainder
      for (const delta of parsed.deltas) {
        text += delta
        deltas += 1
        debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 收到转写增量 #${deltas}`, { chars: delta.length })
        consume(text)
      }
    }
    pending += decoder.decode()
    if (!signal.aborted && pending.trim().length > 0) {
      const parsed = asrDeltasFromChunk(`${pending}\n\n`)
      for (const delta of parsed.deltas) {
        text += delta
        deltas += 1
        consume(text)
      }
    }
  } finally {
    reader.releaseLock()
    debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 响应流读取结束`, { aborted: signal.aborted, deltas })
  }
  if (!signal.aborted) debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 转写完成`, { totalChars: text.length })
  return text
}
