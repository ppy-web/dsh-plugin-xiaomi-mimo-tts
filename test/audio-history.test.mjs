import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { AudioHistory, AUDIO_HISTORY_MAX_BYTES, AUDIO_HISTORY_MAX_ENTRIES, retainAudioHistory } from '../src/client/history/audio-history.ts'
import { PcmRecording } from '../src/client/history/pcm-recording.ts'

function storage(initial = []) {
  let entries = initial
  return {
    load: async () => entries,
    replace: async (next) => { entries = structuredClone(next) },
    close() {},
  }
}

const input = (text = 'hello', blob = new Blob(['audio'], { type: 'audio/mpeg' })) => ({ text, blob, format: 'mp3', source: 'conversation' })

test('saved audio survives controller cleanup, restores, deletes, and clears with original bytes', async () => {
  const backend = storage()
  const history = new AudioHistory(backend)
  const blob = new Blob([Uint8Array.of(1, 2, 3, 4)], { type: 'audio/mpeg' })
  await history.add(input('第一条', blob))
  await history.add(input('第二条'))
  await history.dispose()
  const restored = new AudioHistory(backend)
  await restored.add(input('第三条'))
  const first = restored.getSnapshot().entries.find((entry) => entry.text === '第一条')
  assert.deepEqual(new Uint8Array(await first.blob.arrayBuffer()), Uint8Array.of(1, 2, 3, 4))
  await restored.remove(first.id)
  assert.equal(restored.getSnapshot().entries.length, 2)
  await restored.clear()
  assert.equal((await backend.load()).length, 0)
  await restored.dispose()
})

test('history bounds count and byte size, trims text, and ignores empty or oversized audio', async () => {
  const history = new AudioHistory(storage())
  await Promise.all(Array.from({ length: AUDIO_HISTORY_MAX_ENTRIES + 3 }, (_, index) => history.add(input(String(index)))))
  assert.equal(history.getSnapshot().entries.length, AUDIO_HISTORY_MAX_ENTRIES)
  assert.ok(!history.getSnapshot().entries.some((entry) => entry.text === '0'))
  await history.add(input('x'.repeat(700)))
  assert.equal(history.getSnapshot().entries[0].text.length, 500)
  const before = history.getSnapshot().entries.length
  await history.add(input('empty', new Blob([])))
  await history.add(input('large', { size: AUDIO_HISTORY_MAX_BYTES + 1 }))
  assert.equal(history.getSnapshot().entries.length, before)
  assert.equal(history.getSnapshot().skipped, true)
  const entries = [
    { id: 'old', createdAt: 1, blob: { size: 60 * 1024 * 1024 } },
    { id: 'new', createdAt: 2, blob: { size: 60 * 1024 * 1024 } },
  ]
  assert.deepEqual(retainAudioHistory(entries).map((entry) => entry.id), ['new'])
  await history.dispose()
})

test('unavailable storage and quota failure preserve audio in memory without blocking playback', async () => {
  for (const backend of [
    { load: async () => { throw new Error('blocked') }, replace: async () => {}, close() {} },
    { load: async () => [], replace: async () => { throw new Error('quota') }, close() {} },
  ]) {
    const history = new AudioHistory(backend)
    await assert.doesNotReject(history.add(input()))
    assert.equal(history.getSnapshot().status, 'memory')
    assert.equal(history.getSnapshot().entries.length, 1)
    await history.clear()
    assert.equal(history.getSnapshot().entries.length, 0)
    await history.dispose()
    await history.add(input())
    assert.equal(history.getSnapshot().entries.length, 0)
  }
})

test('PCM recording preserves split sample bytes in a standard 24 kHz mono WAV', async () => {
  const recording = new PcmRecording()
  recording.append(Buffer.from([1]).toString('base64'))
  recording.append(Buffer.from([2, 3, 4]).toString('base64'))
  const wav = recording.toWav()
  assert.equal(wav.type, 'audio/wav')
  const bytes = Buffer.from(await wav.arrayBuffer())
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.readUInt32LE(4), bytes.length - 8)
  assert.equal(bytes.toString('ascii', 8, 12), 'WAVE')
  assert.equal(bytes.readUInt16LE(22), 1)
  assert.equal(bytes.readUInt32LE(24), 24000)
  assert.equal(bytes.readUInt16LE(34), 16)
  assert.equal(bytes.readUInt32LE(40), 4)
  assert.deepEqual([...bytes.subarray(44)], [1, 2, 3, 4])
  assert.equal(new PcmRecording().toWav(), null)
  const limited = new PcmRecording(2)
  limited.append('AQIDBA==')
  assert.equal(limited.toWav(), null)
  const odd = new PcmRecording()
  odd.append('AQ==')
  assert.equal(odd.toWav(), null)
})

// Compile client TS in memory; network and browser media are the only mocked boundaries.
const rateCode = ts.transpile(await readFile(new URL('../src/client/playback/voice-rate.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext })
const rateUrl = `data:text/javascript;base64,${Buffer.from(rateCode).toString('base64')}`
const playbackCode = ts.transpile(await readFile(new URL('../src/client/playback/playback-controller.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext })
  .replace('../../shared.js', new URL('../lib/shared.js', import.meta.url).href)
  .replace('./voice-rate.js', rateUrl)
const { PlaybackController } = await import(`data:text/javascript;base64,${Buffer.from(playbackCode).toString('base64')}`)

test('completed and autoplay-blocked audio stay in history; cancelled late responses do not', async () => {
  const originalAudio = globalThis.Audio
  const originalFetch = globalThis.fetch
  let media
  let blocked = false
  globalThis.Audio = class extends EventTarget {
    constructor(url) { super(); this.src = url; this.paused = true; media = this }
    async play() { if (blocked) throw new Error('blocked'); this.paused = false }
    pause() { this.paused = true }
    removeAttribute() {}
    load() {}
  }
  const history = new AudioHistory(storage())
  const playback = new PlaybackController(history)
  playback.activateSession('session')
  const blob = new Blob(['original'], { type: 'audio/mpeg' })
  try {
    globalThis.fetch = async () => new Response(blob)
    await playback.toggle('session', 'one', 'hello', false)
    media.dispatchEvent(new Event('ended'))
    await history.add(input('barrier'))
    const saved = history.getSnapshot().entries.find((entry) => entry.messageId === 'one')
    assert.equal(await saved.blob.text(), 'original')
    assert.equal(playback.getSnapshot().status, 'idle')
    blocked = true
    await playback.toggle('session', 'two', 'blocked', true)
    await history.add(input('barrier2'))
    assert.ok(history.getSnapshot().entries.some((entry) => entry.messageId === 'two'))
    let resolveFetch
    globalThis.fetch = () => new Promise((resolve) => { resolveFetch = resolve })
    const late = playback.toggle('session', 'late', 'cancel me', false)
    playback.interrupt()
    resolveFetch(new Response(blob))
    await late
    await history.add(input('barrier3'))
    assert.ok(!history.getSnapshot().entries.some((entry) => entry.messageId === 'late'))
  } finally {
    playback.dispose()
    await history.dispose()
    globalThis.fetch = originalFetch
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
  }
})
