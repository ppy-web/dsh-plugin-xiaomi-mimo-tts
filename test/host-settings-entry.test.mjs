import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { observeHostSettingsEntry } = await loadClientModule('src/client/settings/host-settings-entry.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

function host(initial, status = 'ready') {
  let snapshot = { value: initial, status }
  const listeners = new Set()
  const entries = new Set()
  const scope = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
  const update = (value, status = 'ready') => {
    snapshot = { value, status }
    for (const listener of listeners) listener()
  }
  const register = id => () => {
    assert.equal(entries.has(id), false, 'an existing entry must not be registered twice')
    entries.add(id)
    return () => { assert.ok(entries.delete(id), 'an entry must only be withdrawn once') }
  }
  return { scope, listeners, entries, update, register }
}

test('the default Host settings shortcut and icon follow saved visibility without affecting playback settings', () => {
  const h = host(undefined)
  const offSection = observeHostSettingsEntry(h.scope, h.register('section'))
  const offIcon = observeHostSettingsEntry(h.scope, h.register('icon'))
  assert.deepEqual([...h.entries], ['section', 'icon'])
  h.update({ showInSidebar: false, enabled: false })
  assert.equal(h.entries.size, 2, 'audio and sidebar preferences must not hide Host settings')
  h.update({ showInHostSettings: false, enabled: true, autoPlay: true })
  assert.equal(h.entries.size, 0)
  h.update({ showInHostSettings: false, voiceVolume: 0.5 })
  assert.equal(h.entries.size, 0)
  h.update({ showInHostSettings: true })
  assert.deepEqual([...h.entries], ['section', 'icon'])
  h.update({ showInHostSettings: true })
  offSection(); offIcon()
  offSection(); offIcon()
  assert.equal(h.entries.size, 0)
  assert.equal(h.listeners.size, 0)
})

test('entries wait for ready settings, recover after reconnect, and release subscriptions if registration fails', () => {
  const h = host(undefined, 'loading')
  const dispose = observeHostSettingsEntry(h.scope, h.register('section'))
  assert.equal(h.entries.size, 0)
  h.update(undefined)
  assert.ok(h.entries.has('section'))
  h.update(undefined, 'unavailable')
  assert.equal(h.entries.size, 0)
  h.update({ showInHostSettings: false })
  assert.equal(h.entries.size, 0)
  h.update(undefined)
  assert.ok(h.entries.has('section'))
  dispose()
  assert.equal(h.listeners.size, 0)
  const failure = new Error('registration-failed')
  assert.throws(() => observeHostSettingsEntry(h.scope, () => { throw failure }), failure)
  assert.equal(h.listeners.size, 0)
})

test('Host settings visibility defaults on and persists independently from voice input and sidebar visibility', async () => {
  assert.equal(resolveTtsSettings().showInHostSettings, true)
  const user = { voiceInputCompatibility: false, showInSidebar: true, autoPlay: true }
  const original = { ...user }
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
  await saveSettingsDraft(scope, resolveTtsSettings({ ...user, showInHostSettings: false }), { showInHostSettings: { kind: 'set' } }, keys)
  assert.deepEqual(user, { ...original, showInHostSettings: false })
  assert.equal(resolveTtsSettings(user).showInHostSettings, false)
  await saveSettingsDraft(scope, resolveTtsSettings(user), { showInHostSettings: { kind: 'clear' } }, keys)
  assert.deepEqual(user, original)
  assert.equal(resolveTtsSettings(user).showInHostSettings, true)
})
