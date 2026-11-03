import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Config } from '../lib/passport.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { DEFAULT_PASSPORT_SETTINGS, PASSPORT_NUMBER_FIELDS, isPassportLanAddress } = await loadClientModule('src/types/passport.ts')
const { savePassportDraft, validatePassportDraft } = await loadClientModule('src/client/settings/passport-draft.ts')
const { PassportSettingsPage } = await loadClientModule('src/client/settings/passport-settings.tsx')
const { registerPassportSettings } = await loadClientModule('src/client/settings/passport-registration.ts')
const configured = () => ({ ...DEFAULT_PASSPORT_SETTINGS, accessToken: 'test-passport-private-token-123456789' })

test('Passport form defaults match the Host configuration contract', () => {
  const host = Config({})
  for (const [field, value] of Object.entries(DEFAULT_PASSPORT_SETTINGS)) assert.deepEqual(host[field].get(), value, field)
})

test('Passport validation rejects unusable credentials, device identities and numeric limits', () => {
  assert.equal(validatePassportDraft(configured()), null)
  assert.equal(validatePassportDraft({ ...configured(), accessToken: '0042' }), null)
  for (const [field, value] of [
    ['host', ''], ['host', 'ws://192.168.1.10'], ['accessToken', 'short'],
    ['accessToken', 'a'.repeat(24) + '\n'], ['accessToken', 'a'.repeat(193)], ['accessToken', 'a'.repeat(24) + ' '], ['deviceId', '../other-device'], ['port', 3101.5],
    ['accessToken', '123'], ['accessToken', '12a4'], ['accessToken', '12345'],
  ]) assert.equal(validatePassportDraft({ ...configured(), [field]: value }), field)
  for (const [field, { min, max }] of Object.entries(PASSPORT_NUMBER_FIELDS)) {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, min - 1, max + 1]) {
      assert.equal(validatePassportDraft({ ...configured(), [field]: value }), field)
    }
  }
  assert.equal(validatePassportDraft({ ...configured(), deviceId: 'bean_001122aabbcc', cwd: 'C:/A directory/工作区' }), null)
})

test('short pairing admits private or loopback peers and excludes public or malformed addresses', () => {
  for (const address of ['192.168.1.2', '10.0.0.2', '172.16.1.2', '172.31.1.2', '127.0.0.1', '::1', '::ffff:192.168.1.2']) assert.equal(isPassportLanAddress(address), true)
  for (const address of ['198.51.100.1', '172.32.0.1', '192.168.999.1', '192.168.1', '0.0.0.0', '2001:db8::1', '']) assert.equal(isPassportLanAddress(address), false)
})

test('Passport saves only its edited settings in one revision-fenced mutation', async () => {
  const base = configured(), writes = []
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 7 }), async mutate(ops, revision) { writes.push({ ops, revision }); return true } }
  const value = { ...base, host: '192.168.1.10', silenceMs: 900, unrelated: 'must not be written' }
  await savePassportDraft(scope, base, value, 7)
  assert.deepEqual(writes, [{ revision: 7, ops: [
    { op: 'set', path: ['host'], value: '192.168.1.10' },
    { op: 'set', path: ['silenceMs'], value: 900 },
  ] }])
  await savePassportDraft(scope, base, base, 7)
  assert.equal(writes.length, 1, 'unchanged settings must not overwrite the Host')
})

test('Passport refuses stale, read-only, unavailable and invalid writes and reports rejection', async () => {
  const base = configured(), value = { ...base, port: 3102 }
  for (const snapshot of [
    { status: 'ready', writable: false, revision: 7 },
    { status: 'ready', writable: true, revision: 8 },
    { status: 'unavailable', writable: true, revision: 7 },
  ]) await assert.rejects(savePassportDraft({ getSnapshot: () => snapshot, mutate: () => assert.fail('must not write') }, base, value, 7), { message: 'passport-settings-conflict' })
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 7 }), mutate: () => assert.fail('invalid credentials must not be written') }
  await assert.rejects(savePassportDraft(scope, base, { ...value, accessToken: 'bad' }, 7), { message: 'passport-draft-invalid' })
  await assert.rejects(savePassportDraft({ ...scope, mutate: async () => false }, base, value, 7), { message: 'passport-settings-save-failed' })
})

