import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { prepareTtsText, resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'
import { withDuplexBrowser } from './helpers/duplex-browser.mjs'

const { ReadingCaptions, mediaCaptionTiming, readingCaptionText } = await loadClientModule('src/client/playback/reading-captions.ts')
const { splitCaptionLines } = await loadClientModule('src/client/playback/caption-lines.ts')
const { ReadingCaptionBar, ReadingCaptionLines } = await loadClientModule('src/client/conversation/reading-caption-bar.tsx')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { handleReadAloudClick } = await loadClientModule('src/client/playback/read-aloud-playback.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { PcmAudioQueue } = await loadClientModule('src/client/playback/pcm-audio-queue.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const { AnnouncementSettings, ANNOUNCEMENT_TOGGLE_FIELDS } = await loadClientModule('src/client/settings/announcement-settings.tsx')
const { PreviewModule } = await loadClientModule('src/client/settings/preview-module.tsx')
const { VoiceReadingSection } = await loadClientModule('src/client/settings/voice-reading-section.tsx')

function captionClock() {
  let now = 0, nextId = 0
  const timers = new Map()
  return {
    now: () => now,
    schedule(callback) { const id = ++nextId; timers.set(id, callback); return id },
    cancel(id) { timers.delete(id) },
    advance(seconds) {
      now += seconds
      const pending = [...timers.values()]
      timers.clear()
      for (const callback of pending) callback()
    },
    pending: () => timers.size,
  }
}

for (const provider of ['doubao', 'deepseek']) {
  test(`${provider} duplex captions start with audio, grow with appended text, and freeze in a playback gap`, async () => {
    await withBrowserPlayback(state => withDuplexBrowser(async sockets => {
      const clock = captionClock(), captions = new ReadingCaptions(clock)
      const unsubscribe = captions.subscribe(() => {})
      const live = new LiveSpeechController(undefined, captions)
      live.configure(resolveTtsSettings({ provider, deepseekEnabled: true }))
      live.activateSession('session')
      try {
        live.observe('session', 1, 0, '第一句。')
        await settle()
        assert.equal(captions.getSnapshot().text, '')
        sockets[0].audio(new Uint8Array(48_000))
        await settle()
        const context = state.contexts[0]
        assert.equal(captions.getSnapshot().text, '')
        let finishSuspend
        context.suspendResult = new Promise(resolve => { finishSuspend = resolve })
        const pause = live.pause('session')
        context.advanceTo(.04)
        finishSuspend()
        assert.equal(await pause, true)
        assert.equal(captions.getSnapshot().text, '')
        assert.equal(clock.pending(), 0)
        assert.equal(await live.resume('session'), true)
        assert.equal(captions.getSnapshot().text, prepareTtsText('第一句。'))
        live.observe('session', 1, 0, '第一句。第二句。')
        await settle()
        context.advanceTo(1.04)
        assert.equal(captions.getSnapshot().paused, false)
        assert.equal(clock.pending(), 0)
        clock.advance(10)
        assert.equal(captions.getSnapshot().text, prepareTtsText('第一句。'))
        sockets[0].audio(new Uint8Array(48_000))
        await settle()
        await live.pause('session')
        context.advanceTo(1.8)
        clock.advance(2)
        assert.equal(captions.getSnapshot().text, prepareTtsText('第一句。'))
        assert.equal(captions.getSnapshot().paused, true)
        await live.resume('session')
        live.finish('session', { turn: 1, step: 0, messageId: 'reply', text: '第一句。第二句。', interrupted: false })
        await settle()
        context.advanceTo(1.4)
        clock.advance(.1)
        assert.equal(captions.getSnapshot().text, prepareTtsText('第二句。'))
        assert.equal(captions.getSnapshot().previousText, prepareTtsText('第一句。'))
        assert.equal(live.stop('session'), true)
        assert.equal(captions.getSnapshot().text, '')
        assert.equal(clock.pending(), 0)
      } finally { unsubscribe(); await live.dispose() }
    }, { handle: (_socket, command) => command.type === 'text' }))
  })
}

test('DeepSeek rolls over long text, advances captions on the next audio cue and keeps a single WAV', async () => {
  const parts = ['甲'.repeat(5000), '乙'.repeat(5000), '丙'.repeat(30)]
  await withBrowserPlayback(state => withDuplexBrowser(async sockets => {
    const captions = new ReadingCaptions(captionClock()), saved = []
    const live = new LiveSpeechController({ add: entry => saved.push(entry) }, captions)
    live.configure(resolveTtsSettings({ provider: 'deepseek', deepseekEnabled: true, maxTextLength: 12_000, voiceRate: 2 }))
    live.activateSession('session')
    try {
      live.playCompleted('session', 'reply', parts.join(''), () => assert.fail('unexpected fallback'))
      await settle()
      assert.equal(sockets.length, 3)
      assert.deepEqual(sockets.map(socket => socket.sent.filter(command => command.type === 'text').map(command => command.text).join('')), parts)
      const context = state.contexts[0]
      assert.equal(captions.getSnapshot().text, '')
      context.advanceTo(.04)
      assert.ok(captions.getSnapshot().text.startsWith('甲'))
      context.advanceTo(.54)
      assert.ok(captions.getSnapshot().text.startsWith('乙'))
      context.advanceTo(1.04)
      assert.ok(captions.getSnapshot().text.startsWith('丙'))
      assert.equal(saved.length, 1)
      assert.equal(saved[0].messageId, 'reply')
      assert.equal(saved[0].voiceRateApplied, false)
      assert.equal(saved[0].format, 'wav')
      const wav = new DataView(await saved[0].blob.arrayBuffer())
      assert.equal(wav.getUint32(40, true), 48_000 * parts.length)
      context.advanceTo(1.6)
      assert.equal(captions.getSnapshot().text, '')
    } finally { await live.dispose() }
  }, { handle(socket, command) { if (command.type === 'text') { socket.audio(new Uint8Array(48_000)); return true } } }))
})

test('DeepSeek idle rollover finishes only the current connection and saves the reply after its final ID arrives', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  await withBrowserPlayback(() => withDuplexBrowser(async sockets => {
    const saved = []
    const live = new LiveSpeechController({ add: entry => saved.push(entry) })
    live.configure(resolveTtsSettings({ provider: 'deepseek', deepseekEnabled: true }))
    live.activateSession('session')
    try {
      live.observe('session', 1, 0, 'First sentence. ')
      await settle()
      t.mock.timers.tick(55_000)
      await settle()
      assert.ok(sockets[0].sent.some(command => command.type === 'finish'))
      assert.equal(saved.length, 0)
      const text = 'First sentence. Second sentence.'
      live.observe('session', 1, 0, text)
      live.finishInput('session', 1, 0)
      await settle()
      assert.equal(saved.length, 0)
      live.finish('session', { turn: 1, step: 0, messageId: 'reply', text, interrupted: false })
      await settle()
      assert.equal(sockets.length, 2)
      assert.equal(sockets.flatMap(socket => socket.sent.filter(command => command.type === 'text').map(command => command.text)).join(''), text)
      assert.equal(saved.length, 1)
      assert.equal(saved[0].messageId, 'reply')
    } finally { await live.dispose() }
  }), { endPcm: true })
})

test('long Chinese and mixed-language text is split into readable lines without losing content', () => {
  const text = '第一句话。第二句比较长，需要分成一行一行显示，数字 12.5 不应拆开。Hello world, welcome to the voice assistant!'
  const lines = splitCaptionLines(text).map(line => line.text)
  assert.ok(lines.length > 3)
  assert.equal(lines.join('').replace(/\s/gu, ''), text.replace(/\s/gu, ''))
  assert.ok(lines.some(line => line.includes('12.5')))
  assert.ok(lines.every(line => line.length < 40))
  assert.equal(lines[0], '第一句话。')
  const emoji = '👩‍👩‍👧‍👦'
  assert.ok(splitCaptionLines(`这是一段包含${emoji}的文字。`).some(line => line.text.includes(emoji)))
  const quoted = splitCaptionLines('他说：“你好！？”随后继续讲述。').map(line => line.text)
  assert.equal(quoted.join(''), '他说：“你好！？”随后继续讲述。')
  assert.ok(quoted.every(line => /[\p{L}\p{N}]/u.test(line)))
})

test('caption lines advance with media progress, pause and clean up', () => {
  const clock = captionClock(), captions = new ReadingCaptions(clock), owner = {}
  let mediaTime = 0
  const unsubscribe = captions.subscribe(() => {})
  captions.show(owner, 'session', '第一句。第二句。第三句。', { elapsed: () => mediaTime, duration: () => 9 })
  assert.equal(captions.getSnapshot().text, '第一句。')
  assert.equal(captions.getSnapshot().previousText, '')
  mediaTime = 3.2
  clock.advance(.1)
  assert.equal(captions.getSnapshot().text, '第二句。')
  assert.equal(captions.getSnapshot().previousText, '第一句。')
  captions.setPaused(owner, true)
  mediaTime = 8
  clock.advance(10)
  assert.equal(captions.getSnapshot().text, '第二句。')
  assert.equal(clock.pending(), 0)
  captions.setPaused(owner, false)
  clock.advance(.1)
  assert.equal(captions.getSnapshot().text, '第三句。')
  assert.equal(captions.getSnapshot().previousText, '第二句。')
  captions.clear(owner)
  unsubscribe()
  assert.equal(clock.pending(), 0)
})

test('estimated caption timing stops while paused and does not restart after ownership changes', () => {
  const clock = captionClock(), captions = new ReadingCaptions(clock), first = {}, next = {}
  const unsubscribe = captions.subscribe(() => {})
  captions.show(first, 'one', '第一句话。第二句话。第三句话。')
  captions.setPaused(first, true)
  clock.advance(30)
  captions.setPaused(first, false)
  clock.advance(.1)
  assert.equal(captions.getSnapshot().text, '第一句话。')
  captions.show(next, 'two', '新的内容。')
  clock.advance(30)
  assert.equal(captions.getSnapshot().text, '新的内容。')
  captions.clear(first)
  assert.equal(captions.getSnapshot().text, '新的内容。')
  captions.clear(next)
  unsubscribe()
  assert.equal(clock.pending(), 0)
})

test('the composer dock only renders when there is a visible caption or audio response', () => {
  const captions = new ReadingCaptions()
  const owner = {}
  captions.show(owner, 'first', '<unsafe> 正在读')
  const render = (sessionId, value = {}) => renderToStaticMarkup(createElement(ReadingCaptionBar, {
    sessionId, captions, t: () => 'Reading captions',
    useSession: selector => selector({ running: false }),
    playback: { getSnapshot: () => ({ sessionId: null, status: 'idle' }), subscribe: () => () => {} },
    settings: { getSnapshot: () => ({ status: 'ready', value }), subscribe: () => () => {} },
  }))
  assert.equal(render('first'), '')
  assert.equal(render('other', { showReadingCaptions: true }), '')
  assert.match(render('first', { showReadingCaptions: true }), /&lt;unsafe&gt; 正在读/u)
  const audioOnly = render('first', { showAudioResponse: true })
  assert.notEqual(audioOnly, '')
  assert.doesNotMatch(audioOnly, /正在读/u)
})

test('captions and audio response styles save and reset independently', async () => {
  const user = { voiceRate: 1.3 }
  const scope = {
    getSnapshot: () => ({ user, value: user }),
    async mutate(ops) {
      for (const op of ops) {
        if (op.op === 'set') user[op.path[0]] = op.value
        else delete user[op.path[0]]
      }
      return true
    },
  }
  const keys = { xiaomi: '', doubao: '', breeze: '' }
  await saveSettingsDraft(scope, resolveTtsSettings({
    ...user, showReadingCaptions: true, showAudioResponse: true, audioResponseStyle: 'siri-sheet',
  }), {
    showReadingCaptions: { kind: 'set' }, showAudioResponse: { kind: 'set' }, audioResponseStyle: { kind: 'set' },
  }, keys)
  assert.equal(resolveTtsSettings(user).showReadingCaptions, true)
  assert.equal(resolveTtsSettings(user).showAudioResponse, true)
  assert.equal(resolveTtsSettings(user).audioResponseStyle, 'siri-sheet')
  await saveSettingsDraft(scope, resolveTtsSettings(user), { showReadingCaptions: { kind: 'clear' } }, keys)
  assert.equal(resolveTtsSettings(user).showReadingCaptions, false)
  assert.equal(resolveTtsSettings(user).showAudioResponse, true)
  await saveSettingsDraft(scope, resolveTtsSettings(user), { showAudioResponse: { kind: 'clear' } }, keys)
  assert.equal(resolveTtsSettings(user).showAudioResponse, false)
  assert.equal(resolveTtsSettings(user).audioResponseStyle, 'siri-sheet')
  assert.equal(user.voiceRate, 1.3)
})

test('host integration keeps captions and audio response controls off the voice reading page', context => {
  const report = console.error
  context.mock.method(console, 'error', (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('Warning: useLayoutEffect does nothing on the server')) return
    report(...args)
  })
  const t = key => key
  const defaults = resolveTtsSettings({})
  assert.equal(defaults.showReadingCaptions, false)
  assert.equal(defaults.showAudioResponse, false)
  for (const showReadingCaptions of [false, true]) for (const showAudioResponse of [false, true]) {
    const value = { showReadingCaptions, showAudioResponse, audioResponseStyle: 'siri-wave-line' }
    const snapshot = { status: 'ready', writable: true, value }
    const scope = { getSnapshot: () => snapshot, subscribe: () => () => {}, mutate: async () => true }
    const plugin = renderToStaticMarkup(createElement(PreviewModule, {
      t, draft: resolveTtsSettings(value), overrides: [], writable: true, enabled: true, open: true, text: '', status: 'idle', source: null, recording: null,
    }))
    const voiceReading = renderToStaticMarkup(createElement(VoiceReadingSection, { scope, t, close() {}, openPluginSettings() {} }))
    const hostSettings = plugin.match(/<section\b[^>]*aria-label="settings\.hostIntegration"[^>]*>([\s\S]*?)<\/section>/u)?.[1]
    assert.ok(hostSettings)
    const hostInputs = hostSettings.match(/<input\b[^>]*>/gu) ?? []
    const hostCaptions = hostInputs.find(input => input.includes('aria-label="settings.readingCaptions"'))
    const hostResponse = hostInputs.find(input => input.includes('aria-label="settings.audioResponse"'))
    assert.ok(hostCaptions)
    assert.ok(hostResponse)
    assert.equal(hostCaptions.includes('checked=""'), showReadingCaptions)
    assert.equal(hostResponse.includes('checked=""'), showAudioResponse)
    assert.doesNotMatch(voiceReading, /settings\.readingCaptions/u)
    assert.doesNotMatch(voiceReading, /settings\.audioResponse/u)
    assert.doesNotMatch(hostSettings, /<input\b[^>]*type="radio"/u)
    const pluginStyle = (plugin.match(/<input\b[^>]*>/gu) ?? []).find(input => input.includes('type="radio"') && input.includes('value="siri-wave-line"'))
    const voiceStyle = (voiceReading.match(/<input\b[^>]*>/gu) ?? []).find(input => input.includes('type="radio"') && input.includes('value="siri-wave-line"'))
    if (showAudioResponse) assert.ok(pluginStyle?.includes('checked=""'))
    else assert.equal(pluginStyle, undefined)
    assert.equal(voiceStyle, undefined)
  }
})

