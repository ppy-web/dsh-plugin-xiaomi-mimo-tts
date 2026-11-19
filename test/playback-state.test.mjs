import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'

const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { PcmAudioQueue } = await loadClientModule('src/client/playback/pcm-audio-queue.ts')
const { handleReadAloudClick } = await loadClientModule('src/client/playback/read-aloud-playback.ts')

test('clicking PCM pause silences output before the browser suspends playback', async () => {
  let stream
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    const playback = new PlaybackController()
    const request = { sessionId: 'session', messageId: 'message', live, playback }
    playback.activateSession('session')
    live.activateSession('session')
    live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
    let finishSuspend
    try {
      live.playCompleted('session', 'message', '朗读测试')
      stream.enqueue(pcmEvent())
      await settle()
      const context = state.contexts[0]
      const output = context.gains[0].gain
      assert.ok(output.value > 0)
      context.suspendResult = new Promise(resolve => { finishSuspend = resolve })
      handleReadAloudClick(request, playback.getSnapshot())
      assert.equal(context.state, 'running')
      assert.equal(output.value, 0)
      stream.enqueue(pcmEvent())
      live.setVolume(0.4)
      await settle()
      assert.equal(output.value, 0)
      assert.equal(playback.getSnapshot().status, 'paused')
      finishSuspend()
      await settle()
      handleReadAloudClick(request, playback.getSnapshot())
      await settle()
      assert.equal(playback.getSnapshot().status, 'playing')
      assert.equal(output.value, 0.4)
    } finally { finishSuspend?.(); await live.dispose(); playback.dispose() }
  }, { fetch: request => new Response(new ReadableStream({ start(controller) {
    stream = controller
    request.signal.addEventListener('abort', () => controller.close(), { once: true })
  } })) })
})

test('pausing while PCM startup is pending keeps the audio context suspended', async () => {
  await withBrowserPlayback(async state => {
    const queue = new PcmAudioQueue({ onBusyChange() {}, onPlaybackStart() {} })
    try {
      await queue.enqueueBytes(new Uint8Array(48000))
      await queue.pause()
      queue.stop()
      const context = state.contexts[0]
      let finishResume
      context.resumeResult = new Promise(resolve => { finishResume = resolve })
      const pending = queue.enqueueBytes(new Uint8Array(48000))
      await Promise.resolve()
      await queue.pause()
      finishResume()
      await pending
      assert.equal(context.state, 'suspended')
      await queue.resume()
      assert.equal(context.state, 'running')
    } finally { await queue.dispose() }
  })
})

test('a pending PCM resume cannot override a later pause', async () => {
  await withBrowserPlayback(async state => {
    const queue = new PcmAudioQueue({ onBusyChange() {}, onPlaybackStart() {} })
    try {
      await queue.enqueueBytes(new Uint8Array(48000))
      await queue.pause()
      const context = state.contexts[0]
      let finishResume
      context.resumeResult = new Promise(resolve => { finishResume = resolve })
      const pending = queue.resume()
      await queue.pause()
      finishResume()
      await pending
      assert.equal(context.state, 'suspended')
    } finally { await queue.dispose() }
  })
})

test('PCM chunks arriving while paused retain paused state and can resume', async () => {
  let stream
  await withBrowserPlayback(async () => {
    const live = new LiveSpeechController()
    const playback = new PlaybackController()
    playback.activateSession('session')
    live.activateSession('session')
    live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
    try {
      live.playCompleted('session', 'message', '朗读测试', () => assert.fail('unexpected fallback'))
      stream.enqueue(pcmEvent())
      await settle()
      assert.equal(await live.pause('session'), true)
      stream.enqueue(pcmEvent())
      stream.enqueue(pcmEvent())
      await settle()
      assert.equal(playback.getSnapshot().status, 'paused')
      assert.equal(await live.resume('session'), true)
      assert.equal(playback.getSnapshot().status, 'playing')
    } finally { await live.dispose(); playback.dispose() }
  }, { fetch: request => new Response(new ReadableStream({ start(controller) {
    stream = controller
    request.signal.addEventListener('abort', () => controller.close(), { once: true })
  } })) })
})

test('cancelling local speech publishes idle with the original message identity', async () => {
  await withBrowserPlayback(async state => {
    const local = new LocalSpeechController()
    const playback = new PlaybackController()
    playback.activateSession('session')
    local.activateSession('session')
    local.setStateChangeListener((s, m, status, error) => playback.updateLivePlayback(s, m, status, 'system', error))
    try {
      for (const status of ['loading', 'playing', 'paused']) {
        local.playCompleted('session', 'message', '本地朗读')
        const utterance = state.utterances.at(-1)
        const lateStart = utterance.onstart
        if (status !== 'loading') utterance.onstart()
        if (status === 'paused') await local.pause('session')
        assert.equal(playback.getSnapshot().status, status)
        local.cancel()
        lateStart()
        await settle()
        assert.equal(playback.getSnapshot().status, 'idle')
      }
    } finally { local.dispose(); playback.dispose() }
  })
})

