import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'

const { ReadingCaptions, mediaCaptionTiming, readingCaptionText } = await loadClientModule('src/client/playback/reading-captions.ts')
const { splitCaptionLines } = await loadClientModule('src/client/playback/caption-lines.ts')
const { ReadingCaptionBar, ReadingCaptionLines } = await loadClientModule('src/client/conversation/reading-caption-bar.tsx')
const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { PcmAudioQueue } = await loadClientModule('src/client/playback/pcm-audio-queue.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const { AnnouncementSettings } = await loadClientModule('src/client/settings/announcement-settings.tsx')
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

test('floating captions are opt-in', () => {
  const captions = new ReadingCaptions()
  const owner = {}
  captions.show(owner, 'first', '<unsafe> 正在读')
  const render = (sessionId, enabled) => renderToStaticMarkup(createElement(ReadingCaptionBar, {
    sessionId, captions, t: () => 'Reading captions',
    settings: { getSnapshot: () => ({ status: 'ready', value: { showReadingCaptions: enabled } }), subscribe: () => () => {} },
  }))
  assert.equal(resolveTtsSettings({}).showReadingCaptions, false)
  assert.equal(render('first', false), '')
  // The visual portal is mounted only in a browser, after the composer is measured.
  assert.doesNotMatch(render('first', true), /unsafe/u)
})

test('caption settings save and reset without changing unrelated preferences', async () => {
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
  await saveSettingsDraft(scope, resolveTtsSettings({ ...user, showReadingCaptions: true }), { showReadingCaptions: { kind: 'set' } }, keys)
  assert.equal(resolveTtsSettings(user).showReadingCaptions, true)
  await saveSettingsDraft(scope, resolveTtsSettings(user), { showReadingCaptions: { kind: 'clear' } }, keys)
  assert.equal(resolveTtsSettings(user).showReadingCaptions, false)
  assert.equal(user.voiceRate, 1.3)
})

test('caption setting is available in Host integration and Voice reading with the same state', context => {
  const report = console.error
  context.mock.method(console, 'error', (...args) => {
    if (typeof args[0] === 'string' && args[0].startsWith('Warning: useLayoutEffect does nothing on the server')) return
    report(...args)
  })
  const t = key => key
  for (const enabled of [false, true]) for (const writable of [false, true]) {
    const html = renderToStaticMarkup(createElement(AnnouncementSettings, {
      t, sources: [], writable, showReadingCaptions: enabled, overridden: false,
      onChange() {}, onReset() {},
    }))
    const host = html.match(/<section\b[^>]*aria-label="settings\.hostIntegration"[^>]*>([\s\S]*?)<\/section>/u)?.[1]
    assert.ok(host)
    const control = host.match(/<input\b[^>]*>/gu)?.find(input => input.includes('aria-label="settings.readingCaptions"'))
    assert.ok(control)
    assert.equal(control.includes('checked=""'), enabled)
    assert.equal(control.includes('disabled=""'), !writable)
    const snapshot = { status: 'ready', writable, value: { showReadingCaptions: enabled } }
    const scope = { getSnapshot: () => snapshot, subscribe: () => () => {}, mutate: async () => true }
    const reading = renderToStaticMarkup(createElement(VoiceReadingSection, { scope, t, close() {}, openPluginSettings() {} }))
    const readingControl = reading.match(/<input\b[^>]*>/gu)?.find(input => input.includes('aria-label="settings.readingCaptions"'))
    assert.ok(readingControl)
    assert.equal(readingControl.includes('checked=""'), enabled)
    assert.equal(readingControl.includes('disabled=""'), !writable)
  }
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
      audio.advanceTo(3.3)
      clock.advance(3.25)
      assert.match(captions.getSnapshot().text, /^第二句/u)
      assert.match(captions.getSnapshot().previousText, /^第一句/u)
      audio.advanceTo(6.4)
      clock.advance(3.1)
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
