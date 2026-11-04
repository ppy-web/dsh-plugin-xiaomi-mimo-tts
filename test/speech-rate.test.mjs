import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTtsSettings, ttsSelection } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withDoubaoServer } from './helpers/doubao-server.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'
import { withDuplexBrowser } from './helpers/duplex-browser.mjs'

const { synthesizeDoubao, DoubaoSession } = await loadClientModule('src/host/doubao.ts')
const { synthesisOptions } = await loadClientModule('src/host/validation.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { HistoryReplay } = await loadClientModule('src/client/history/history-replay.ts')
const { AudioHistory } = await loadClientModule('src/client/history/audio-history.ts')
const { XiaomiMimoTtsPcmService } = await loadClientModule('src/client/playback/pcm-play-service.ts')
const { Context } = await import('@deepseek-ai/cordis')

const settings = extra => resolveTtsSettings({ provider: 'doubao', doubaoApiKey: 'test-key', voiceRate: 1.5, ...extra })

test('both Doubao models map speed to an integer speech_rate for PCM and MP3', async () => {
  await withDoubaoServer(async ({ connect, frames }) => {
    for (const model of ['seed-tts-2.0', 'seed-icl-2.0']) {
      for (const format of ['pcm', 'mp3']) {
        for (const [voiceRate, expected] of [[0.5, -50], [0.8, -20], [1, 0], [1.1, 10], [1.5, 50], [2, 100]]) {
          await synthesizeDoubao('语速测试。', {
            settings: settings({ doubaoModel: model, doubaoClonedVoice: 'clone', voiceRate }),
            connect, format, signal: new AbortController().signal, onAudio() {},
          })
          assert.equal(frames.filter(frame => frame.event === 100).at(-1).payload.req_params.audio_params.speech_rate, expected)
        }
      }
    }
  })
})

test('Doubao snapshots synthesis speed and validates request overrides', async () => {
  const configured = settings()
  assert.equal(ttsSelection(configured).voiceRate, 1.5)
  assert.equal(synthesisOptions(configured, {}).voiceRate, 1.5)
  assert.equal(synthesisOptions(configured, { voiceRate: 0.7 }).voiceRate, 0.7)
  assert.equal(configured.voiceRate, 1.5)
  for (const invalid of [null, '1.5', true, [], {}, NaN, Infinity, 0.4, 2.1]) {
    assert.throws(() => synthesisOptions(configured, { voiceRate: invalid }), error => error.code === 'invalid-voice-rate')
  }
  assert.equal(ttsSelection(settings({ provider: 'xiaomi' })).voiceRate, undefined)
  await withDoubaoServer(async ({ connect, frames }) => {
    const session = new DoubaoSession({ settings: configured, connect, signal: new AbortController().signal, onAudio() {} })
    configured.voiceRate = 2
    await session.ready
    session.append('第一句。')
    session.append('第二句。')
    await session.finish()
    assert.equal(frames.find(frame => frame.event === 100).payload.req_params.audio_params.speech_rate, 50)
  })
})

test('live and completed Doubao replies send speed once and keep PCM playback at 1x', async () => {
  await withBrowserPlayback(async state => withDuplexBrowser(async sockets => {
    const saved = []
    const live = new LiveSpeechController({ add: entry => saved.push(entry) })
    live.configure(settings())
    live.activateSession('session')
    try {
      live.observe('session', 1, 0, '第一句。')
      await settle()
      live.configure(settings({ voiceRate: 0.8 }))
      assert.equal(sockets[0].closed, false)
      live.observe('session', 1, 0, '第一句。第二句。')
      live.finish('session', { turn: 1, step: 0, text: '第一句。第二句。', messageId: 'live', interrupted: false })
      await settle()
      live.playCompleted('session', 'complete', '完整回复。', () => assert.fail('unexpected fallback'))
      await settle()
      assert.deepEqual(sockets.map(socket => socket.sent[0].selection.voiceRate), [1.5, 0.8])
      assert.equal(state.contexts.flatMap(context => context.sources).every(source => source.playbackRate.value === 1), true)
      assert.equal(saved.length, 2)
      assert.equal(saved.every(entry => entry.voiceRateApplied), true)
    } finally { await live.dispose() }
  }), { endPcm: true })
})

test('preview sends draft speed for both Doubao models, while local fallback keeps the requested rate', async () => {
  await withBrowserPlayback(async state => withDuplexBrowser(async sockets => {
    const saved = []
    const preview = new PreviewPlayer(() => {}, { stopReplay() {}, add: entry => saved.push(entry) })
    try {
      for (const model of ['seed-tts-2.0', 'seed-icl-2.0']) {
        await preview.play('试听。', settings({ doubaoModel: model, doubaoClonedVoice: 'clone', voiceRate: 0.7, localSpeechMode: 'disabled' }))
      }
      assert.deepEqual(sockets.map(socket => socket.sent[0].selection.voiceRate), [0.7, 0.7])
      assert.equal(state.contexts.flatMap(context => context.sources).every(source => source.playbackRate.value === 1), true)
      assert.equal(saved.length, 2)
      assert.equal(saved.every(entry => entry.voiceRateApplied), true)
    } finally { await preview.dispose() }
  }), { endPcm: true })
  await withBrowserPlayback(async state => withDuplexBrowser(async () => {
    const preview = new PreviewPlayer(() => {})
    try {
      const done = preview.play('兜底。', settings({ voiceRate: 1.7, localSpeechMode: 'auto' }))
      await settle()
      assert.equal(state.utterances[0].rate, 1.7)
      state.utterances[0].onend()
      await done
    } finally { await preview.dispose() }
  }, { handle(socket, command) {
    if (command.type === 'start') { socket.message({ type: 'error', error: 'resource-unavailable' }); return true }
  } }))
})

test('optional PCM service sends Doubao speed and records audio without local speed processing', async () => {
  await withBrowserPlayback(async state => withDuplexBrowser(async sockets => {
    const saved = []
    const ctx = new Context()
    const service = new XiaomiMimoTtsPcmService(ctx, { getSnapshot: () => ({ status: 'ready', value: settings({ enabled: true }) }) }, () => {}, { stopReplay() {}, add: entry => saved.push(entry) })
    try {
      service.play('服务朗读。')
      await settle()
      assert.equal(sockets[0].sent[0].selection.voiceRate, 1.5)
      assert.equal(state.contexts[0].sources[0].playbackRate.value, 1)
      assert.equal(saved[0].voiceRateApplied, true)
    } finally { await service.dispose() }
  }), { endPcm: true })
})

test('complete audio fallback uses upstream speed for Doubao and local speed for Xiaomi', async () => {
  await withBrowserPlayback(async state => {
    const saved = []
    const playback = new PlaybackController({ add: entry => saved.push(entry) })
    playback.activateSession('session')
    try {
      playback.configure(settings())
      await playback.toggle('session', 'doubao', '豆包完整音频。', false)
      assert.equal(state.requests[0].voiceRate, 1.5)
      assert.equal(state.media[0].playbackRate, 1)
      assert.equal(saved[0].voiceRateApplied, true)
      playback.configure(settings({ provider: 'xiaomi' }))
      await playback.toggle('session', 'xiaomi', '小米完整音频。', false)
      assert.equal(state.requests[1].voiceRate, undefined)
      assert.equal(state.media[1].playbackRate, 1.5)
      assert.equal(saved[1].voiceRateApplied, false)
    } finally { playback.dispose() }
  }, { fetch: () => new Response('audio') })
})

test('Breeze complete playback uses the latest speed once and marks history for unmodified replay', async () => {
  await withBrowserPlayback(async state => {
    const saved = []
    const playback = new PlaybackController({ add: entry => saved.push(entry) })
    playback.activateSession('session')
    try {
      playback.configure(settings({ provider: 'breeze', breezeEnabled: true }))
      playback.setVoiceRate(0.8)
      await playback.toggle('session', 'breeze', 'Breeze 完整音频。', false)
      assert.equal(state.requests[0].voiceRate, 0.8)
      assert.equal(state.media[0].playbackRate, 1)
      assert.equal(saved[0].voiceRateApplied, true)
    } finally { playback.dispose() }
  }, { fetch: () => new Response('audio') })
})

test('Breeze optional PCM service preserves upstream speed in saved history', async () => {
  await withBrowserPlayback(async state => {
    const saved = []
    const ctx = new Context()
    const service = new XiaomiMimoTtsPcmService(ctx, { getSnapshot: () => ({ status: 'ready', value: settings({ provider: 'breeze', breezeEnabled: true }) }) }, () => {}, { stopReplay() {}, add: entry => saved.push(entry) })
    try {
      service.play('Breeze 服务朗读。')
      await settle()
      assert.equal(state.requests[0].voiceRate, 1.5)
      assert.equal(state.contexts[0].sources[0].playbackRate.value, 1)
      assert.equal(saved[0].voiceRateApplied, true)
    } finally { await service.dispose() }
  }, { endPcm: true })
})

test('persisted upstream-speed history replays at 1x after settings change; older history retains local speed', async () => {
  let entries = []
  const storage = { load: async () => structuredClone(entries), replace: async next => { entries = structuredClone(next) }, close() {} }
  const history = new AudioHistory(storage)
  await history.add({ text: '豆包', blob: new Blob(['audio']), format: 'wav', source: 'conversation', voiceRateApplied: true })
  await history.dispose()
  const restored = new AudioHistory(storage)
  await restored.add({ text: '旧录音', blob: new Blob(['older audio']), format: 'wav', source: 'conversation' })
  await withBrowserPlayback(async state => {
    const replay = new HistoryReplay(restored, () => {})
    replay.activate()
    try {
      replay.configure(1, 1.5, () => {})
      await replay.play(restored.getSnapshot().entries.find(entry => entry.text === '豆包'))
      assert.equal(state.media[0].playbackRate, 1)
      replay.configure(1, 2, () => {})
      assert.equal(state.media[0].playbackRate, 1)
      replay.pause()
      await replay.play(restored.getSnapshot().entries.find(entry => entry.text === '豆包'))
      assert.equal(state.media[0].playbackRate, 1)
      await replay.play(restored.getSnapshot().entries.find(entry => entry.text === '旧录音'))
      assert.equal(state.media[1].playbackRate, 2)
    } finally { replay.dispose() }
  })
  await restored.dispose()
})
