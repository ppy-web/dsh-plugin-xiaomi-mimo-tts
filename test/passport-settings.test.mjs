import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { readFileSync } from 'node:fs'
import * as yaml from 'js-yaml'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Config } from '../lib/passport.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { DEFAULT_PASSPORT_SETTINGS, PASSPORT_NUMBER_FIELDS, isPassportLanAddress } = await loadClientModule('src/types/passport.ts')
const { savePassportDraft, validatePassportDraft, refreshPassportSession, generatePassportPairingCode } = await loadClientModule('src/client/settings/passport-draft.ts')
const { PassportSettingsPage } = await loadClientModule('src/client/settings/passport-settings.tsx')
const { registerPassportSettings } = await loadClientModule('src/client/settings/passport-registration.ts')
const configured = () => ({ ...DEFAULT_PASSPORT_SETTINGS, accessToken: 'test-passport-private-token-123456789' })

test('pairing codes preserve leading zeros and reject the biased tail of the random range', t => {
  const samples = [0, 42, 59999, 60000, 65535, 1234]
  t.mock.method(crypto, 'getRandomValues', array => {
    assert.ok(samples.length, 'pairing must finish after an accepted sample')
    array[0] = samples.shift()
    return array
  })
  assert.equal(generatePassportPairingCode(), '0000')
  assert.equal(generatePassportPairingCode(), '0042')
  assert.equal(generatePassportPairingCode(), '9999')
  assert.equal(generatePassportPairingCode(), '1234')
})

test('Passport form defaults match the Host configuration contract', () => {
  const host = Config({})
  for (const [field, value] of Object.entries(DEFAULT_PASSPORT_SETTINGS)) assert.deepEqual(host[field].get(), value, field)
})

test('both Doubao recognition modes can be selected and persisted', async () => {
  for (const source of ['doubao', 'doubao-nostream']) {
    const base = configured(), value = { ...base, asrProvider: source }, writes = []
    assert.equal(Config({ asrProvider: source }).asrProvider.get(), source)
    assert.equal(validatePassportDraft(value), null)
    const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1 }), async mutate(ops) { writes.push(...ops); return true } }
    await savePassportDraft(scope, base, value, 1)
    assert.deepEqual(writes, [{ op: 'set', path: ['asrProvider'], value: source }])
  }
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

test('the bundle enables the connector so its own settings page survives the install restart', () => {
  const schema = new yaml.Schema([...yaml.JSON_SCHEMA.tags, yaml.defineScalarTag('tag:yaml.org,2002:js', { resolve: value => value })])
  const patch = yaml.load(readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), { schema })
  const entry = patch.flatMap(row => row.insert ?? []).find(item => item.id === 'speech-delivery-passport')
  assert.equal(entry?.name, 'dsh-xiaomi-tts/passport')
  assert.notEqual(entry.disabled, true)
})

test('Passport fields expose labelled controls, mask the token and respect permissions and plugin changes', () => {
  for (const [writable, changing] of [[true, false], [false, false], [true, true]]) {
    const snapshot = { status: 'ready', value: configured(), writable, revision: 1 }
    const html = renderToStaticMarkup(createElement(PassportSettingsPage, {
      view: 'page', scope: { getSnapshot: () => snapshot, subscribe: () => () => {} }, t: key => key,
      presets: [{ id: DEFAULT_PASSPORT_SETTINGS.agentPreset }],
      changes: { getSnapshot: () => changing, subscribe: () => () => {} },
    }))
    const inputs = [...html.matchAll(/<(?:input|select)\b[^>]*>/gu)].map(([tag]) => tag)
    for (const field of Object.keys(DEFAULT_PASSPORT_SETTINGS)) {
      if (field === 'sessionRevision') continue // Internal refresh token has no manual editor.
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


test('new-conversation action validates available preset IDs and atomically saves a fresh revision with edited settings', async () => {
  const base = configured(), value = { ...base, agentPreset: 'selected-preset', cwd: '/new-workspace' }
  let mutations = []
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 7 }), mutate: async (ops, revision) => { mutations.push({ ops, revision }); return true } }
  const presets = [{ id: 'selected-preset', name: 'A display name' }]
  await refreshPassportSession(scope, base, value, 7, presets)
  const first = mutations[0]
  assert.equal(first.revision, 7)
  assert.equal(first.ops.find(op => op.path[0] === 'agentPreset').value, 'selected-preset')
  assert.equal(first.ops.find(op => op.path[0] === 'cwd').value, '/new-workspace')
  const token = first.ops.find(op => op.path[0] === 'sessionRevision').value
  assert.equal(typeof token, 'string')
  assert.notEqual(token, base.sessionRevision)
  await refreshPassportSession(scope, base, base, 7, [{ id: base.agentPreset }])
  assert.notEqual(mutations[1].ops.find(op => op.path[0] === 'sessionRevision').value, token)
  assert.equal(mutations[1].ops.length, 1, 'refreshing the same preset changes only the session revision')
  for (const preset of ['A display name', 'missing-preset']) await assert.rejects(refreshPassportSession(scope, base, { ...value, agentPreset: preset }, 7, presets), /passport-preset-unavailable/u)
  await assert.rejects(refreshPassportSession(scope, base, value, 7, [{ id: value.agentPreset, unavailable: true }]), /passport-preset-unavailable/u)
  await assert.rejects(refreshPassportSession(scope, base, value, 6, presets), /passport-settings-conflict/u)
  assert.equal(mutations.length, 2)
})


test('preset refresh accepts a registered Chinese ID and preserves redacted pairing credentials', async () => {
  const base = { ...configured(), accessToken: '' }, id = '鲸鱼娘活人版Agent预设'
  let mutations
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 1 }), mutate: async ops => { mutations = ops; return true } }
  await refreshPassportSession(scope, base, { ...base, agentPreset: id }, 1, [{ id }], true)
  assert.equal(mutations.find(op => op.path[0] === 'agentPreset').value, id)
  assert.equal(mutations.some(op => op.path[0] === 'accessToken'), false)
})
