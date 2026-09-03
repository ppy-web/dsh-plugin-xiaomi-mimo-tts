import { parseSseRecords, TTS_STREAM_ROUTE } from './shared.js'
import { debugConsole } from './debug-console.js'

const STREAM_LOG = '[MiMoTTS Stream]'
let nextStreamRequestId = 1

export type PcmChunkConsumer = (pcmBase64: string) => void | Promise<void>

function pcmDeltaFromSse(data: string): string | null {
  if (data === '[DONE]') return null
  const value = JSON.parse(data) as {
    choices?: Array<{ delta?: { audio?: { data?: unknown } } }>
    error?: string | { message?: string }
  }
  const upstreamError = typeof value.error === 'string' ? value.error : value.error?.message
  if (upstreamError !== undefined) throw new Error(upstreamError)
  const pcm = value.choices?.[0]?.delta?.audio?.data
  return typeof pcm === 'string' && pcm.length > 0 ? pcm : null
}

/** Request one preset-model PCM16 stream and deliver each decoded SSE audio payload in order. */
export async function streamPcmAudio(text: string, signal: AbortSignal, consume: PcmChunkConsumer): Promise<void> {
  const requestId = nextStreamRequestId++
  if (signal.aborted) {
    debugConsole?.warn(STREAM_LOG, `[请求 ${requestId}] 发起前已取消`)
    return
  }
  debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] POST ${TTS_STREAM_ROUTE}`, { text, model: 'mimo-v2.5-tts' })
  const response = await fetch(TTS_STREAM_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, model: 'mimo-v2.5-tts' }),
    signal,
  })
  debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 收到 HTTP 响应`, { ok: response.ok, status: response.status, contentType: response.headers.get('content-type') })
  if (signal.aborted) {
    debugConsole?.warn(STREAM_LOG, `[请求 ${requestId}] 收到响应后已取消`)
    return
  }
  if (!response.ok) throw new Error(`stream-request-${response.status}`)
  if (response.body === null) throw new Error('stream-response-empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let receivedPcm = false
  let pcmChunks = 0
  let pcmBase64Chars = 0
  const consumeEvents = async (events: string[]): Promise<void> => {
    for (const event of events) {
      if (signal.aborted) return
      const pcm = pcmDeltaFromSse(event)
      if (pcm === null) continue
      pcmChunks += 1
      pcmBase64Chars += pcm.length
      debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 收到 PCM 块 #${pcmChunks}`, { base64Chars: pcm.length })
      await consume(pcm)
      receivedPcm = true
    }
  }

  try {
    while (!signal.aborted) {
      const result = await reader.read()
      if (result.done || signal.aborted) break
      pending += decoder.decode(result.value, { stream: true })
      const parsed = parseSseRecords(pending)
      pending = parsed.remainder
      await consumeEvents(parsed.events)
    }
    pending += decoder.decode()
    if (!signal.aborted && pending.trim().length > 0) {
      await consumeEvents(parseSseRecords(`${pending}\n\n`).events)
    }
  } finally {
    reader.releaseLock()
    debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 响应流读取结束`, { aborted: signal.aborted, pcmChunks, pcmBase64Chars })
  }

  if (!signal.aborted && !receivedPcm) throw new Error('stream-audio-empty')
  if (!signal.aborted) debugConsole?.info(STREAM_LOG, `[请求 ${requestId}] 流式合成完成`, { pcmChunks, pcmBase64Chars })
}