test('Host integration presents one shared override action for multiple overridden switches', () => {
  const toggles = Object.fromEntries(ANNOUNCEMENT_TOGGLE_FIELDS.map(field => [field, {
    value: false, overridden: field === 'inputAvoidance' || field === 'voiceRecognitionService', onChange() {}, onReset() {},
  }]))
  const html = renderToStaticMarkup(createElement(AnnouncementSettings, {
    t: key => key, sources: [], writable: true, sourcesOverridden: false, toggles,
  }))
  const host = html.match(/<section\b[^>]*aria-label="settings\.hostIntegration"[^>]*>([\s\S]*?)<\/section>/u)?.[1]
  assert.ok(host)
  assert.equal((host.match(/settings\.overridden/gu) ?? []).length, 1)
  assert.equal((host.match(/settings\.reset/gu) ?? []).length, 1)
  assert.match(host, /aria-label="settings\.voiceRecognitionService"/u)
  assert.match(host, /aria-label="settings\.inputAvoidance"/u)
})

test('caption history follows one playback and session across pauses', () => {
  const captions = new ReadingCaptions(), first = {}, second = {}
  const media = { currentTime: 0, duration: 1 }
  captions.show(first, 'one', '第一段', mediaCaptionTiming(media))
  assert.equal(captions.getSnapshot().previousText, '')
  captions.setPaused(first, true)
  captions.show(first, 'one', '第一段', mediaCaptionTiming(media))
  assert.equal(captions.getSnapshot().previousText, '')
  captions.show(first, 'one', '第二段')
  assert.equal(captions.getSnapshot().previousText, '第一段')
  captions.show(first, 'one', '第三段')
  assert.equal(captions.getSnapshot().previousText, '第二段')
  captions.show(second, 'one', '另一段')
  assert.equal(captions.getSnapshot().previousText, '')
  captions.show(second, 'two', '另一会话')
  assert.equal(captions.getSnapshot().previousText, '')
  captions.clear(second)
  assert.deepEqual(captions.getSnapshot(), { sessionId: null, text: '', previousText: '', paused: false })
})

