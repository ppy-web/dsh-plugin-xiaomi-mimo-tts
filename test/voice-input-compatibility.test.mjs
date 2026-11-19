import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TTS_SEGMENT_CHARACTERS, resolveTtsSettings } from '../lib/shared.js'
import { createRecipe, renderRecipe } from '../src/client/sound-effects/runtime.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'

const { readComposerRecordingLevel, readComposerVoiceInput, VoiceInputActivity } = await loadClientModule('src/client/voice-input-activity.ts')
const { PluginAudioFocus } = await loadClientModule('src/client/plugin-activity.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { createSoundEffectsController } = await loadClientModule('src/client/sound-effects/index.ts')

// Model the browser boundary, including queued callbacks after disconnect.
function voiceDocument(t, initial = []) {
  let phases = initial
  const observers = []
  const original = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver')
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'MutationObserver', original)
    else delete globalThis.MutationObserver
  })
  Object.defineProperty(globalThis, 'MutationObserver', { value: class {
    connected = false
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe() { this.connected = true }
    disconnect() { this.connected = false }
  }, configurable: true })
  const document = {
    querySelector(selector) {
      const accepted = [...selector.matchAll(/\[data-voice-activity="([^"]+)"\]/gu)].map(match => match[1])
      return phases.some(phase => accepted.includes(phase)) ? {} : null
    },
  }
  return {
    document, observers,
    change(next, type = 'attributes') {
      phases = next
      const marker = { nodeType: 1, matches: () => true }
      const record = type === 'attributes' ? { type } : { type: 'childList', addedNodes: type === 'insert' ? [marker] : [], removedNodes: type === 'remove' ? [marker] : [] }
      for (const observer of observers) if (observer.connected) observer.callback([record])
    },
  }
}

test('requesting, recording and transcribing block audio until success, cancellation or feedback', t => {
  const dom = voiceDocument(t, ['recording'])
  const activity = new VoiceInputActivity(dom.document)
  let claims = 0
  const focus = new PluginAudioFocus({ canPlay: () => true, claim: () => claims++, subscribe: () => () => {} }, activity)
  const permissions = []
  const off = focus.subscribe(() => permissions.push(focus.canPlay()))
  activity.start()
  assert.equal(focus.canPlay(), false, 'starting during recording must stop playback immediately')
  for (const phase of ['requesting', 'recording', 'transcribing']) {
    dom.change([phase])
    focus.claim()
    assert.equal(focus.canPlay(), false)
  }
  assert.equal(claims, 0, 'manual playback cannot override voice input')
  assert.deepEqual(permissions, [false], 'phase transitions must not repeatedly interrupt the current turn')
  dom.change(['feedback'])
  assert.equal(focus.canPlay(), true, 'failed recognition must release audio permission')
  dom.change(['requesting'])
  dom.change([], 'remove')
  assert.equal(focus.canPlay(), true, 'cancellation or composer unmount must release permission')
  dom.change(['recording'], 'insert')
  dom.change(['transcribing'])
  dom.change([], 'remove')
  assert.equal(focus.canPlay(), true, 'successful transcription must release permission')
  off()
  activity.dispose()
})

test('all visible composers participate and unloading releases observation without overriding other audio gates', t => {
  const dom = voiceDocument(t, ['feedback', 'recording'])
  const activity = new VoiceInputActivity(dom.document)
  let owner = true
  const focus = new PluginAudioFocus({ canPlay: () => owner, claim: () => {}, subscribe: () => () => {} }, activity)
  activity.start()
  assert.equal(focus.canPlay(), false)
  dom.change(['feedback', 'transcribing'])
  assert.equal(focus.canPlay(), false)
  const oldObserver = dom.observers[0]
  activity.dispose()
  assert.equal(oldObserver.connected, false)
  assert.equal(focus.canPlay(), true)
  oldObserver.callback([{ type: 'attributes' }])
  assert.equal(focus.canPlay(), true)
  activity.start()
  assert.equal(focus.canPlay(), false)
  owner = false
  dom.change([], 'remove')
  assert.equal(focus.canPlay(), false, 'voice input ending must not steal audio from another tab')
  activity.dispose()
  assert.ok(dom.observers.every(observer => !observer.connected))
})

