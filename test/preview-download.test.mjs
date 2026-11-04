import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'
import { withDuplexBrowser } from './helpers/duplex-browser.mjs'

const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')
const { HistoryDownloads } = await loadClientModule('src/client/history/history-list.ts')
const settings = resolveTtsSettings({ provider: 'breeze', breezeEnabled: true, breezeVoice: 'test-voice', localSpeechMode: 'disabled' })

test('completed preview retains the original MP3 for download without another synthesis request', async () => {
  await withBrowserPlayback(async state => {
    const player = new PreviewPlayer(() => {})
    try {
      assert.equal(player.getRecording(), null)
      const playing = player.play('试听下载', settings)
      await settle()
      state.media.at(-1).onended()
      await playing
      const recording = player.getRecording()
      assert.equal(recording.format, 'mp3')
      assert.equal(recording.text, '试听下载')
      assert.equal(await recording.blob.text(), 'original MP3 bytes')
      assert.equal(state.requests.length, 1)
      player.stop()
      assert.equal(player.getRecording(), null)
    } finally { await player.dispose() }
  }, { fetch: () => new Response('original MP3 bytes', { headers: { 'content-type': 'audio/mpeg' } }) })
})

test('Xiaomi streaming preview exposes a playable WAV containing the received PCM', async () => {
  await withBrowserPlayback(async () => {
    const player = new PreviewPlayer(() => {})
    try {
      await player.play('流式试听', resolveTtsSettings({ localSpeechMode: 'disabled' }))
      const recording = player.getRecording()
      assert.equal(recording.format, 'wav')
      const bytes = new Uint8Array(await recording.blob.arrayBuffer())
      assert.equal(new TextDecoder().decode(bytes.subarray(0, 4)), 'RIFF')
      assert.equal(new TextDecoder().decode(bytes.subarray(8, 12)), 'WAVE')
      assert.deepEqual([...bytes.subarray(44)], [0, 0])
    } finally { await player.dispose() }
  }, { endPcm: true })
})

test('Doubao duplex preview retains all received samples as WAV', async () => {
  await withBrowserPlayback(async () => {
    await withDuplexBrowser(async () => {
      const player = new PreviewPlayer(() => {})
      try {
        await player.play('豆包试听', resolveTtsSettings({ provider: 'doubao', doubaoVoice: 'test-voice', localSpeechMode: 'disabled' }))
        const recording = player.getRecording()
        assert.equal(recording.format, 'wav')
        assert.deepEqual([...new Uint8Array(await recording.blob.arrayBuffer()).subarray(44)], [0, 0, 1, 0])
      } finally { await player.dispose() }
    })
  }, { endPcm: true })
})

test('cancelling a partial stream never exposes the incomplete audio for download', async () => {
  let stream
  await withBrowserPlayback(async () => {
    const player = new PreviewPlayer(() => {})
    try {
      const playing = player.play('取消试听', resolveTtsSettings({ localSpeechMode: 'disabled' }))
      await settle()
      player.stop()
      stream.close()
      await playing
      assert.equal(player.getRecording(), null)
    } finally { await player.dispose() }
  }, { fetch: () => new Response(new ReadableStream({ start(controller) { stream = controller; controller.enqueue(pcmEvent()) } })) })
})

test('late responses after cancellation and browser-only previews cannot reuse a previous recording', async () => {
  let respond
  await withBrowserPlayback(async () => {
    const player = new PreviewPlayer(() => {})
    try {
      const playing = player.play('过期试听', settings)
      await settle()
      player.stop()
      respond(new Response('late MP3'))
      await playing
      assert.equal(player.getRecording(), null)
    } finally { await player.dispose() }
  }, { fetch: () => new Promise(resolve => { respond = resolve }) })

  await withBrowserPlayback(async state => {
    const player = new PreviewPlayer(() => {})
    try {
      const remote = player.play('云端试听', settings)
      await settle()
      state.media.at(-1).onended()
      await remote
      assert.ok(player.getRecording())
      const local = player.playBrowserPreview('本地试听', settings)
      await settle()
      state.utterances.at(-1).onend()
      await local
      assert.equal(player.getRecording(), null)
    } finally { await player.dispose() }
  }, { fetch: () => new Response('MP3') })
})

test('preview download consumes the provided blob and releases its object URL on disposal', () => {
  const originalDocument = globalThis.document
  const create = URL.createObjectURL
  const revoke = URL.revokeObjectURL
  const blob = new Blob(['audio bytes'], { type: 'audio/mpeg' })
  let clicked = false
  let removed = false
  const revoked = []
  const anchor = { click() { clicked = true }, remove() { removed = true } }
  globalThis.document = { createElement: () => anchor, body: { appendChild() {} } }
  URL.createObjectURL = value => { assert.equal(value, blob); return 'blob:preview-download' }
  URL.revokeObjectURL = url => revoked.push(url)
  const downloads = new HistoryDownloads()
  try {
    downloads.downloadBlob(blob, 'preview.mp3')
    assert.equal(anchor.href, 'blob:preview-download')
    assert.equal(anchor.download, 'preview.mp3')
    assert.ok(clicked && removed)
    downloads.dispose()
    assert.deepEqual(revoked, ['blob:preview-download'])
  } finally {
    downloads.dispose()
    globalThis.document = originalDocument
    URL.createObjectURL = create
    URL.revokeObjectURL = revoke
  }
})