test('repeated text uses the current audio progress while resuming the same audio preserves its line', () => {
  const clock = captionClock(), captions = new ReadingCaptions(clock), owner = {}
  const unsubscribe = captions.subscribe(() => {})
  const first = { currentTime: 0, duration: 9 }
  const text = '第一句。第二句。第三句。'
  captions.show(owner, 'session', text, mediaCaptionTiming(first))
  first.currentTime = 6.5
  clock.advance(.1)
  assert.equal(captions.getSnapshot().text, '第三句。')
  captions.setPaused(owner, true)
  captions.show(owner, 'session', text, mediaCaptionTiming(first))
  assert.equal(captions.getSnapshot().text, '第三句。')

  const replay = { currentTime: 0, duration: 9 }
  captions.show(owner, 'session', text, mediaCaptionTiming(replay))
  assert.equal(captions.getSnapshot().text, '第一句。')
  replay.currentTime = 3.5
  clock.advance(.1)
  assert.equal(captions.getSnapshot().text, '第二句。')

  captions.show(owner, 'session', text)
  assert.equal(captions.getSnapshot().text, '第一句。')
  unsubscribe()
})

test('caption text remains readable and is escaped when rendered', () => {
  const html = renderToStaticMarkup(createElement(ReadingCaptionLines, {
    previousText: '上一段', text: '<unsafe> 很长的当前段', label: '朗读字幕',
  }))
  assert.match(html, /role="region"/u)
  assert.match(html, /上一段/u)
  assert.match(html, /&lt;unsafe&gt; 很长的当前段/u)
  assert.doesNotMatch(html, /<unsafe>/u)
})

