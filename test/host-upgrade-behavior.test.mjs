import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'

const { PluginAudioFocus, observePluginActivity } = await loadClientModule('src/client/plugin-activity.ts')
const { AutomaticReading } = await loadClientModule('src/client/conversation/automatic-reading.ts')
const { finalAssistantMessageId } = await loadClientModule('src/client/conversation/message-text.ts')
const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')
const { HistoryReplay } = await loadClientModule('src/client/history/history-replay.ts')
const { zh, en, ja, fr } = await loadClientModule('src/client/localization.ts')

function source(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    set(next) { value = next; for (const listener of listeners) listener() },
    get count() { return listeners.size },
  }
}

test('bundle activity stops once, blocks new audio, refreshes on settlement and releases subscriptions', () => {
  const changes = source(false)
  const ownership = source(true)
  let claims = 0
  const focus = new PluginAudioFocus({ ...ownership, canPlay: ownership.getSnapshot, claim: () => claims++ }, changes)
  const transitions = []
  const offActivity = observePluginActivity(changes, () => transitions.push('stop'), () => transitions.push('refresh'))
  let notifications = 0
  const offFocus = focus.subscribe(() => notifications++)
  assert.equal(focus.canPlay(), true)
  focus.claim()
  changes.set(true)
  assert.equal(notifications, 1)
  focus.claim()
  changes.set(true)
  assert.equal(notifications, 1, 'unrelated manager refreshes must not reset automatic playback')
  assert.equal(focus.canPlay(), false)
  assert.equal(claims, 1)
  assert.deepEqual(transitions, ['stop'])
  changes.set(false)
  assert.equal(focus.canPlay(), true)
  assert.deepEqual(transitions, ['stop', 'refresh'])
  ownership.set(false)
  assert.equal(focus.canPlay(), false)
  assert.ok(notifications > 0)
  offFocus()
  offActivity()
  assert.equal(changes.count, 0)
  assert.equal(ownership.count, 0)
  const offInitial = observePluginActivity(source(true), () => transitions.push('initial-stop'), () => assert.fail())
  assert.equal(transitions.at(-1), 'initial-stop')
  offInitial()
})

test('host reply preference cancels automatic speech without replaying the active turn; the next turn is armed', () => {
  const policy = new AutomaticReading()
  let stopped = 0
  let resets = 0
  const stop = () => stopped++
  const reset = () => resets++
  policy.observe('session', true)
  policy.markAutomatic()
  policy.update('final', stop, reset)
  assert.equal(policy.getSnapshot(), 'final')
  assert.equal(stopped, 1)
  assert.equal(policy.allowed('session'), false)
  policy.observe('session', true)
  policy.observe('session', false)
  assert.equal(policy.allowed('session'), false)
  policy.observe('session', true)
  assert.equal(policy.allowed('session'), true)
  policy.markManual()
  policy.update('all', stop, reset)
  assert.equal(stopped, 1, 'changing a display preference must not stop a manual reading')
  assert.equal(resets, 2)
  policy.update('all', stop, reset)
  assert.equal(resets, 2)
  policy.release('session')
  assert.equal(policy.allowed('session'), true)
})

test('final-only selection follows the host closing reply and waits for a settled turn', () => {
  const rows = new Map([
    ['process', { kind: 'assistant-step', data: { finalNode: { messageId: 'process' } } }],
    ['tail', { kind: 'turn-tail', data: { closing: { finalNode: { messageId: 'answer' } } } }],
  ])
  const chat = { timeline: { turnOrder: [1, 2] }, nodes: rows, locations: { getTurn: turn => turn === 2 ? ['process', 'tail'] : [] } }
  assert.equal(finalAssistantMessageId(chat), 'answer')
  rows.delete('tail')
  assert.equal(finalAssistantMessageId(chat), null)
  rows.set('tail', { kind: 'turn-tail', data: { closing: null } })
  assert.equal(finalAssistantMessageId(chat), null)
  rows.set('tail', { kind: 'turn-tail', data: { closing: { finalNode: {} } } })
  assert.equal(finalAssistantMessageId(chat), null, 'interrupted partials must not address a durable message')
})

test('activation browser preview never falls back to a cloud request and disposal stops its utterance', async () => {
  await withBrowserPlayback(async state => {
    const views = []
    const player = new PreviewPlayer(view => views.push(view))
    try {
      const pending = player.playBrowserPreview('A short browser preview.', { localVoiceURI: '', voiceVolume: 0.4, voiceRate: 1.2 })
      const utterance = state.utterances.at(-1)
      assert.ok(utterance)
      assert.equal(utterance.volume, 0.4)
      utterance.onstart()
      assert.equal(views.at(-1).status, 'playing')
      utterance.onerror({ error: 'not-allowed' })
      await pending
      assert.equal(views.at(-1).error, 'autoplay-blocked')
      assert.equal(state.requests.length, 0)
      const next = player.playBrowserPreview('Try again.', { localVoiceURI: '', voiceVolume: 1, voiceRate: 1 })
      await player.dispose()
      await next
      assert.ok(state.cancelled > 0)
      assert.equal(views.at(-1).status, 'idle')
      window.speechSynthesis.getVoices = () => []
      await player.playBrowserPreview('No voices.', { localVoiceURI: '', voiceVolume: 1, voiceRate: 1 })
      assert.equal(views.at(-1).error, 'local-voice-unavailable')
      assert.equal(state.requests.length, 0)
    } finally { await player.dispose() }
    await settle()
  }, { fetch: () => assert.fail('activation preview must not contact a provider') })
})

test('Japanese and French dictionaries cover every UI key and preserve interpolation parameters', () => {
  for (const dictionary of [en, ja, fr]) {
    assert.deepEqual(Object.keys(dictionary).sort(), Object.keys(zh).sort())
    for (const [key, value] of Object.entries(dictionary)) {
      assert.ok(value.trim(), `${key}: empty translation`)
      assert.deepEqual([...value.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), [...zh[key].matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort(), `${key}: missing placeholder`)
    }
  }
})

test('history refuses a late playback attempt after the bundle loses audio permission', async () => {
  await withBrowserPlayback(async state => {
    const replay = new HistoryReplay({}, () => false)
    try {
      await replay.play({ id: 'recording', blob: new Blob(['audio']), voiceRateApplied: true })
      assert.equal(replay.getSnapshot().status, 'idle')
      assert.equal(state.media.length, 0)
      assert.equal(state.created.length, 0)
    } finally { replay.dispose() }
  })
})
