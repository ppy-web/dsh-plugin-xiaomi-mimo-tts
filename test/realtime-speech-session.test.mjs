import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TTS_SEGMENT_CHARACTERS, prepareTtsText } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'

const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { RealtimeSpeechSession } = await loadClientModule('src/client/playback/realtime-speech-session.ts')

async function withSpeech(run, options = {}, mode = 'auto') {
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    const local = new LocalSpeechController()
    const playback = new PlaybackController()
    const speech = new RealtimeSpeechSession(live, local)
    playback.activateSession('session')
    live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
    local.setStateChangeListener((s, m, status, error) => playback.updateLivePlayback(s, m, status, 'system', error))
    speech.configure({ localSpeechMode: mode, apiKeySupported: true, readScope: 'full' })
    speech.activate('session')
    try { await run({ ...state, speech, live, local, playback }) } finally {
      speech.deactivate('session')
      await live.dispose()
      local.dispose()
      playback.dispose()
    }
  }, options)
}

const final = (text, step = 0) => ({ turn: 1, step, messageId: `message-${step}`, text, interrupted: false })
async function finishUtterances(state) {
  for (let index = 0; index < state.utterances.length; index += 1) {
    state.utterances[index].onstart?.()
    state.utterances[index].onend?.()
    await settle()
  }
}

for (const mode of ['disabled', 'local-first']) {
  test(`streamed speech prevents completed autoplay before final settlement (${mode})`, async () => {
    await withSpeech(async state => {
      const text = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
      state.speech.observe('session', 1, 0, text)
      await settle()
      const controller = mode === 'local-first' ? state.local : state.live
      assert.equal(controller.hasHandled('session', final(text)), true)
      assert.equal(controller.hasHandled('session', final('下一步', 1)), false)
      state.speech.cancel()
      assert.equal(controller.hasHandled('session', final(text)), true, 'a late final message must not restart cancelled speech')
      assert.equal([...state.requests, ...state.utterances].length, 1)
    }, { endPcm: true }, mode)
  })
}

test('MiMo fallback owns future updates, flushes the tail, and never retries the failed backend', async () => {
  await withSpeech(async state => {
    const first = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
    const text = first + '乙'.repeat(15)
    state.speech.observe('session', 1, 0, first + '乙'.repeat(10))
    await settle()
    state.speech.configure({ localSpeechMode: 'auto', apiKeySupported: false, readScope: 'full' })
    state.speech.observe('session', 1, 0, text)
    state.speech.finish('session', final(text))
    await finishUtterances(state)
    assert.equal(state.requests.length, 1)
    assert.equal(state.utterances.map(value => value.text).join(''), prepareTtsText(text))
    assert.equal(state.local.hasHandled('session', final(text)), true)
    assert.equal(state.playback.getSnapshot().status, 'idle')
  }, { fetch: () => new Response('failed', { status: 503 }) })
})

test('local-first fallback streams future updates and the final tail through MiMo', async () => {
  await withSpeech(async state => {
    const first = '甲'.repeat(25) + '。'
    const text = first + '乙'.repeat(15)
    state.speech.observe('session', 1, 0, first)
    await settle()
    state.speech.observe('session', 1, 0, text)
    state.speech.finish('session', final(text))
    await settle()
    assert.equal(state.requests.map(value => value.text).join(''), prepareTtsText(text))
    assert.equal(state.live.hasHandled('session', final(text)), true)
  }, { voices: false, endPcm: true }, 'local-first')
})

test('a failure after finish transfers the final message and its unterminated tail', async () => {
  let fail
  await withSpeech(async state => {
    const text = '甲'.repeat(25) + '。' + '乙'.repeat(10)
    state.speech.observe('session', 1, 0, text)
    state.speech.finish('session', final(text))
    fail(new Response('failed', { status: 503 }))
    await settle()
    await finishUtterances(state)
    assert.equal(state.utterances.map(value => value.text).join(''), prepareTtsText(text))
    assert.equal(state.local.hasHandled('session', final(text)), true)
    assert.equal(state.requests.length, 1)
  }, { fetch: () => new Promise(resolve => { fail = resolve }) })
})

