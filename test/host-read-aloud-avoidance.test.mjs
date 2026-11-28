import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TTS_SETTINGS, resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { HostReadAloudActivity } = await loadClientModule('src/client/host-read-aloud-activity.ts')
const { PluginAudioFocus } = await loadClientModule('src/client/plugin-activity.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

function readAloudDocument(t, initial = []) {
  let phases = initial
  const observers = []
  const original = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver')
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'MutationObserver', original)
    else delete globalThis.MutationObserver
  })
  Object.defineProperty(globalThis, 'MutationObserver', {
    value: class {
      connected = false
      constructor(callback) { this.callback = callback; observers.push(this) }
      observe() { this.connected = true }
      disconnect() { this.connected = false }
    },
    configurable: true,
  })
  const document = {
    querySelector(selector) {
      const accepted = [...selector.matchAll(/\[data-read-aloud="([^"]+)"\]/gu)].map(match => match[1])
      return phases.some(phase => accepted.includes(phase)) ? {} : null
    },
  }
  return {
    document,
    observers,
    change(next, type = 'attributes') {
      phases = next
      const marker = { nodeType: 1, matches: () => true }
      const record = type === 'attributes'
        ? { type }
        : { type: 'childList', addedNodes: type === 'insert' ? [marker] : [], removedNodes: type === 'remove' ? [marker] : [] }
      for (const observer of observers) if (observer.connected) observer.callback([record])
    },
  }
}

test('avoidHostReadAloud defaults to true and saves independently', async () => {
  assert.equal(DEFAULT_TTS_SETTINGS.avoidHostReadAloud, true)
  assert.equal(resolveTtsSettings().avoidHostReadAloud, true)
  assert.equal(resolveTtsSettings({ avoidHostReadAloud: false }).avoidHostReadAloud, false)

  const user = {}
  const scope = {
    getSnapshot: () => ({ value: user, user }),
    async mutate(ops) {
      for (const op of ops) {
        if (op.op === 'set') user[op.path[0]] = op.value
        else delete user[op.path[0]]
      }
      return true
    },
  }
  const keys = { xiaomi: '', doubao: '', breeze: '' }
  await saveSettingsDraft(scope, resolveTtsSettings({ avoidHostReadAloud: false }), { avoidHostReadAloud: { kind: 'set' } }, keys)
  assert.deepEqual(user, { avoidHostReadAloud: false })
  await saveSettingsDraft(scope, resolveTtsSettings(), { avoidHostReadAloud: { kind: 'clear' } }, keys)
  assert.deepEqual(user, {})
})

test('HostReadAloudActivity yields plugin audio focus when enabled and releases immediately when disabled or idle', t => {
  const dom = readAloudDocument(t, ['loading'])
  const activity = new HostReadAloudActivity(dom.document)
  let claims = 0
  const focus = new PluginAudioFocus({ canPlay: () => true, claim: () => claims++, subscribe: () => () => {} }, activity)
  const transitions = []
  const off = focus.subscribe(() => transitions.push(focus.canPlay()))

  assert.equal(focus.canPlay(), true, 'disabled activity must not block playback')
  activity.setEnabled(true)
  assert.equal(focus.canPlay(), false, 'active host read-aloud must block playback immediately')
  dom.change(['playing'])
  focus.claim()
  assert.equal(claims, 0)
  assert.equal(focus.canPlay(), false)
  assert.deepEqual(transitions, [false])

  dom.change(['idle'])
  assert.equal(focus.canPlay(), true)

  dom.change(['playing'], 'insert')
  assert.equal(focus.canPlay(), false)

  activity.setEnabled(false)
  assert.equal(focus.canPlay(), true, 'disabling avoidance must release focus even while host reads')
  assert.equal(dom.observers.every(observer => !observer.connected), true)

  activity.setEnabled(true)
  assert.equal(focus.canPlay(), false)
  dom.change([], 'remove')
  assert.equal(focus.canPlay(), true)

  off()
  activity.dispose()
})
