import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { installTaskSoundWatcher } = await loadClientModule('src/client/sound-effects/task-watcher.ts')
const { automaticAssistantMessageId } = await loadClientModule('src/client/conversation/message-text.ts')
const { AutomaticReading } = await loadClientModule('src/client/conversation/automatic-reading.ts')

function store(value) {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of [...listeners]) fn() }, listeners }
}
function chat(turn = 1, reason = 'completed', extra = []) {
  const location = { turn, status: reason ? 'closed' : 'open', start: { time: turn * 100 },
    end: reason ? { seq: turn * 10, data: { reason: { kind: reason } } } : undefined }
  const message = { kind: 'assistant', turn, messageId: `message-${turn}`, blocks: [{ kind: 'text', text: 'Answer' }] }
  return { timeline: { turnOrder: [turn], turns: new Map([[turn, location]]) },
    legacy: { nodes: [...extra, message], partial: null }, nodes: new Map(), locations: { getTurn: () => [] } }
}
function fixture({ running = false, initialChat = chat(), available = true } = {}) {
  const session = store({ running, openState: 'open', pendingSubmissions: [], lastAgentError: 'Historical failure' })
  const target = store(initialChat)
  const list = store({ phase: 'ready', byId: { main: { id: 'main', retainedBy: { mainView: 1 } } } })
  const played = []
  let enabled = true
  const ctx = { sessions: { list, binding: () => available ? { session } : undefined },
    uiConversation: { binding: () => ({ target: () => target }) } }
  const off = installTaskSoundWatcher(ctx, { play: cue => played.push(cue) }, () => ({ enabled, taskSounds: true }))
  const update = (running, pendingSubmissions = []) => session.set({ ...session.getSnapshot(), running, pendingSubmissions })
  return { session, target, list, played, off, update, enable: value => { enabled = value }, available: value => { available = value } }
}

test('task sounds follow this turn, ignoring historical errors, retries and history pagination', () => {
  const f = fixture()
  try {
    f.update(true)
    f.target.set(chat(2, null))
    f.target.set({ ...chat(2, null), legacy: { nodes: [{ kind: 'model-retry', turn: 2, step: 1, attempt: 2 }] } })
    assert.deepEqual(f.played, ['start'])
    f.update(false)
    assert.deepEqual(f.played, ['start'], 'wait for the durable outcome instead of guessing from running=false')
    f.target.set(chat(2))
    f.target.set({ ...chat(2), legacy: { nodes: [{ kind: 'turn-error', turn: 1 }] } })
    assert.deepEqual(f.played, ['start', 'complete'])
  } finally { f.off() }
  assert.equal(f.session.listeners.size, 0)
  assert.equal(f.target.listeners.size, 0)
  assert.equal(f.list.listeners.size, 0)
})

for (const [reason, cue] of [['completed', 'complete'], ['error', 'error'], ['aborted', 'stop'], ['blocked', 'error'], ['max-tokens', 'error'], ['interrupted', 'stop']]) {
  test(`task ${reason} emits ${cue} once even when chat closes before session activity`, () => {
    const f = fixture()
    try {
      f.update(true)
      f.target.set(chat(2, null))
      f.target.set(chat(2, reason))
      assert.deepEqual(f.played, ['start'])
      f.update(false)
      f.update(false)
      assert.deepEqual(f.played, ['start', cue])
    } finally { f.off() }
  })
}

test('opening finished history, switching conversations and disabled sounds never replay old outcomes', () => {
  const f = fixture()
  f.target.set(chat(3, 'error'))
  assert.deepEqual(f.played, [])
  f.enable(false)
  f.update(true)
  f.target.set(chat(4, null))
  f.update(false)
  f.target.set(chat(4))
  f.enable(true)
  f.update(false)
  assert.deepEqual(f.played, [])
  f.update(true)
  f.target.set(chat(5, null))
  f.list.set({ phase: 'ready', byId: {} })
  f.update(false)
  f.target.set(chat(5))
  assert.deepEqual(f.played, ['start'])
  f.off()
})

test('a delayed session binding is retried and cancellation removes the retry', async () => {
  const f = fixture({ available: false })
  try {
    f.available(true)
    await new Promise(resolve => setTimeout(resolve, 230))
    f.update(true)
    assert.deepEqual(f.played, ['start'])
  } finally { f.off() }
  const stopped = fixture({ available: false })
  stopped.off()
  stopped.available(true)
  await new Promise(resolve => setTimeout(resolve, 230))
  assert.equal(stopped.session.listeners.size, 0)
})

test('only queue and steering echoes emit queued sounds', () => {
  const f = fixture()
  try {
    f.update(false, [{ placement: 'transcript' }])
    assert.deepEqual(f.played, [])
    f.update(false, [{ placement: 'queued' }, { placement: 'steering' }])
    f.update(false, [{ placement: 'queued' }])
    assert.deepEqual(f.played, ['queued'])
  } finally { f.off() }
})

test('automatic reading waits for a successful current turn and never falls back to an older reply', () => {
  const old = { kind: 'assistant', turn: 1, messageId: 'old-answer' }
  for (const reason of [null, 'error', 'aborted', 'interrupted', 'max-tokens']) {
    for (const mode of ['all', 'final']) assert.equal(automaticAssistantMessageId(chat(2, reason, [old]), mode), null)
  }
  const current = chat(2, 'completed', [old])
  assert.equal(automaticAssistantMessageId(current, 'all'), 'message-2')
  current.legacy.nodes = [old]
  assert.equal(automaticAssistantMessageId(current, 'all'), null)
  current.legacy.nodes = [{ kind: 'assistant', turn: 2, messageId: 'partial', interrupted: true }]
  assert.equal(automaticAssistantMessageId(current, 'all'), null)
  current.legacy.nodes = [old, { kind: 'assistant', turn: 2, messageId: 'recovered' }]
  assert.equal(automaticAssistantMessageId(current, 'all'), 'recovered')
})

test('settling an unsuccessful turn stops automatic audio once and leaves a later manual reading alone', () => {
  const reading = new AutomaticReading()
  let stops = 0
  reading.observe('main', true)
  reading.markAutomatic()
  reading.observe('main', false)
  reading.stopAutomatic(() => stops++)
  assert.equal(stops, 1)
  assert.equal(reading.isAutomatic(), false)
  reading.markManual()
  reading.stopAutomatic(() => stops++)
  assert.equal(stops, 1, 'a manual replay of an interrupted answer must not be canceled by its old turn outcome')
})