test('caption cleanup only affects the player that owns the visible text', () => {
  const captions = new ReadingCaptions()
  const first = {}
  const second = {}
  captions.show(first, 'session', '第一段')
  captions.show(second, 'session', '第二段')
  captions.clear(first)
  assert.equal(captions.getSnapshot().text, '第二段')
  captions.clear(second)
  assert.equal(captions.getSnapshot().text, '')
  assert.equal(readingCaptionText('(温柔)你好[轻笑]世界', { provider: 'xiaomi', model: 'mimo-v2.5-tts' }), '你好 世界')
  assert.equal(readingCaptionText('你好[轻笑]世界', { provider: 'breeze' }), '你好 世界')
})

test('streaming captions follow the audio clock across queued segments and pause', async () => {
  const pcm = Buffer.alloc(48000).toString('base64')
  const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const live = new LiveSpeechController(undefined, captions)
    live.activateSession('session')
    live.configure(resolveTtsSettings({ provider: 'xiaomi', model: 'mimo-v2.5-tts' }))
    try {
      live.playCompleted('session', 'message', `${'甲'.repeat(160)}。${'乙'.repeat(160)}。`, () => assert.fail('unexpected fallback'))
      for (let i = 0; i < 8 && state.requests.length < 2; i += 1) await settle()
      await settle()
      const clock = state.contexts[0]
      assert.ok(clock)
      assert.equal(captions.getSnapshot().text, '')
      clock.advanceTo(0.05)
      assert.ok(captions.getSnapshot().text.startsWith('甲'))
      assert.equal(await live.pause('session'), true)
      assert.equal(captions.getSnapshot().paused, true)
      clock.advanceTo(1.05)
      assert.ok(captions.getSnapshot().text.startsWith('甲'))
      assert.equal(await live.resume('session'), true)
      assert.equal(captions.getSnapshot().paused, false)
      clock.advanceTo(1.05)
      assert.ok(captions.getSnapshot().text.startsWith('乙'))
      assert.ok(captions.getSnapshot().previousText.startsWith('甲'))
      live.activateSession('other')
      clock.advanceTo(5)
      assert.equal(captions.getSnapshot().text, '')
    } finally { await live.dispose() }
  }, { fetch: () => new Response(event) })
})

