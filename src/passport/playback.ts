import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import { abortable } from '../host/external-providers.js'

interface PlaybackClock {
  now(): number
  wait(ms: number, signal: AbortSignal): Promise<void>
}

const clock: PlaybackClock = {
  now: () => performance.now(),
  wait: (ms, signal) => delay(ms, undefined, { signal }),
}
const BYTES_PER_MS = 24000 * 2 / 1000
const PACKET_BYTES = 960
// Stay below the device's 32-entry queue, including two entries per wire packet.
const LEAD_MS = 160

/** Keep PCM ahead of playback without accumulating timer drift or stale catch-up bursts. */
export async function sendPlaybackPcm(pcm: Buffer, send: (chunk: Buffer) => void, signal: AbortSignal,
  time: PlaybackClock = clock): Promise<void> {
  await sendPlaybackStream((async function* () { yield pcm })(), send, signal, Infinity, time)
}

export async function sendPlaybackStream(source: AsyncIterable<Uint8Array>, send: (chunk: Buffer) => void,
  signal: AbortSignal, maxSeconds: number, time: PlaybackClock = clock): Promise<void> {
  signal.throwIfAborted()
  let origin = time.now()
  let offset = 0, pending = Buffer.alloc(0)
  const forward = async (chunk: Buffer) => {
    if (offset + chunk.length > maxSeconds * 48000) throw new Error('passport-reply-too-long')
    for (;;) {
      signal.throwIfAborted()
      const now = time.now()
      // A long host stall must not dump all overdue audio into the device queue.
      origin = Math.max(origin, now - offset / BYTES_PER_MS)
      const remaining = origin + (offset + chunk.length) / BYTES_PER_MS - LEAD_MS - now
      if (remaining <= 0) break
      await time.wait(remaining, signal)
    }
    signal.throwIfAborted()
    send(chunk)
    offset += chunk.length
  }
  const iterator = source[Symbol.asyncIterator]()
  try {
    for (;;) {
      const item = await abortable(iterator.next(), signal)
      if (item.done) break
      signal.throwIfAborted()
      pending = Buffer.concat([pending, item.value])
      while (pending.length >= PACKET_BYTES) {
        await forward(pending.subarray(0, PACKET_BYTES))
        pending = pending.subarray(PACKET_BYTES)
      }
    }
  } finally { void iterator.return?.().catch(() => {}) }
  if (pending.length % 2 || !offset && !pending.length) throw new Error('passport-invalid-reply-audio')
  if (pending.length) await forward(pending)
}
