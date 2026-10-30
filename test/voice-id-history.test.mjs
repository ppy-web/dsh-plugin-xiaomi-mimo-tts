import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { readVoiceIdHistory, readVoiceIdNames, rememberVoiceId, writeVoiceIdHistory, writeVoiceIdNames } = await loadClientModule('src/client/settings/voice-id-history.ts')

test('voice ID history retains the ten most recent unique nonempty IDs', () => {
  let history = []
  for (let index = 0; index < 12; index++) history = rememberVoiceId(history, `voice-${index}`)
  assert.deepEqual(history, Array.from({ length: 10 }, (_, index) => `voice-${11 - index}`))
  history = rememberVoiceId(history, ' voice-5 ')
  assert.equal(history[0], 'voice-5')
  assert.equal(history.length, 10)
  assert.equal(history.filter(value => value === 'voice-5').length, 1)
  assert.deepEqual(rememberVoiceId(history, '  '), history)
})

for (const kind of ['standard', 'cloned']) test(`${kind} voice history persists and tolerates unavailable or malformed storage`, () => {
  let stored
  const storage = { getItem: () => stored ?? null, setItem: (_key, value) => { stored = value } }
  writeVoiceIdHistory(kind, ['second', 'first'], storage)
  assert.deepEqual(readVoiceIdHistory(kind, storage), ['second', 'first'])
  stored = '[null, " first ", "first", 3, "", "second"]'
  assert.deepEqual(readVoiceIdHistory(kind, storage), ['first', 'second'])
  for (const value of ['{', '{}', 'null']) {
    stored = value
    assert.deepEqual(readVoiceIdHistory(kind, storage), [])
  }
  const unavailable = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') } }
  assert.deepEqual(readVoiceIdHistory(kind, unavailable), [])
  assert.doesNotThrow(() => writeVoiceIdHistory(kind, ['first'], unavailable))
})

test('standard and cloned histories stay separate and existing cloned IDs are preserved', () => {
  const stored = new Map([['dsh-xiaomi-mimo-tts:cloned-voice-history', '["saved-clone"]']])
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
  assert.deepEqual(readVoiceIdHistory('cloned', storage), ['saved-clone'])
  assert.deepEqual(readVoiceIdHistory('standard', storage), [])
  writeVoiceIdHistory('standard', ['standard-one', 'standard-two'], storage)
  assert.deepEqual(readVoiceIdHistory('cloned', storage), ['saved-clone'])
  writeVoiceIdHistory('cloned', ['new-clone', 'saved-clone'], storage)
  assert.deepEqual(readVoiceIdHistory('standard', storage), ['standard-one', 'standard-two'])
  assert.deepEqual(readVoiceIdHistory('cloned', storage), ['new-clone', 'saved-clone'])
})

test('voice labels persist by ID and model without changing the saved ID history', () => {
  const stored = new Map()
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
  writeVoiceIdHistory('standard', ['same-id'], storage)
  writeVoiceIdHistory('cloned', ['same-id'], storage)
  writeVoiceIdNames('standard', { 'same-id': 'Standard label' }, storage)
  writeVoiceIdNames('cloned', { 'same-id': 'Cloned label' }, storage)
  assert.deepEqual(readVoiceIdNames('standard', storage), { 'same-id': 'Standard label' })
  assert.deepEqual(readVoiceIdNames('cloned', storage), { 'same-id': 'Cloned label' })
  assert.deepEqual(readVoiceIdHistory('standard', storage), ['same-id'])
  assert.deepEqual(readVoiceIdHistory('cloned', storage), ['same-id'])
  writeVoiceIdNames('cloned', { 'same-id': '  ' }, storage)
  assert.deepEqual(readVoiceIdNames('cloned', storage), {})
  assert.deepEqual(readVoiceIdHistory('cloned', storage), ['same-id'])
  assert.deepEqual(readVoiceIdNames('standard', storage), { 'same-id': 'Standard label' })
})

for (const kind of ['standard', 'cloned']) test(`${kind} labels tolerate invalid or unavailable storage`, () => {
  for (const value of ['{', 'null', '[]', '42']) {
    assert.deepEqual(readVoiceIdNames(kind, { getItem: () => value }), {})
  }
  assert.deepEqual(readVoiceIdNames(kind, { getItem: () => '{" id ":" name ","empty":" ","invalid":false}' }), { id: 'name' })
  const unavailable = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('full') } }
  assert.deepEqual(readVoiceIdNames(kind, unavailable), {})
  assert.doesNotThrow(() => writeVoiceIdNames(kind, { id: 'name' }, unavailable))
})