for (const atSegmentBoundary of [false, true]) {
  const when = atSegmentBoundary ? 'at a segment boundary' : 'before the first caption'
  test(`a delayed PCM cue cannot advance captions while paused ${when}`, async () => {
    const pcm = Buffer.alloc(48000).toString('base64')
    const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
    await withBrowserPlayback(async state => {
      const clock = captionClock(), captions = new ReadingCaptions(clock)
      const unsubscribe = captions.subscribe(() => {})
      const live = new LiveSpeechController(undefined, captions)
      const playback = new PlaybackController()
      const request = { sessionId: 'session', messageId: 'message', live, playback }
      live.activateSession('session')
      playback.activateSession('session')
      live.setStateChangeListener((s, m, status) => playback.updateLivePlayback(s, m, status))
      let finishSuspend
      try {
        live.playCompleted('session', 'message', `${'甲'.repeat(160)}。${'乙'.repeat(160)}。`)
        for (let i = 0; i < 8 && state.requests.length < 2; i += 1) await settle()
        await settle()
        const audio = state.contexts[0]
        if (atSegmentBoundary) {
          audio.advanceTo(.05)
          assert.match(captions.getSnapshot().text, /^甲/u)
        } else assert.equal(captions.getSnapshot().text, '')

        audio.suspendResult = new Promise(resolve => { finishSuspend = resolve })
        handleReadAloudClick(request, playback.getSnapshot())
        const pausedCaption = captions.getSnapshot()
        audio.advanceTo(atSegmentBoundary ? 1.05 : .05)
        clock.advance(5)
        assert.equal(playback.getSnapshot().status, 'paused')
        assert.deepEqual(captions.getSnapshot(), pausedCaption)
        assert.equal(clock.pending(), 0)

        finishSuspend()
        await settle()
        handleReadAloudClick(request, playback.getSnapshot())
        await settle()
        assert.equal(playback.getSnapshot().status, 'playing')
        assert.equal(captions.getSnapshot().paused, false)
        assert.match(captions.getSnapshot().text, atSegmentBoundary ? /^乙/u : /^甲/u)
      } finally { finishSuspend?.(); unsubscribe(); await live.dispose(); playback.dispose() }
    }, { fetch: () => new Response(event) })
  })
}