test('the response orb resolves the current composer microphone and never treats cancellation as stop', () => {
  const control = (label, disabled = false) => ({ getAttribute: () => label, matches: () => disabled, closest: () => null })
  const start = control('Начать запись')
  const stop = control('停止并识别')
  const retry = control('Record again')
  let phase = null
  let microphone = start
  const row = {
    getAttribute: () => phase,
    querySelector: selector => phase === 'recording' && selector.includes('stop-fill') ? stop
      : phase === 'feedback' && selector.includes('microphone-outline') ? microphone : null,
  }
  const slot = { querySelector: selector => selector.includes('data-voice-activity') ? phase && row
    : !phase && selector.includes('microphone-outline') ? microphone : null }
  const seat = { querySelector: selector => selector.includes('conversation.input.activity') ? slot : null }

  assert.deepEqual(readComposerVoiceInput(seat), { phase: 'idle', button: start, label: 'Начать запись', disabled: false })
  microphone = control('Start recording', true)
  assert.equal(readComposerVoiceInput(seat).disabled, true)
  phase = 'recording'
  assert.equal(readComposerVoiceInput(seat).button, stop)
  for (phase of ['requesting', 'transcribing']) assert.equal(readComposerVoiceInput(seat).disabled, true)
  phase = 'feedback'
  microphone = retry
  assert.equal(readComposerVoiceInput(seat).button, retry)
  microphone = null
  assert.equal(readComposerVoiceInput(seat).disabled, true)
  assert.equal(readComposerVoiceInput(null).button, null)
})

test('the response orb follows the host waveform from silence to full amplitude and handles a missing meter', () => {
  let attributes = { y1: '19', y2: '21' }
  const line = { getAttribute: name => attributes[name] ?? null }
  const seat = { querySelector: () => attributes ? line : null }

  assert.equal(readComposerRecordingLevel(seat), 0)
  attributes = { y1: '10.5', y2: '29.5' }
  assert.equal(readComposerRecordingLevel(seat), 0.5)
  attributes = { y1: '2', y2: '38' }
  assert.equal(readComposerRecordingLevel(seat), 1)
  attributes = { y1: 'invalid', y2: '38' }
  assert.equal(readComposerRecordingLevel(seat), undefined)
  attributes = null
  assert.equal(readComposerRecordingLevel(seat), undefined)
})

test('confirmed microphone transitions play the selected pack and respect click mute and tab audio focus', async t => {
  const dom = voiceDocument(t)
  const activity = new VoiceInputActivity(dom.document)
  const sampleRate = 24_000
  let tabOwnsAudio = true
  await withBrowserPlayback(async state => {
    window.AudioContext = AudioContext
    AudioContext.prototype.sampleRate = sampleRate
    const sounds = createSoundEffectsController(() => tabOwnsAudio && !activity.getSnapshot(), () => tabOwnsAudio)
    const settings = { enabled: true, clickSounds: true, taskSounds: true, volume: 0.7, pack: 'minimal' }
    const played = () => state.contexts.flatMap(context => context.sources.map(source => source.buffer.duration))
    const duration = (pack, cue) => renderRecipe(createRecipe(pack, cue), sampleRate).duration
    sounds.update(settings)
    activity.start(sounds.playMicrophoneCue)
    try {
      dom.change(['requesting'], 'insert')
      sounds.play('notification')
      dom.change(['feedback'])
      assert.deepEqual(played(), [], 'requesting or a failed permission grant must not sound like live recording')

      dom.change(['recording'])
      dom.change(['recording', 'feedback'])
      sounds.update({ ...settings, pack: 'scifi' })
      dom.change(['transcribing'])
      dom.change([], 'remove')
      const recordingSounds = [duration('minimal', 'toggle-on'), duration('scifi', 'toggle-off')]
      assert.deepEqual(played(), recordingSounds)

      sounds.update({ ...settings, clickSounds: false })
      dom.change(['recording'], 'insert')
      dom.change([], 'remove')
      sounds.update({ ...settings, enabled: false })
      dom.change(['recording'], 'insert')
      dom.change([], 'remove')
      sounds.update(settings)
      tabOwnsAudio = false
      dom.change(['recording'], 'insert')
      dom.change([], 'remove')
      assert.deepEqual(played(), recordingSounds)

      tabOwnsAudio = true
      dom.change(['recording'], 'insert')
      dom.change([], 'remove')
      assert.deepEqual(played().slice(2), [duration('minimal', 'toggle-on'), duration('minimal', 'toggle-off')], 'cancelling live capture closes the microphone once')
    } finally {
      activity.dispose()
      await sounds.dispose()
    }
  })
})

