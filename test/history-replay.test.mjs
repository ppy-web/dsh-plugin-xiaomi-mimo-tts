import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { AudioHistory } from '../src/client/history/audio-history.ts'
import { filterAudioHistory, HistoryDownloads, historyTime } from '../src/client/history/history-list.ts'

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
const rate = moduleUrl(ts.transpile(await readFile(new URL('../src/client/playback/voice-rate.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext }))
const replayCode = ts.transpile(await readFile(new URL('../src/client/history/history-replay.ts', import.meta.url), 'utf8'), { module: ts.ModuleKind.ESNext })
  .replace('../playback/voice-rate.js', rate)
const { HistoryReplay } = await import(moduleUrl(replayCode))

async function fixture(t) {
  const originalAudio = globalThis.Audio
  const create = URL.createObjectURL
  const revoke = URL.revokeObjectURL
  const media = []
  const revoked = []
  const created = []
  URL.createObjectURL = (blob) => { const url = `blob:${created.length}`; created.push({ blob, url }); return url }
  URL.revokeObjectURL = (url) => revoked.push(url)
  globalThis.Audio = class extends EventTarget {
    constructor(src) { super(); this.src = src; this.currentTime = 0; this.duration = 60; this.paused = true; this.error = null; media.push(this) }
    async play() { this.paused = false; if (this.nextPlay) return this.nextPlay() }
    pause() { this.paused = true }
    removeAttribute() { this.src = '' }
    load() {}
  }
  const history = new AudioHistory({ load: async () => [], replace: async () => {}, close() {} })
  for (const text of ['Alpha', 'Beta']) await history.add({ text, source: 'conversation', format: 'mp3', blob: new Blob([text]) })
  let before = 0
  const replay = new HistoryReplay(history, () => { before += 1 })
  replay.activate()
  t.after(async () => {
    replay.dispose()
    await history.dispose()
    if (originalAudio === undefined) delete globalThis.Audio
    else globalThis.Audio = originalAudio
    URL.createObjectURL = create
    URL.revokeObjectURL = revoke
  })
  return { history, replay, entries: history.getSnapshot().entries, media, created, revoked, before: () => before }
}

test('search and source compose, match case-insensitively, and keep newest first', () => {
  const entries = [
    { id: 'old', createdAt: 1, text: 'HELLO world', source: 'conversation' },
    { id: 'preview', createdAt: 3, text: 'hello tone', source: 'preview' },
    { id: 'new', createdAt: 2, text: 'Hello again', source: 'conversation' },
  ]
  assert.deepEqual(filterAudioHistory(entries, ' hello ', 'conversation').map((entry) => entry.id), ['new', 'old'])
  assert.deepEqual(filterAudioHistory(entries, '', 'all').map((entry) => entry.id), ['preview', 'new', 'old'])
  assert.deepEqual(filterAudioHistory(entries, 'missing', 'all'), [])
  assert.equal(historyTime(Infinity), '00:00')
  assert.equal(historyTime(65.9), '01:05')
})

test('replay pauses, resumes, seeks and ends without advancing; follows volume and pitch-preserving rate', async (t) => {
  const f = await fixture(t)
  f.replay.configure(0.4, 1.5, () => {})
  await f.replay.play(f.entries[0])
  const audio = f.media[0]
  audio.dispatchEvent(new Event('loadedmetadata'))
  assert.equal(audio.volume, 0.4)
  assert.equal(audio.playbackRate, 1.5)
  assert.equal(audio.preservesPitch, true)
  f.replay.seek(25)
  assert.equal(audio.currentTime, 25)
  f.replay.pause()
  assert.equal(f.replay.getSnapshot().status, 'paused')
  await f.replay.play(f.entries[0])
  assert.equal(audio.currentTime, 25)
  f.replay.seek(100)
  assert.equal(audio.currentTime, 60)
  audio.dispatchEvent(new Event('ended'))
  assert.equal(f.replay.getSnapshot().status, 'ended')
  assert.equal(f.replay.getSnapshot().entryId, f.entries[0].id)
  await f.replay.play(f.entries[0])
  assert.equal(audio.currentTime, 0)
})

test('switching ignores old media events and rejected play promises and releases old bytes', async (t) => {
  const f = await fixture(t)
  await f.replay.play(f.entries[0])
  const old = f.media[0]
  let rejectOld
  old.nextPlay = () => new Promise((resolve, reject) => { rejectOld = reject })
  const pending = f.replay.play(f.entries[0])
  await f.replay.play(f.entries[1])
  old.dispatchEvent(new Event('ended'))
  old.dispatchEvent(new Event('error'))
  rejectOld(new Error('late failure'))
  await pending
  assert.equal(f.replay.getSnapshot().entryId, f.entries[1].id)
  assert.equal(f.replay.getSnapshot().status, 'playing')
  assert.equal(old.paused, true)
  assert.equal(old.src, '')
  assert.deepEqual(f.revoked, ['blob:0'])
})

test('pausing pending playback prevents its late resolution from restoring playing status', async (t) => {
  const f = await fixture(t)
  await f.replay.play(f.entries[0])
  let finish
  f.media[0].nextPlay = () => new Promise((resolve) => { finish = resolve })
  const pending = f.replay.play(f.entries[0])
  f.replay.pause()
  finish()
  await pending
  assert.equal(f.replay.getSnapshot().status, 'paused')
})

test('blocked and undecodable audio report actionable failures and can retry', async (t) => {
  const f = await fixture(t)
  await f.replay.play(f.entries[0])
  f.media[0].nextPlay = async () => { throw new DOMException('blocked', 'NotAllowedError') }
  await f.replay.play(f.entries[0])
  assert.equal(f.replay.getSnapshot().error, 'blocked')
  await f.replay.play(f.entries[0])
  assert.equal(f.replay.getSnapshot().status, 'playing')
  const audio = f.media.at(-1)
  audio.error = { code: 3 }
  audio.dispatchEvent(new Event('error'))
  assert.equal(f.replay.getSnapshot().error, 'decode')
  await f.replay.play(f.entries[0])
  assert.equal(f.replay.getSnapshot().status, 'playing')
})

test('history and competing playback interrupt replay; deleting active entries and disposing release resources', async (t) => {
  const f = await fixture(t)
  await f.replay.play(f.entries[0])
  assert.equal(f.before(), 1)
  f.history.stopReplay()
  assert.equal(f.replay.getSnapshot().status, 'paused')
  await f.replay.play(f.entries[0])
  await f.history.remove(f.entries[1].id)
  assert.equal(f.replay.getSnapshot().status, 'playing')
  await f.history.remove(f.entries[0].id)
  assert.equal(f.replay.getSnapshot().entryId, null)
  assert.equal(f.media[0].paused, true)
  await f.history.add({ text: 'third', source: 'service', format: 'wav', blob: new Blob(['third']) })
  await f.replay.play(f.history.getSnapshot().entries[0])
  await f.history.clear()
  assert.equal(f.replay.getSnapshot().status, 'idle')
  assert.equal(f.revoked.length, 2)
  f.replay.dispose()
  await f.replay.play(f.entries[0])
  assert.equal(f.created.length, 2)
})

test('downloads preserve filename and bytes and release URLs after consumption or page cleanup', async (t) => {
  const f = await fixture(t)
  const originalDocument = globalThis.document
  const clicked = []
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() { clicked.push({ href: this.href, filename: this.download }) }, remove() {} }) }
  t.after(() => { if (originalDocument === undefined) delete globalThis.document; else globalThis.document = originalDocument })
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const downloads = new HistoryDownloads()
  t.after(() => downloads.dispose())
  downloads.download(f.entries[0])
  assert.ok(clicked[0].filename.endsWith('.mp3'))
  assert.equal(await f.created[0].blob.text(), f.entries[0].text)
  assert.equal(f.revoked.length, 0)
  t.mock.timers.tick(1000)
  assert.equal(f.revoked.length, 1)
  downloads.download(f.entries[1])
  downloads.dispose()
  assert.equal(f.revoked.length, 2)
})