test('an old streaming pause failure cannot resume captions of a newer paused playback', async () => {
  const pcm = Buffer.alloc(48000).toString('base64')
  const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const live = new LiveSpeechController(undefined, captions)
    live.activateSession('session')
    try {
      live.playCompleted('session', 'old', '第一段。', () => assert.fail('unexpected fallback'))
      await settle()
      const audio = state.contexts[0]
      audio.advanceTo(.05)
      let rejectOld
      audio.suspendResult = new Promise((_, reject) => { rejectOld = reject })
      const oldPause = live.pause('session')

      live.playCompleted('session', 'new', '第二段。', () => assert.fail('unexpected fallback'))
      await settle()
      audio.advanceTo(.1)
      assert.match(captions.getSnapshot().text, /^第二段/u)
      let finishNew
      audio.suspendResult = new Promise(resolve => { finishNew = resolve })
      const newPause = live.pause('session')
      assert.equal(captions.getSnapshot().paused, true)
      rejectOld(new Error('old suspend failed'))
      assert.equal(await oldPause, false)
      assert.equal(captions.getSnapshot().paused, true)
      finishNew()
      assert.equal(await newPause, true)
    } finally { await live.dispose() }
  }, { fetch: () => new Response(event) })
})

test('an earlier failed pause cannot override a newer pause of the same stream', async () => {
  const pcm = Buffer.alloc(48000).toString('base64')
  const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions(), live = new LiveSpeechController(undefined, captions)
    live.activateSession('session')
    try {
      live.playCompleted('session', 'message', '正在朗读。', () => assert.fail('unexpected fallback'))
      await settle()
      const audio = state.contexts[0]
      audio.advanceTo(.05)
      let rejectOld
      audio.suspendResult = new Promise((_, reject) => { rejectOld = reject })
      const oldPause = live.pause('session')
      assert.equal(await live.resume('session'), true)
      let finishNew
      audio.suspendResult = new Promise(resolve => { finishNew = resolve })
      const newPause = live.pause('session')
      rejectOld(new Error('old suspend failed'))
      assert.equal(await oldPause, false)
      assert.equal(captions.getSnapshot().paused, true)
      finishNew()
      assert.equal(await newPause, true)
      assert.equal(audio.state, 'suspended')
    } finally { await live.dispose() }
  }, { fetch: () => new Response(event) })
})

test('a late pause cannot silence the same stream after it resumes', async () => {
  const pcm = Buffer.alloc(48000).toString('base64')
  const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions(), live = new LiveSpeechController(undefined, captions)
    live.activateSession('session')
    try {
      live.playCompleted('session', 'message', '正在朗读。', () => assert.fail('unexpected fallback'))
      await settle()
      const audio = state.contexts[0]
      audio.advanceTo(.05)
      let finishPause
      audio.suspendResult = new Promise(resolve => { finishPause = resolve })
      const oldPause = live.pause('session')
      assert.equal(await live.resume('session'), true)
      finishPause()
      assert.equal(await oldPause, false)
      assert.equal(audio.state, 'running')
      assert.equal(captions.getSnapshot().paused, false)
    } finally { await live.dispose() }
  }, { fetch: () => new Response(event) })
})

test('a PCM segment displays its sentences one line at a time over the audio duration', async () => {
  const pcm = Buffer.alloc(48000 * 9).toString('base64')
  const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
  await withBrowserPlayback(async state => {
    const clock = captionClock(), captions = new ReadingCaptions(clock)
    const unsubscribe = captions.subscribe(() => {})
    const live = new LiveSpeechController(undefined, captions)
    live.activateSession('session')
    try {
      live.playCompleted('session', 'message', '第一句。第二句。第三句。', () => assert.fail('unexpected fallback'))
      await settle()
      const audio = state.contexts[0]
      audio.advanceTo(.05)
      assert.match(captions.getSnapshot().text, /^第一句/u)
      assert.doesNotMatch(captions.getSnapshot().text, /第二句/u)
      clock.advance(30)
      assert.match(captions.getSnapshot().text, /^第一句/u)
      audio.advanceTo(3.3)
      clock.advance(.1)
      assert.match(captions.getSnapshot().text, /^第二句/u)
      assert.match(captions.getSnapshot().previousText, /^第一句/u)
      audio.advanceTo(6.4)
      clock.advance(.1)
      assert.match(captions.getSnapshot().text, /^第三句/u)
      audio.advanceTo(10)
      assert.equal(captions.getSnapshot().text, '')
    } finally { await live.dispose(); unsubscribe() }
  }, { fetch: () => new Response(event) })
})

test('a one-sample PCM chunk can still publish its caption at playback start', async () => {
  await withBrowserPlayback(async state => {
    let started = false
    const queue = new PcmAudioQueue({ onBusyChange() {}, onPlaybackStart() {} })
    try {
      await queue.enqueueBytes(Uint8Array.of(0, 0), () => { started = true })
      assert.equal(started, false)
      state.contexts[0].advanceTo(0.03)
      assert.equal(started, true)
    } finally { await queue.dispose() }
  })
})

