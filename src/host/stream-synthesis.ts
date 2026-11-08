import type { ResolvedTtsSettings } from '../shared.js'
import { parseSseRecords } from '../utils/index.js'
import { streamXiaomi } from './xiaomi.js'
import { streamBreeze, evenPcmChunks } from './breeze.js'
import { synthesizeDoubao } from './doubao.js'
import { PcmQueue } from './pcm-queue.js'
import type { SynthesisRuntime } from './complete-synthesis.js'
import { TtsProviderError } from './provider-error.js'

/** Host integrations use upstream transports directly, without a local HTTP round-trip. */
export async function streamSynthesis(settings: ResolvedTtsSettings, text: string, signal: AbortSignal,
  consume: (bytes: Uint8Array) => void | Promise<void>, runtime: SynthesisRuntime): Promise<void> {
  if (settings.provider === 'doubao') {
    const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal])
    const queue = new PcmQueue(settings.maxPausedPcmBytes, combined)
    const task = synthesizeDoubao(text, { settings, signal: combined, format: 'pcm',
      ...(runtime.connectDoubao ? { connect: runtime.connectDoubao } : {}), onAudio: bytes => queue.push(bytes) })
    void task.then(() => queue.end(), error => queue.end(error))
    try { for await (const chunk of queue) await consume(chunk); await task }
    finally { controller.abort(); await task.catch(() => {}) }
    return
  }
  if (settings.provider === 'breeze') {
    const response = await streamBreeze(settings, text, signal)
    for await (const chunk of evenPcmChunks(response.body!)) await consume(chunk)
    return
  }
  const response = await streamXiaomi(settings, text, signal)
  if (!response.body) throw new TtsProviderError('stream-response-empty')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let pending = '', ended = false, received = false
  const records = async (events: string[]) => {
    for (const event of events) {
      if (event === '[DONE]') { ended = true; continue }
      if (ended) throw new TtsProviderError('invalid-stream-response')
      const value = JSON.parse(event) as { error?: unknown; choices?: { delta?: { audio?: { data?: unknown } } }[] }
      if (value.error) throw new TtsProviderError('tts-upstream-error')
      const audio = value.choices?.[0]?.delta?.audio?.data
      if (typeof audio !== 'string' || !audio) continue
      const bytes = Buffer.from(audio, 'base64')
      if (bytes.toString('base64') !== audio) throw new TtsProviderError('invalid-audio-format')
      received = true; await consume(bytes)
    }
  }
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      pending += decoder.decode(item.value, { stream: true })
      if (pending.length > settings.maxPausedPcmBytes * 2) throw new TtsProviderError('stream-buffer-limit')
      const parsed = parseSseRecords(pending); pending = parsed.remainder
      await records(parsed.events)
    }
    pending += decoder.decode()
    if (pending.trim()) await records(parseSseRecords(`${pending}\n\n`).events)
    if (!received || !ended) throw new TtsProviderError('stream-incomplete')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
