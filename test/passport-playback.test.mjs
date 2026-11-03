import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { sendPlaybackPcm } = await loadClientModule('src/passport/playback.ts')
const bytesPerMs = 48

test('PCM remains near real-time with coarse Windows timers and preserves every sample in order', async () => {
  const input = Buffer.alloc(5000 * bytesPerMs + 318)
  for (let i = 0; i < input.length; i++) input[i] = i % 251
  let now = 0, sentBytes = 0
  const chunks = []
  await sendPlaybackPcm(input, chunk => {
    chunks.push(chunk)
    sentBytes += chunk.length
    assert.ok(sentBytes / bytesPerMs <= now + 300, 'queued audio must fit the device buffer')
  }, new AbortController().signal, {
    now: () => now,
    wait: async ms => { now += Math.ceil(ms / 15.625) * 15.625 },
  })
  assert.deepEqual(Buffer.concat(chunks), input)
  assert.ok(now >= 4700 && now <= 5050, `five seconds of audio must retain a bounded lead instead of accumulating timer drift: ${now}`)
})

test('a long host stall resumes with bounded audio bursts rather than flooding the device queue', async () => {
  const input = Buffer.alloc(5000 * bytesPerMs)
  let now = 0, stalled = false, previousTime = -1, burst = 0, total = 0
  await sendPlaybackPcm(input, chunk => {
    if (now !== previousTime) { previousTime = now; burst = 0 }
    burst += chunk.length
    total += chunk.length
    assert.ok(burst / bytesPerMs <= 300, 'catch-up bursts must stay within device capacity')
  }, new AbortController().signal, {
    now: () => now,
    wait: async ms => {
      now += ms
      if (!stalled && now >= 400) { now += 2000; stalled = true }
    },
  })
  assert.ok(stalled)
  assert.equal(total, input.length, 'resynchronizing the sender clock must not skip audio')
})

test('cancelling a paced wait stops further audio immediately', async () => {
  const controller = new AbortController()
  let sent = 0
  await assert.rejects(sendPlaybackPcm(Buffer.alloc(1000 * bytesPerMs), chunk => { sent += chunk.length }, controller.signal, {
    now: () => 0,
    wait: async (_ms, signal) => { controller.abort(); signal.throwIfAborted() },
  }), { name: 'AbortError' })
  assert.ok(sent > 0 && sent <= 300 * bytesPerMs)
  const before = sent
  await assert.rejects(sendPlaybackPcm(Buffer.alloc(bytesPerMs * 20), () => { sent++ }, controller.signal), { name: 'AbortError' })
  assert.equal(sent, before, 'already cancelled replies must send no samples')
})

test('transport errors stop subsequent PCM delivery and propagate to playback cleanup', async () => {
  const error = new Error('test-transport-failure')
  let sends = 0
  await assert.rejects(sendPlaybackPcm(Buffer.alloc(1000 * bytesPerMs), () => { sends++; throw error }, new AbortController().signal), value => value === error)
  assert.equal(sends, 1)
})