test('the optional PCM analysis source follows audible playback and clears on pause, end and stop', async () => {
  await withBrowserPlayback(async state => {
    const queue = new PcmAudioQueue({ onBusyChange() {}, onPlaybackStart() {} })
    try {
      await queue.enqueueBytes(new Uint8Array(48000))
      const context = state.contexts[0]
      const analysis = { context, disconnect() {} }
      context.createAnalyser = () => analysis
      assert.equal(PcmAudioQueue.getPlaybackSource(), null)
      context.advanceTo(0.1)
      assert.equal(PcmAudioQueue.getPlaybackSource(), analysis)
      await queue.pause()
      assert.equal(PcmAudioQueue.getPlaybackSource(), null)
      await queue.resume()
      assert.equal(PcmAudioQueue.getPlaybackSource(), analysis)
      context.advanceTo(1.1)
      assert.equal(PcmAudioQueue.getPlaybackSource(), null)

      await queue.enqueueBytes(new Uint8Array(48000))
      context.advanceTo(1.2)
      assert.equal(PcmAudioQueue.getPlaybackSource(), analysis)
      queue.stop()
      assert.equal(PcmAudioQueue.getPlaybackSource(), null)
    } finally { await queue.dispose() }
  })
})

test('temporary PCM gaps hide and resume captions without losing the current segment', async () => {
  const pcm = Buffer.alloc(48000).toString('base64')
  const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
  let stream
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const live = new LiveSpeechController(undefined, captions)
    live.activateSession('session')
    try {
      live.playCompleted('session', 'message', '网络暂时中断的句段。', () => assert.fail('unexpected fallback'))
      await settle()
      stream.enqueue(event)
      await settle()
      const clock = state.contexts[0]
      clock.advanceTo(0.05)
      const currentText = captions.getSnapshot().text
      assert.match(currentText, /网络暂时中断的句段/u)
      clock.advanceTo(1.1)
      assert.equal(captions.getSnapshot().paused, true)
      stream.enqueue(event)
      await settle()
      assert.equal(captions.getSnapshot().text, currentText)
      assert.equal(captions.getSnapshot().paused, false)
      stream.close()
      await settle()
      clock.advanceTo(3)
      assert.equal(captions.getSnapshot().text, '')
    } finally { await live.dispose() }
  }, { fetch: () => new Response(new ReadableStream({ start(controller) { stream = controller } })) })
})

