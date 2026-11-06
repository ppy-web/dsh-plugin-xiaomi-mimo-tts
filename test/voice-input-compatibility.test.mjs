import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TTS_SEGMENT_CHARACTERS, resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'

const { VoiceInputActivity } = await loadClientModule('src/client/voice-input-activity.ts')
const { PluginAudioFocus } = await loadClientModule('src/client/plugin-activity.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')

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

test('voice input compatibility defaults on and saves or resets independently of other audio settings', async () => {
  assert.equal(resolveTtsSettings().voiceInputCompatibility, true)
  assert.equal(resolveTtsSettings({ voiceInputCompatibility: false }).voiceInputCompatibility, false)
  const user = { autoPlay: true, soundEnabled: true, localVoiceURI: 'saved-voice' }
  const scope = {
    getSnapshot: () => ({ user, value: resolveTtsSettings(user) }),
    async mutate(ops) {
      for (const op of ops) {
        if (op.op === 'set') user[op.path[0]] = op.value
        else delete user[op.path[0]]
      }
      return true
    },
  }
  const original = { ...user }
  const keys = { xiaomi: '', doubao: '', breeze: '' }
  await saveSettingsDraft(scope, resolveTtsSettings({ ...user, voiceInputCompatibility: false }), { voiceInputCompatibility: { kind: 'set' } }, keys)
  assert.deepEqual(user, { ...original, voiceInputCompatibility: false })
  await saveSettingsDraft(scope, resolveTtsSettings(user), { voiceInputCompatibility: { kind: 'clear' } }, keys)
  assert.deepEqual(user, original)
  assert.equal(resolveTtsSettings(user).voiceInputCompatibility, true)
})

test('requesting, recording and transcribing block audio until success, cancellation or feedback', t => {
  const dom = voiceDocument(t)
  const activity = new VoiceInputActivity(dom.document)
  let claims = 0
  const focus = new PluginAudioFocus({ canPlay: () => true, claim: () => claims++, subscribe: () => () => {} }, activity)
  const permissions = []
  const off = focus.subscribe(() => permissions.push(focus.canPlay()))
  // A disabled adapter does not observe or block even if the official plugin is active.
  dom.change(['recording'])
  assert.equal(focus.canPlay(), true)
  activity.configure(true)
  assert.equal(focus.canPlay(), false, 'enabling during recording must stop playback immediately')
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

test('all visible composers participate and disable/unload releases observation without overriding other audio gates', t => {
  const dom = voiceDocument(t, ['feedback', 'recording'])
  const activity = new VoiceInputActivity(dom.document)
  let owner = true
  const focus = new PluginAudioFocus({ canPlay: () => owner, claim: () => {}, subscribe: () => () => {} }, activity)
  activity.configure(true)
  activity.configure(true)
  assert.equal(focus.canPlay(), false)
  dom.change(['feedback', 'transcribing'])
  assert.equal(focus.canPlay(), false)
  const oldObserver = dom.observers[0]
  activity.configure(false)
  assert.equal(oldObserver.connected, false)
  assert.equal(focus.canPlay(), true)
  oldObserver.callback([{ type: 'attributes' }])
  assert.equal(focus.canPlay(), true)
  activity.configure(true)
  assert.equal(focus.canPlay(), false)
  owner = false
  dom.change([], 'remove')
  assert.equal(focus.canPlay(), false, 'voice input ending must not steal audio from another tab')
  activity.dispose()
  assert.ok(dom.observers.every(observer => !observer.connected))
})

test('voice input interrupts a pending synthesis, rejects late audio and does not resume the interrupted turn', async t => {
  const dom = voiceDocument(t)
  const activity = new VoiceInputActivity(dom.document)
  const focus = new PluginAudioFocus({ canPlay: () => true, claim: () => {}, subscribe: () => () => {} }, activity)
  activity.configure(true)
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
  activity.configure(true)
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
