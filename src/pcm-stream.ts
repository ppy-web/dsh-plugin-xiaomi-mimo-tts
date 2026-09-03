import { parseSseRecords, TTS_STREAM_ROUTE } from './shared.js'

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
  if (signal.aborted) return
  const response = await fetch(TTS_STREAM_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, model: 'mimo-v2.5-tts' }),
    signal,
  })
  if (signal.aborted) return
  if (!response.ok) throw new Error(`stream-request-${response.status}`)
  if (response.body === null) throw new Error('stream-response-empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let receivedPcm = false
  const consumeEvents = async (events: string[]): Promise<void> => {
    for (const event of events) {
      if (signal.aborted) return
      const pcm = pcmDeltaFromSse(event)
      if (pcm === null) continue
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
  }

  if (!signal.aborted && !receivedPcm) throw new Error('stream-audio-empty')
}