test('changing the next playback speed does not accelerate captions for the current stream', async () => {
  const pcm = Buffer.alloc(48000 * 9).toString('base64')
  const event = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm } } }] })}\n\n`)
  let stream
  await withBrowserPlayback(async state => {
    const clock = captionClock(), captions = new ReadingCaptions(clock)
    const unsubscribe = captions.subscribe(() => {})
    const live = new LiveSpeechController(undefined, captions)
    live.activateSession('session')
    try {
      live.playCompleted('session', 'message', '第一句话。第二句话。第三句话。', () => assert.fail('unexpected fallback'))
      await settle()
      stream.enqueue(event)
      await settle()
      live.setVoiceRate(2)
      const audio = state.contexts[0]
      audio.advanceTo(.05)
      const first = captions.getSnapshot().text
      audio.advanceTo(.65)
      clock.advance(.6)
      assert.equal(captions.getSnapshot().text, first)
      stream.close()
      await settle()
      audio.advanceTo(3.4)
      clock.advance(2.75)
      assert.notEqual(captions.getSnapshot().text, first)
    } finally { await live.dispose(); unsubscribe() }
  }, { fetch: () => new Response(new ReadableStream({ start(controller) { stream = controller } })) })
})

test('browser speech captions start before a durable message id and clear on cancellation', async () => {
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const local = new LocalSpeechController(captions)
    local.activateSession('session')
    try {
      local.observe('session', 1, 0, `${'正在说话'.repeat(7)}。`)
      const utterance = state.utterances[0]
      const lateStart = utterance.onstart
      assert.equal(captions.getSnapshot().text, '')
      utterance.onstart()
      assert.equal(captions.getSnapshot().sessionId, 'session')
      assert.match(captions.getSnapshot().text, /正在说话/u)
      await local.pause('session')
      assert.equal(captions.getSnapshot().paused, true)
      assert.match(captions.getSnapshot().text, /正在说话/u)
      local.cancel()
      lateStart()
      assert.equal(captions.getSnapshot().text, '')
    } finally { local.dispose() }
  })
})

test('MOSS captions follow the local audio lifecycle', async () => {
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const local = new LocalSpeechController(captions)
    local.activateSession('session')
    local.setMossVoice('moss', 'http://127.0.0.1:18083', 'demo')
    try {
      local.playCompleted('session', 'message', '本地语音测试。')
      await settle()
      assert.match(captions.getSnapshot().text, /本地语音测试/u)
      await local.pause('session')
      assert.match(captions.getSnapshot().text, /本地语音测试/u)
      await local.resume('session')
      state.media[0].onended()
      await settle()
      assert.equal(captions.getSnapshot().text, '')
    } finally { local.dispose() }
  }, { fetch: () => new Response('wav') })
})

test('a failed cloud stream lets the local fallback own and clear its captions', async () => {
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const live = new LiveSpeechController(undefined, captions)
    const local = new LocalSpeechController(captions)
    live.activateSession('session')
    local.activateSession('session')
    try {
      live.playCompleted('session', 'message', '回退朗读。', () => local.playCompleted('session', 'message', '回退朗读。'))
      await settle()
      assert.equal(captions.getSnapshot().text, '')
      state.utterances[0].onstart()
      assert.match(captions.getSnapshot().text, /回退朗读/u)
      live.cancel()
      assert.match(captions.getSnapshot().text, /回退朗读/u)
      local.cancel()
      assert.equal(captions.getSnapshot().text, '')
    } finally { await live.dispose(); local.dispose() }
  }, { fetch: () => new Response('unavailable', { status: 503 }) })
})

test('complete audio captions follow playback, pause and end', async () => {
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const playback = new PlaybackController(undefined, captions)
    playback.activateSession('session')
    playback.configure(resolveTtsSettings({ model: 'mimo-v2.5-tts-voicedesign' }))
    try {
      await playback.toggle('session', 'message', '完整朗读。', false)
      assert.equal(captions.getSnapshot().text, '完整朗读。')
      await playback.toggle('session', 'message', '完整朗读。', false)
      assert.equal(captions.getSnapshot().text, '完整朗读。')
      assert.equal(captions.getSnapshot().paused, true)
      await playback.toggle('session', 'message', '完整朗读。', false)
      state.media[0].dispatchEvent(new Event('ended'))
      assert.equal(captions.getSnapshot().text, '')
    } finally { playback.dispose() }
  }, { fetch: () => new Response('audio') })
})

test('complete media drives line changes from its actual playback position', async () => {
  await withBrowserPlayback(async state => {
    const clock = captionClock(), captions = new ReadingCaptions(clock)
    const unsubscribe = captions.subscribe(() => {})
    const playback = new PlaybackController(undefined, captions)
    playback.activateSession('session')
    try {
      const text = '第一句。第二句。第三句。'
      await playback.toggle('session', 'message', text, false)
      const audio = state.media[0]
      audio.duration = 9
      audio.currentTime = 3.2
      clock.advance(.1)
      assert.equal(captions.getSnapshot().text, '第二句。')
      await playback.toggle('session', 'message', text, false)
      audio.currentTime = 7
      clock.advance(10)
      assert.equal(captions.getSnapshot().text, '第二句。')
      await playback.toggle('session', 'message', text, false)
      clock.advance(.1)
      assert.equal(captions.getSnapshot().text, '第三句。')
      audio.dispatchEvent(new Event('ended'))
      assert.equal(captions.getSnapshot().text, '')
      assert.equal(clock.pending(), 0)
    } finally { playback.dispose(); unsubscribe() }
  }, { fetch: () => new Response('audio') })
})

test('a blocked complete-audio start shows captions only after a successful retry', async () => {
  await withBrowserPlayback(async () => {
    const captions = new ReadingCaptions()
    const playback = new PlaybackController(undefined, captions)
    const play = Audio.prototype.play
    let blocked = true
    Audio.prototype.play = function () {
      if (blocked) { blocked = false; return Promise.reject(new Error('blocked')) }
      return play.call(this)
    }
    playback.activateSession('session')
    try {
      await playback.toggle('session', 'message', '等待播放。', true)
      assert.equal(captions.getSnapshot().text, '')
      await playback.toggle('session', 'message', '等待播放。', false)
      assert.equal(captions.getSnapshot().text, '等待播放。')
      playback.cancelPlayback('session')
      assert.equal(captions.getSnapshot().text, '')
    } finally { playback.dispose() }
  }, { fetch: () => new Response('audio') })
})

test('segmented audio captions wait for playback rather than prefetch', async () => {
  await withBrowserPlayback(async state => {
    const captions = new ReadingCaptions()
    const playback = new PlaybackController(undefined, captions)
    playback.activateSession('session')
    playback.configure(resolveTtsSettings({ model: 'mimo-v2.5-tts-voicedesign' }))
    try {
      const text = `${'甲'.repeat(180)}。${'乙'.repeat(180)}。`
      const pending = playback.segmented('session', 'message', text, false)
      await settle()
      assert.ok(captions.getSnapshot().text.startsWith('甲'))
      playback.pauseSegmented('session', 'message')
      assert.equal(captions.getSnapshot().paused, true)
      await pending
      assert.ok(captions.getSnapshot().text.startsWith('甲'))
      const resumed = playback.segmented('session', 'message', text, false)
      await settle()
      state.media.at(-1).dispatchEvent(new Event('ended'))
      await settle()
      assert.ok(captions.getSnapshot().text.startsWith('乙'))
      state.media.at(-1).dispatchEvent(new Event('ended'))
      await resumed
      assert.equal(captions.getSnapshot().text, '')
    } finally { playback.dispose() }
  }, { fetch: () => new Response('audio') })
})