test('voice input interrupts a pending synthesis, rejects late audio and does not resume the interrupted turn', async t => {
  const dom = voiceDocument(t)
  const activity = new VoiceInputActivity(dom.document)
  const focus = new PluginAudioFocus({ canPlay: () => true, claim: () => {}, subscribe: () => () => {} }, activity)
  activity.start()
  let response
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    live.setFallbackHandler(() => assert.fail('cancelled speech must not restart through a fallback'))
    live.configure(resolveTtsSettings())
    live.activateSession('session')
    const off = focus.subscribe(() => { if (!focus.canPlay()) live.interrupt() })
    try {
      const text = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
      live.observe('session', 1, 0, text)
      await settle()
      assert.equal(state.requests.length, 1)
      dom.change(['requesting'], 'insert')
      assert.equal(state.requests[0].signal.aborted, true)
      response(new Response('data: {"choices":[{"delta":{"audio":{"data":"AAA="}}}]}\n\n'))
      await settle()
      assert.equal(state.contexts.length, 0, 'late synthesis data must not reach the speaker')
      dom.change([], 'remove')
      live.observe('session', 1, 0, text + '后续文字。')
      assert.equal(state.requests.length, 1, 'the interrupted turn must stay blocked')
      live.observe('session', 2, 0, '乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。')
      await settle()
      assert.equal(state.requests.length, 2)
    } finally { off(); await live.dispose() }
  }, { fetch: () => new Promise(resolve => { response = resolve }) })
  activity.dispose()
})

test('recording stops already playing PCM and ending input only permits a fresh reply', async t => {
  const dom = voiceDocument(t)
  const activity = new VoiceInputActivity(dom.document)
  const focus = new PluginAudioFocus({ canPlay: () => true, claim: () => {}, subscribe: () => () => {} }, activity)
  activity.start()
  await withBrowserPlayback(async state => {
    const live = new LiveSpeechController()
    live.activateSession('session')
    const off = focus.subscribe(() => { if (!focus.canPlay()) live.interrupt() })
    try {
      const text = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
      live.observe('session', 1, 0, text)
      await settle()
      assert.equal(state.contexts[0].sources.length, 1)
      const stopAudio = t.mock.method(state.contexts[0].sources[0], 'stop')
      assert.equal(live.isBusy(), true)
      dom.change(['recording'], 'insert')
      await settle()
      assert.equal(live.isBusy(), false)
      assert.ok(stopAudio.mock.calls.length > 0, 'the audio source must stop producing sound')
      dom.change(['transcribing'])
      assert.equal(focus.canPlay(), false)
      dom.change([], 'remove')
      await settle()
      assert.equal(live.isBusy(), false, 'ending input must not resume audio')
      live.observe('session', 1, 0, text + '更多内容。')
      assert.equal(live.isBusy(), false)
      live.observe('session', 2, 0, text)
      await settle()
      assert.equal(live.isBusy(), true)
    } finally { off(); await live.dispose() }
  }, { fetch: () => new Response(pcmEvent()) })
  activity.dispose()
})
