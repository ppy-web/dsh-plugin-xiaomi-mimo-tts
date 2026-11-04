import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareBreezeTtsText, resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'

const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')
const { evenPcmChunks } = await loadClientModule('src/host/breeze.ts')

const settings = resolveTtsSettings({
  provider: 'breeze',
  breezeEnabled: true,
  breezeApiKey: 'brz_test',
  breezeVoice: 'voc_custom',
  breezeInstruction: 'breeze delivery',
  instruction: 'xiaomi delivery',
  localSpeechMode: 'disabled',
  voiceRate: 1.5,
})

test('Breeze preview sends its own voice and instruction and reports the Breeze source', async () => {
  await withBrowserPlayback(async state => {
    const views = []
    const saved = []
    const player = new PreviewPlayer(view => views.push(view), { stopReplay() {}, add: entry => saved.push(entry) })
    try {
      const playing = player.play('试听一句。', settings)
      await settle()
      state.media.at(-1).onended()
      await playing
      const request = state.requests.at(-1)
      assert.equal(request.provider, 'breeze')
      assert.equal(request.model, 'breeze-tts-2')
      assert.equal(request.voice, 'voc_custom')
      assert.equal(request.speechInstruction, 'breeze delivery')
      assert.equal(request.format, 'mp3')
      assert.equal(request.voiceRate, 1.5)
      assert.equal(state.media.at(-1).playbackRate, 1)
      assert.equal(saved.at(-1).voiceRateApplied, true)
      assert.deepEqual(views.at(-1), { status: 'idle', source: 'breeze', error: null })
    } finally { await player.dispose() }
  }, { fetch: () => new Response('mp3 bytes') })
})

test('Breeze stream frames stay 16-bit aligned across upstream chunk boundaries', async () => {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]))
      controller.enqueue(new Uint8Array([4, 5]))
      controller.enqueue(new Uint8Array([6]))
      controller.close()
    },
  })
  const frames = []
  for await (const frame of evenPcmChunks(source)) frames.push([...frame])
  assert.deepEqual(frames, [[1, 2], [3, 4], [5, 6]])
  assert.ok(frames.every(frame => frame.length % 2 === 0))

  const trailingOdd = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([7]))
      controller.close()
    },
  })
  const flushed = []
  for await (const frame of evenPcmChunks(trailingOdd)) flushed.push([...frame])
  assert.deepEqual(flushed, [[7, 0]])
})

test('Breeze segmented preview keeps audio tags in every request', async () => {
  const text = `${'甲'.repeat(1005)}[轻笑]`
  await withBrowserPlayback(async state => {
    const player = new PreviewPlayer(() => {})
    try {
      const playing = player.play(text, settings)
      await settle()
      state.media.at(-1).onended()
      await settle()
      state.media.at(-1).onended()
      await playing
      const requests = state.requests.filter(request => request.provider === 'breeze')
      assert.equal(requests.length, 2)
      assert.ok(requests.every(request => request.format === 'wav'))
      assert.equal(requests.map(request => request.text).join(''), prepareBreezeTtsText(text))
      assert.ok(requests[1].text.includes('[轻笑]'))
    } finally { await player.dispose() }
  }, { fetch: () => new Response('wav bytes') })
})
