import assert from 'node:assert/strict'
import test from 'node:test'
import { installSettingsSectionCompat, resolveSettingsNamespace } from '../lib/settings-compat.js'

const schema = () => ({ enabled: true })
const entry = { enabled: false }
const hooks = {
  setSource() {},
  onChange() {},
}

test('uses the legacy module-level settings helpers when available', () => {
  const ctx = {
    inject() {
      assert.fail('legacy settings must not inject the modern provider')
    },
  }
  let received
  const api = {
    settingsNamespace(value) {
      return `legacy:${value}`
    },
    installSettingsSection(...args) {
      received = args
    },
  }

  assert.equal(resolveSettingsNamespace(api, 'xiaomi-mimo-tts'), 'legacy:xiaomi-mimo-tts')
  installSettingsSectionCompat(api, ctx, 'legacy:xiaomi-mimo-tts', schema, entry, hooks)
  assert.deepEqual(received, [ctx, 'legacy:xiaomi-mimo-tts', schema, entry, hooks])
})

test('delegates modern settings lifecycle handling to provider.installSection', () => {
  let received
  const provider = {
    installSection(...args) {
      received = args
    },
  }
  const ctx = {
    inject(dependencies, callback) {
      assert.deepEqual(dependencies, ['settings'])
      callback({ get: (name) => name === 'settings' ? provider : undefined })
    },
  }

  assert.equal(resolveSettingsNamespace({}, 'xiaomi-mimo-tts'), 'xiaomi-mimo-tts')
  installSettingsSectionCompat({}, ctx, 'xiaomi-mimo-tts', schema, entry, hooks)
  assert.deepEqual(received, [ctx, 'xiaomi-mimo-tts', schema, entry, hooks])
})

test('fails loudly when neither supported settings API is present', () => {
  const ctx = {
    inject(_dependencies, callback) {
      callback({ get: () => ({}) })
    },
  }

  assert.throws(
    () => installSettingsSectionCompat({}, ctx, 'xiaomi-mimo-tts', schema, entry, hooks),
    /Unsupported DSH settings API/,
  )
})
