import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TTS_SEGMENT_CHARACTERS, prepareBreezeTtsText, resolveTtsSettings, TTS_STREAM_ROUTE } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'

const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { RealtimeSpeechSession } = await loadClientModule('src/client/playback/realtime-speech-session.ts')
const { playCompletedReply } = await loadClientModule('src/client/playback/read-aloud-playback.ts')

async function withBreeze(run, options = {}, overrides = {}) {
  await withBrowserPlayback(async state => {
    const settings = resolveTtsSettings({ provider: 'breeze', breezeEnabled: true, breezeVoice: 'voc_test',
      breezeInstruction: '温柔自然', voiceRate: 1.5, readScope: 'full', ...overrides })
    const live = new LiveSpeechController()
    const local = new LocalSpeechController()
    const playback = new PlaybackController()
    const speech = new RealtimeSpeechSession(live, local)
    live.configure(settings)
    playback.activateSession('session')
    speech.activate('session')
    speech.configure({ localSpeechMode: settings.localSpeechMode, apiKeySupported: true, readScope: settings.readScope })
    try { await run({ ...state, settings, live, local, playback, speech }) } finally {
      speech.deactivate('session')
      await live.dispose()
      local.dispose()
      playback.dispose()
    }
  }, options)
}

const final = text => ({ turn: 1, step: 0, messageId: 'message', text, interrupted: false })

test('Breeze automatic speech starts cloud PCM before reply completion and retains voice, tags and speed', async () => {
  let stream
  await withBreeze(async state => {
    const opening = '[轻笑]' + '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
    state.speech.observe('session', 1, 0, opening)
    await settle()
    const request = state.requests[0]
    assert.equal(request.url, TTS_STREAM_ROUTE)
    assert.equal(request.provider, 'breeze')
    assert.equal(request.voice, 'voc_test')
    assert.equal(request.speechInstruction, '温柔自然')
    assert.equal(request.voiceRate, 1.5)
    assert.ok(request.text.includes('[轻笑]'))
    stream.enqueue(pcmEvent())
    await settle()
    assert.ok(state.contexts[0].sources.length > 0, 'PCM plays while the reply and HTTP stream are still open')
    assert.equal(state.contexts[0].sources[0].playbackRate.value, 1, 'speed is applied once by Breeze')
    stream.close()
    await settle()
    const text = opening + '尾声[叹气]。'
    state.speech.observe('session', 1, 0, text)
    state.speech.finish('session', final(text))
    await settle()
    assert.equal(state.requests.map(request => request.text).join(''), prepareBreezeTtsText(text))
    assert.equal(state.utterances.length, 0)
    assert.equal(state.live.hasHandled('session', final(text)), true)
  }, { fetch: (request, state) => state.requests.length === 1
    ? new Response(new ReadableStream({ start(controller) { stream = controller } }))
    : new Response(pcmEvent()) })
})

test('Breeze completed automatic playback uses the stream route and splits requests at the provider limit', async () => {
  await withBreeze(async state => {
    const text = '甲'.repeat(1005) + '[轻笑]结束。'
    playCompletedReply({ ...state, sessionId: 'session', messageId: 'message', text, apiKeySupported: null }, true)
    for (let i = 0; i < 8; i += 1) await settle()
    assert.ok(state.requests.every(request => request.url === TTS_STREAM_ROUTE && request.text.length <= 1000))
    assert.equal(state.requests.map(request => request.text).join(''), prepareBreezeTtsText(text))
    assert.equal(state.utterances.length, 0)
  }, { endPcm: true })
})

test('Breeze cancellation aborts the cloud stream without starting browser speech', async () => {
  await withBreeze(async state => {
    state.speech.observe('session', 1, 0, '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。')
    await settle()
    const request = state.requests[0]
    state.speech.deactivate('session')
    await settle()
    assert.equal(request.signal.aborted, true)
    assert.equal(state.utterances.length, 0)
  }, { fetch: request => new Promise((resolve, reject) => request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })) })
})

test('Breeze Smart streaming retains tags while excluding later reply content', async () => {
  await withBreeze(async state => {
    const opening = '[轻笑]' + '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
    const text = opening + '不应播报的后续内容。'
    state.speech.observe('session', 1, 0, opening)
    state.speech.observe('session', 1, 0, text)
    state.speech.finish('session', final(text))
    for (let i = 0; i < 8; i += 1) await settle()
    assert.equal(state.requests.map(request => request.text).join(''), prepareBreezeTtsText(opening))
  }, { endPcm: true }, { readScope: 'smart' })
})

test('Breeze buffers an incomplete audio tag across assistant updates', async () => {
  await withBreeze(async state => {
    const opening = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS - 1)
    state.speech.observe('session', 1, 0, opening + '[轻')
    await settle()
    assert.equal(state.requests.length, 0)
    const text = opening + '[轻笑]结束。'
    state.speech.observe('session', 1, 0, text)
    state.speech.finish('session', final(text))
    for (let i = 0; i < 8; i += 1) await settle()
    assert.equal(state.requests.map(request => request.text).join(''), prepareBreezeTtsText(text))
    assert.ok(state.requests.some(request => request.text.includes('[轻笑]')))
  }, { endPcm: true })
})

test('Breeze cloud failure falls back only before PCM playback starts', async () => {
  for (const started of [false, true]) {
    let stream
    await withBreeze(async state => {
      const text = '[轻笑]' + '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
      state.speech.observe('session', 1, 0, text)
      await settle()
      if (started) { stream.enqueue(pcmEvent()); await settle(); stream.error(new Error('upstream-failed')) }
      state.speech.finish('session', final(text))
      await settle()
      if (started) assert.equal(state.utterances.length, 0)
      else {
        assert.ok(state.utterances.length > 0)
        assert.ok(state.utterances.every(utterance => !utterance.text.includes('轻笑')))
      }
    }, { fetch: () => started ? new Response(new ReadableStream({ start(controller) { stream = controller } })) : new Response('failed', { status: 503 }) })
  }
})
