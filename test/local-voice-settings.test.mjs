import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_MOSS_BASE_URL, DEFAULT_TTS_SETTINGS, resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

function form(initial = {}) {
  const user = { ...initial }
  const writes = []
  return {
    user,
    writes,
    getSnapshot: () => ({ user, value: resolveTtsSettings(user) }),
    async mutate(ops) {
      writes.push(ops)
      for (const op of ops) {
        if (op.op === 'set') user[op.path[0]] = op.value
        else delete user[op.path[0]]
      }
      return true
    },
  }
}

test('local voice engine defaults to the browser and normalizes the MOSS address', () => {
  const defaults = resolveTtsSettings({})
  assert.equal(defaults.localVoiceEngine, 'browser')
  assert.equal(defaults.mossEnabled, false)
  assert.equal(defaults.mossBaseURL, DEFAULT_MOSS_BASE_URL)
  assert.equal(defaults.mossVoice, '')

  const moss = resolveTtsSettings({ mossEnabled: true, localVoiceEngine: 'moss', mossBaseURL: '  http://127.0.0.1:18084/  ', mossVoice: 'demo-2', mossVoiceName: '深夜温柔' })
  assert.equal(moss.localVoiceEngine, 'moss')
  assert.equal(moss.mossBaseURL, 'http://127.0.0.1:18084')
  assert.equal(moss.mossVoice, 'demo-2')
  assert.equal(moss.mossVoiceName, '深夜温柔')

  const invalid = resolveTtsSettings({ localVoiceEngine: 'other', mossBaseURL: '   ' })
  assert.equal(invalid.localVoiceEngine, 'browser')
  assert.equal(invalid.mossBaseURL, DEFAULT_MOSS_BASE_URL)
})

test('MOSS local voice fields save independently from the browser voice', async () => {
  const scope = form({ localVoiceURI: 'Microsoft Huihui', localVoiceEngine: 'browser' })
  const draft = resolveTtsSettings({
    ...scope.user,
    mossEnabled: true,
    localVoiceEngine: 'moss',
    mossBaseURL: 'http://127.0.0.1:18084',
    mossVoice: 'demo-2',
    mossVoiceName: '深夜温柔晚安',
  })
  await saveSettingsDraft(scope, draft, {
    mossEnabled: { kind: 'set' },
    localVoiceEngine: { kind: 'set' },
    mossBaseURL: { kind: 'set' },
    mossVoice: { kind: 'set' },
    mossVoiceName: { kind: 'set' },
  }, { xiaomi: '', doubao: '' })
  assert.equal(scope.writes.length, 1)
  assert.equal(scope.user.localVoiceEngine, 'moss')
  assert.equal(scope.user.mossBaseURL, 'http://127.0.0.1:18084')
  assert.equal(scope.user.mossVoice, 'demo-2')
  assert.equal(scope.user.mossVoiceName, '深夜温柔晚安')
  assert.equal(scope.user.localVoiceURI, 'Microsoft Huihui')

  await saveSettingsDraft(scope, resolveTtsSettings({ ...scope.user, localVoiceEngine: 'browser' }), { localVoiceEngine: { kind: 'set' } }, { xiaomi: '', doubao: '' })
  assert.equal(scope.user.localVoiceEngine, 'browser')
  assert.equal(scope.user.mossVoice, 'demo-2')
})

test('default MOSS fields are not written unless changed', async () => {
  const scope = form()
  await saveSettingsDraft(scope, resolveTtsSettings(scope.user), { mossBaseURL: { kind: 'set' } }, { xiaomi: '', doubao: '' })
  assert.deepEqual(scope.writes, [])
})

test('disabling MOSS selects browser speech without losing the local service configuration', async () => {
  const scope = form({ mossEnabled: true, localVoiceEngine: 'moss', localVoiceURI: 'browser-voice', mossBaseURL: 'http://127.0.0.1:18084', mossVoice: 'demo-2', mossVoiceName: 'Saved voice' })
  const disabled = resolveTtsSettings({ ...scope.user, mossEnabled: false })
  assert.equal(disabled.localVoiceEngine, 'browser')
  await saveSettingsDraft(scope, disabled, { mossEnabled: { kind: 'set' }, localVoiceEngine: { kind: 'set' } }, { xiaomi: '', doubao: '', breeze: '' })
  assert.equal(scope.user.mossEnabled, false)
  assert.equal(resolveTtsSettings(scope.user).localVoiceEngine, 'browser')
  assert.equal(scope.user.localVoiceURI, 'browser-voice')
  assert.equal(scope.user.mossBaseURL, 'http://127.0.0.1:18084')
  assert.equal(scope.user.mossVoice, 'demo-2')
  assert.equal(scope.user.mossVoiceName, 'Saved voice')

  await saveSettingsDraft(scope, resolveTtsSettings({ ...scope.user, mossEnabled: true }), { mossEnabled: { kind: 'set' } }, { xiaomi: '', doubao: '', breeze: '' })
  assert.equal(scope.user.mossEnabled, true)
  await saveSettingsDraft(scope, resolveTtsSettings({ ...scope.user, mossEnabled: false }), { mossEnabled: { kind: 'clear' } }, { xiaomi: '', doubao: '', breeze: '' })
  assert.equal(Object.hasOwn(scope.user, 'mossEnabled'), false)
  assert.equal(resolveTtsSettings(scope.user).mossEnabled, false)
})