test('editing redacted Passport settings retains the saved token and permits an explicit replacement', async () => {
  const base = { ...DEFAULT_PASSPORT_SETTINGS }, writes = []
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 3 }), async mutate(ops) { writes.push(ops); return true } }
  const draft = { ...base, silenceMs: 900 }
  assert.equal(validatePassportDraft(draft, true), null)
  await savePassportDraft(scope, base, draft, 3, true)
  assert.deepEqual(writes[0], [{ op: 'set', path: ['silenceMs'], value: 900 }])
  await savePassportDraft(scope, base, { ...base, accessToken: configured().accessToken }, 3, true)
  assert.deepEqual(writes[1], [{ op: 'set', path: ['accessToken'], value: configured().accessToken }])
})

test('Passport configuration registration owns only its component and can be withdrawn', async () => {
  const ctx = new Context(), requested = [], registered = new Map()
  const scope = { getSnapshot() {}, subscribe() {} }
  ctx.provide('slots', { register(options, component) { registered.set(options.key, { options, component }); return () => registered.delete(options.key) } })
  ctx.provide('configForms', { get(namespace) { requested.push(namespace); return scope }, describe: () => ({ getSnapshot: () => ({ view: { namespaces: [] } }), subscribe: () => () => {} }) })
  try {
    const dispose = registerPassportSettings(ctx, key => key, { getSnapshot: () => false, subscribe: () => () => {} })
    const entry = registered.get('dsh-xiaomi-tts#speech-delivery-passport')
    assert.equal(entry.options.name, 'plugins.row.config')
    assert.equal(entry.options.inject().scope, scope)
    assert.deepEqual(requested, ['speech-delivery-passport'])
    dispose()
    assert.equal(registered.size, 0)
  } finally { await ctx.fiber.dispose() }
})

test('Passport fields expose labelled controls, mask the token and respect permissions and plugin changes', () => {
  for (const [writable, changing] of [[true, false], [false, false], [true, true]]) {
    const snapshot = { status: 'ready', value: configured(), writable, revision: 1 }
    const html = renderToStaticMarkup(createElement(PassportSettingsPage, {
      view: 'page', scope: { getSnapshot: () => snapshot, subscribe: () => () => {} }, t: key => key,
      changes: { getSnapshot: () => changing, subscribe: () => () => {} },
    }))
    const inputs = [...html.matchAll(/<input\b[^>]*>/gu)].map(([tag]) => tag)
    for (const field of Object.keys(DEFAULT_PASSPORT_SETTINGS)) {
      const input = inputs.find(tag => tag.includes(`name="${field}"`))
      assert.ok(input, `editable control for ${field}`)
      assert.equal(/\bdisabled=""/u.test(input), !writable || changing)
      const inputId = input.match(/\bid="([^"]+)"/u)?.[1]
      assert.ok(inputId && html.includes(`for="${inputId}"`), `${field} must have an associated label`)
      if (field === 'accessToken') assert.ok(input.includes('type="password"'))
    }
  }
})

test('a redacted saved Passport token remains write-only without blocking other configuration fields', () => {
  const snapshot = { status: 'ready', value: { ...DEFAULT_PASSPORT_SETTINGS, accessToken: undefined }, writable: true, revision: 1 }
  const html = renderToStaticMarkup(createElement(PassportSettingsPage, {
    view: 'page', scope: { getSnapshot: () => snapshot, subscribe: () => () => {} }, t: key => key,
    tokenConfigured: { getSnapshot: () => true, subscribe: () => () => {} },
  }))
  const input = [...html.matchAll(/<input\b[^>]*>/gu)].map(([tag]) => tag).find(tag => tag.includes('name="accessToken"'))
  assert.ok(input.includes('type="password"'))
  assert.ok(!/\brequired=""/u.test(input), 'the saved token need not be re-entered')
  assert.ok(!/\bdisabled=""/u.test(input))
})