test('local failure queued before finish also delivers final text to MiMo', async () => {
  await withSpeech(async state => {
    const text = '甲'.repeat(25) + '。' + '乙'.repeat(10)
    state.speech.observe('session', 1, 0, text)
    state.speech.finish('session', final(text))
    await settle()
    await settle()
    assert.equal(state.requests.map(value => value.text).join(''), prepareTtsText(text))
  }, { voices: false, endPcm: true }, 'local-first')
})

test('both unavailable backends stop after one transfer and expose an error on the final message', async () => {
  await withSpeech(async state => {
    const first = '甲'.repeat(25) + '。'
    state.speech.observe('session', 1, 0, first)
    await settle()
    state.speech.observe('session', 1, 0, first + '乙'.repeat(25) + '。')
    state.speech.finish('session', final(first + '乙'.repeat(25) + '。'))
    await settle()
    assert.equal(state.requests.length, 1)
    assert.equal(state.playback.getSnapshot().status, 'error')
    assert.equal(state.playback.getSnapshot().messageId, 'message-0')
  }, { voices: false, fetch: () => new Response('failed', { status: 503 }) })
})

test('switching sessions rejects a late failure without starting a stale fallback', async () => {
  let fail
  await withSpeech(async state => {
    state.speech.observe('session', 1, 0, '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。')
    const oldSignal = state.requests[0].signal
    state.speech.activate('next')
    state.playback.activateSession('next')
    state.speech.observe('next', 1, 0, '乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。')
    fail(new Response('failed', { status: 503 }))
    await settle()
    assert.equal(oldSignal.aborted, true)
    assert.equal(state.utterances.length, 0)
    assert.equal(state.requests.length, 2)
    state.speech.deactivate('next')
  }, { fetch: (request, state) => state.requests.length === 1 ? new Promise(resolve => { fail = resolve }) : new Response(pcmEvent()) })
})

test('fallback before the first audio preserves finished steps and the current step', async () => {
  let fail
  await withSpeech(async state => {
    const first = '甲'.repeat(25) + '。'
    const second = '乙'.repeat(25) + '。末尾'
    state.speech.observe('session', 1, 0, first)
    state.speech.finish('session', final(first))
    state.speech.observe('session', 1, 1, second)
    state.speech.finish('session', final(second, 1))
    fail(new Response('failed', { status: 503 }))
    await settle()
    await finishUtterances(state)
    assert.equal(state.utterances.map(value => value.text).join(''), prepareTtsText(first) + prepareTtsText(second))
    assert.equal(state.requests.length, 1)
  }, { fetch: () => new Promise(resolve => { fail = resolve }) })
})

test('fallback preserves the checkpoint when attaching during generation', async () => {
  await withSpeech(async state => {
    const existing = '甲'.repeat(25) + '。'
    const added = '乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。末尾'
    state.speech.observe('session', 1, 0, existing, true)
    state.speech.observe('session', 1, 0, existing + added)
    await settle()
    state.speech.finish('session', final(existing + added))
    await finishUtterances(state)
    assert.equal(state.utterances.map(value => value.text).join(''), prepareTtsText(added))
  }, { fetch: () => new Response('failed', { status: 503 }) })
})

test('raw unclosed code never reaches either speech backend and closing it preserves spoken prose', async () => {
  for (const mode of ['disabled', 'local-first']) {
    await withSpeech(async state => {
      const before = '甲'.repeat(25) + '。'
      const after = '乙'.repeat(25) + '。'
      const code = '\n````js\n' + 'const privateValue = 123; '.repeat(20) + '\n```\nnotClosedYet();\n'
      state.speech.observe('session', 1, 0, before)
      await settle()
      for (const length of [1, 4, 8, 100, code.length]) {
        state.speech.observe('session', 1, 0, before + code.slice(0, length))
        await settle()
      }
      const complete = before + code + '````\n' + after
      state.speech.observe('session', 1, 0, complete)
      state.speech.finish('session', final(complete))
      await settle()
      await finishUtterances(state)
      const spoken = mode === 'disabled' ? state.requests.map(value => value.text).join('') : state.utterances.map(value => value.text).join('')
      assert.equal(spoken, prepareTtsText(before + after))
    }, { endPcm: true }, mode)
  }
})
