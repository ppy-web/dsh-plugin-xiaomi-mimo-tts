import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

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
  let origin = time.now()
  for (let offset = 0; offset < pcm.length; offset += PACKET_BYTES) {
    const chunk = pcm.subarray(offset, offset + PACKET_BYTES)
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
  }
}
