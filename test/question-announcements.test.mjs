import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'
import { withDuplexBrowser } from './helpers/duplex-browser.mjs'
import { prepareTtsText, resolveTtsSettings } from '../lib/shared.js'

const { QuestionTitleTracker } = await loadClientModule('src/client/announcements/question-titles.ts')
const { QuestionTitlePlayback } = await loadClientModule('src/client/announcements/question-playback.ts')
const { SpeechActivity } = await loadClientModule('src/client/announcements/speech-activity.ts')
const { XiaomiMimoTtsPcmService } = await loadClientModule('src/client/playback/pcm-play-service.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { RealtimeSpeechSession } = await loadClientModule('src/client/playback/realtime-speech-session.ts')
const { playCompletedReply } = await loadClientModule('src/client/playback/read-aloud-playback.ts')
const title = (request, index = 0, session = 'session', visible = true) => ({
  id: JSON.stringify([session, request, `question-${request}-${index}`]), text: '请选择方案？', visible,
})

test('questions baseline existing cards, read new requests and pages once, and cancel when changed or removed', () => {
  const events = []
  const tracker = new QuestionTitleTracker(event => events.push(event))
  tracker.update([title('old')])
  assert.equal(events.length, 0)
  tracker.update([title('new')])
  tracker.update([title('new')])
  assert.equal(events.length, 1)
  tracker.update([title('new', 1)])
  assert.equal(events[0].signal.aborted, true)
  assert.equal(events.length, 2)
  tracker.update([title('new')])
  assert.equal(events[1].signal.aborted, true)
  assert.equal(events.length, 2, 'returning to an already read title must not replay')
  tracker.update([title('other-request')])
  assert.equal(events.length, 3, 'identical titles on different requests remain independent')
  tracker.update([title('other-request', 0, 'session', false)])
  assert.equal(events[2].signal.aborted, true)
  tracker.update([title('other-request')])
  assert.equal(events.length, 3, 'collapse/expand must not replay')
  tracker.update([title('last')])
  tracker.update([])
  assert.equal(events.at(-1).signal.aborted, true)
})

test('session changes and reactivation establish a new baseline without erasing per-request deduplication', () => {
  const events = []
  const tracker = new QuestionTitleTracker(event => events.push(event))
  tracker.update([])
  tracker.update([title('first')])
  tracker.reset()
  assert.equal(events[0].signal.aborted, true)
  tracker.update([title('existing', 0, 'other-session')])
  assert.equal(events.length, 1)
  tracker.update([title('first', 0, 'other-session')])
  assert.equal(events.length, 2)
  tracker.reset()
  tracker.update([title('existing')])
  tracker.update([title('first')])
  assert.equal(events.length, 2)
})

test('question playback respects autoplay, source switch and busy speech, then cancels remote synthesis by title lifetime', async () => {
  await withBrowserPlayback(async state => {
    let settings = resolveTtsSettings({ autoPlay: false, localSpeechMode: 'disabled' })
    const activity = new SpeechActivity()
    let busy = false
    activity.register(() => busy)
    const playback = new QuestionTitlePlayback(activity, () => settings, () => false)
    const controller = new AbortController()
    const event = { source: 'question-titles', id: 'question', text: '只朗读标题。', signal: controller.signal }
    try {
      playback.play(event)
      assert.equal(state.requests.length, 0)
      settings = resolveTtsSettings({ autoPlay: true, announcementSources: [] })
      playback.play(event)
      assert.equal(state.requests.length, 0)
      settings = resolveTtsSettings({ autoPlay: true, localSpeechMode: 'disabled' })
      busy = true
      playback.play(event)
      assert.equal(state.requests.length, 0)
      busy = false
      playback.play(event)
      await settle()
      assert.equal(state.requests[0].text, event.text)
      assert.equal(activity.isBusy(), true)
      controller.abort()
      assert.equal(state.requests[0].signal.aborted, true)
      assert.equal(activity.isBusy(), false)
    } finally { await playback.dispose() }
  }, { fetch: () => new Promise(() => {}) })
})

test('question titles fall back to local speech and stop on close without repeated attempts', async () => {
  await withBrowserPlayback(async state => {
    const settings = resolveTtsSettings({ autoPlay: true, localSpeechMode: 'auto' })
    const activity = new SpeechActivity()
    const playback = new QuestionTitlePlayback(activity, () => settings, () => false)
    const controller = new AbortController()
    try {
      playback.play({ source: 'question-titles', id: 'question', text: '本地兜底标题。', signal: controller.signal })
      await settle()
      assert.equal(state.utterances[0].text, '本地兜底标题。')
      assert.equal(activity.isBusy(), true)
      controller.abort()
      assert.equal(activity.isBusy(), false)
      assert.ok(state.cancelled > 0)
      await settle()
      assert.equal(state.requests.length, 1)
    } finally { await playback.dispose() }
  }, { fetch: () => new Response('{}', { status: 401 }) })
})

test('public and collector playback have independent stop ownership', async () => {
  await withBrowserPlayback(async () => withDuplexBrowser(async sockets => {
    const settings = resolveTtsSettings({ provider: 'doubao', announcementSources: ['dsh-pet'] })
    const service = new XiaomiMimoTtsPcmService(new Context(), { getSnapshot: () => ({ status: 'ready', value: settings }) }, () => {})
    try {
      const stop = service.tryPlay('桌宠收集器。', () => false)
      await settle()
      assert.equal(sockets.length, 1)
      service.stopExternal()
      assert.equal(service.isBusy(), true)
      stop()
      service.play('默认开启的接口。')
      await settle()
      assert.equal(sockets.length, 2)
      service.stopExternal()
      assert.equal(service.isBusy(), false)
    } finally { await service.dispose() }
  }))
})

for (const localSpeechMode of ['local-first', 'disabled']) {
  for (const completedOnly of [false, true]) {
    test(`question speech preserves the ${completedOnly ? 'completed' : 'streamed'} final reply in the same turn (${localSpeechMode})`, async () => {
      await withBrowserPlayback(async state => {
        const settings = resolveTtsSettings({ autoPlay: true, localSpeechMode, readScope: 'full' })
        const live = new LiveSpeechController(), local = new LocalSpeechController(), playback = new PlaybackController()
        const speech = new RealtimeSpeechSession(live, local)
        const activity = new SpeechActivity()
        activity.register(live.isBusy)
        activity.register(local.isBusy)
        const question = new QuestionTitlePlayback(activity, () => settings, () => false)
        const controller = new AbortController()
        try {
          live.configure(settings)
          speech.configure({ localSpeechMode, apiKeySupported: true, readScope: 'full' })
          speech.activate('session')
          playback.activateSession('session')
          playback.observeSession('session', true, null)
          // A tool step can leave an idle speech cursor while waiting for the user.
          speech.observe('session', 1, 0, '')
          speech.finish('session', { turn: 1, step: 0, messageId: 'before-question', text: '', interrupted: false })
          question.play({ source: 'question-titles', id: 'question', text: '请选择一个方案。', signal: controller.signal })
          await settle()
          controller.abort()
          const final = { turn: 1, step: 1, messageId: 'final', text: '这是回答问题之后的最终正文。', interrupted: false }
          assert.equal(live.hasHandled('session', final) || local.hasHandled('session', final), false)
          if (completedOnly) {
            playback.observeSession('session', false, final.messageId)
            assert.equal(playback.claimAutomaticPlayback('session', final.messageId), true)
            playCompletedReply({ sessionId: 'session', messageId: final.messageId, text: final.text, turn: final.turn,
              settings, apiKeySupported: true, playback, live, local }, true)
            assert.equal(playback.claimAutomaticPlayback('session', final.messageId), false)
          } else {
            speech.observe('session', final.turn, final.step, final.text)
            speech.finish('session', final)
            assert.equal(live.hasHandled('session', final) || local.hasHandled('session', final), true, 'streamed final body must not replay as a completed reply')
          }
          await settle()
          const spoken = [...state.utterances, ...state.requests].map(item => item.text)
          assert.equal(spoken.filter(text => text === prepareTtsText(final.text)).length, 1, 'final body must remain eligible and play once')
        } finally {
          await question.dispose()
          speech.deactivate('session')
          await live.dispose()
          local.dispose()
          playback.dispose()
        }
      }, { endPcm: true })
    })
  }
}

test('idle PCM collectors preserve the final-reply cursor while explicit public playback still interrupts it', async () => {
  await withBrowserPlayback(async state => {
    const settings = resolveTtsSettings({ autoPlay: true, localSpeechMode: 'local-first', readScope: 'full' })
    const local = new LocalSpeechController()
    const service = new XiaomiMimoTtsPcmService(new Context(), { getSnapshot: () => ({ status: 'ready', value: settings }) }, () => local.interrupt())
    try {
      local.activateSession('session')
      local.observe('session', 1, 0, '')
      const stop = service.tryPlay('桌宠的空闲播报。', local.isBusy)
      assert.equal(typeof stop, 'function')
      await settle()
      stop()
      const final = { turn: 1, step: 1, messageId: 'final', text: '收集器播报之后的最终正文。', interrupted: false }
      assert.equal(local.hasHandled('session', final), false)
      local.observe('session', final.turn, final.step, final.text)
      local.finish('session', final)
      await settle()
      assert.deepEqual(state.utterances.map(item => item.text), [prepareTtsText(final.text)])
      local.cancel()
      local.observe('session', 2, 0, '')
      service.play('用户主动调用语音接口。')
      assert.equal(local.hasHandled('session', { turn: 2, step: 1 }), true)
    } finally { local.dispose(); await service.dispose() }
  }, { endPcm: true })
})