test('a delayed PCM resume cannot restore the cancelled message status', async () => {
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    const playback = new PlaybackController()
    playback.activateSession('session')
    live.activateSession('session')
    live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
    try {
      live.playCompleted('session', 'message', '朗读测试', () => assert.fail('unexpected fallback'))
      await settle()
      await live.pause('session')
      let resumed
      state.contexts[0].resumeResult = new Promise(resolve => { resumed = resolve })
      const pending = live.resume('session')
      live.cancel()
      resumed()
      assert.equal(await pending, false)
      assert.equal(playback.getSnapshot().status, 'idle')
    } finally { await live.dispose(); playback.dispose() }
  })
})

test('paused PCM buffer overflow stops playback and exposes an error', async () => {
  let stream
  await withBrowserPlayback(async () => {
    const live = new LiveSpeechController()
    const playback = new PlaybackController()
    playback.activateSession('session')
    live.activateSession('session')
    live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
    live.setMaxPausedPcmBytes(2)
    try {
      live.playCompleted('session', 'message', '朗读测试', () => assert.fail('unexpected fallback'))
      stream.enqueue(pcmEvent())
      await settle()
      await live.pause('session')
      stream.enqueue(pcmEvent())
      await settle()
      assert.equal(playback.getSnapshot().status, 'error')
    } finally { await live.dispose(); playback.dispose() }
  }, { fetch: request => new Response(new ReadableStream({ start(controller) {
    stream = controller
    request.signal.addEventListener('abort', () => controller.close(), { once: true })
  } })) })
})

test('finishing a local live message publishes its current playing state', async () => {
  await withBrowserPlayback(async state => {
    const local = new LocalSpeechController()
    const playback = new PlaybackController()
    playback.activateSession('session')
    local.activateSession('session')
    local.setStateChangeListener((s, m, status, error) => playback.updateLivePlayback(s, m, status, 'system', error))
    try {
      const text = '甲'.repeat(25) + '。'
      local.observe('session', 1, 0, text)
      state.utterances[0].onstart()
      local.finish('session', { turn: 1, step: 0, messageId: 'message', text, interrupted: false })
      assert.equal(playback.getSnapshot().status, 'playing')
      assert.equal(playback.getSnapshot().messageId, 'message')
      local.cancel()
      assert.equal(playback.getSnapshot().status, 'idle')
    } finally { local.dispose(); playback.dispose() }
  })
})

test('local timeout after speech starts reports an error without replaying through a fallback', async () => {
  await withBrowserPlayback(async state => {
    const local = new LocalSpeechController()
    const playback = new PlaybackController()
    const timeouts = []
    window.setTimeout = callback => { timeouts.push(callback); return timeouts.length }
    window.clearTimeout = () => {}
    playback.activateSession('session')
    local.activateSession('session')
    local.setStateChangeListener((s, m, status, error) => playback.updateLivePlayback(s, m, status, 'system', error))
    let fallbacks = 0
    try {
      local.playCompleted('session', 'message', '本地朗读', () => { fallbacks += 1 })
      state.utterances[0].onstart()
      timeouts[0]()
      await settle()
      assert.equal(fallbacks, 0)
      assert.equal(playback.getSnapshot().status, 'error')
      assert.equal(playback.getSnapshot().error, 'local-speech-timeout')
    } finally { local.dispose(); playback.dispose() }
  })
})

test('a late suspend from an old message cannot silence the new PCM playback', async () => {
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    const playback = new PlaybackController()
    playback.activateSession('session')
    live.activateSession('session')
    live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
    try {
      live.playCompleted('session', 'old', '旧朗读', () => assert.fail('unexpected fallback'))
      await settle()
      const context = state.contexts[0]
      let suspended
      context.suspendResult = new Promise(resolve => { suspended = resolve })
      const oldPause = live.pause('session')
      live.playCompleted('session', 'new', '新朗读', () => assert.fail('unexpected fallback'))
      await settle()
      suspended()
      assert.equal(await oldPause, false)
      assert.equal(context.state, 'running')
      assert.equal(playback.getSnapshot().messageId, 'new')
      assert.equal(playback.getSnapshot().status, 'playing')
    } finally { await live.dispose(); playback.dispose() }
  })
})

test('a late resume from an old message cannot unpause the new PCM playback', async () => {
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    const playback = new PlaybackController()
    playback.activateSession('session')
    live.activateSession('session')
    live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
    try {
      live.playCompleted('session', 'old', '旧朗读', () => assert.fail('unexpected fallback'))
      await settle()
      await live.pause('session')
      const context = state.contexts[0]
      let resumed
      context.resumeResult = new Promise(resolve => { resumed = resolve })
      const oldResume = live.resume('session')
      context.resumeResult = null
      live.playCompleted('session', 'new', '新朗读', () => assert.fail('unexpected fallback'))
      await settle()
      await live.pause('session')
      resumed()
      assert.equal(await oldResume, false)
      assert.equal(context.state, 'suspended')
      assert.equal(playback.getSnapshot().messageId, 'new')
      assert.equal(playback.getSnapshot().status, 'paused')
    } finally { await live.dispose(); playback.dispose() }
  })
})
