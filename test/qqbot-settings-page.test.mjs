import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { loadClientModule } from './helpers/client-modules.mjs'

const { saveWhaleDraft, validateWhaleDraft } = await loadClientModule('src/client/settings/whale-draft.ts')
const { registerWhalePersonaSettings, registerQqbotSpeechSettings } = await loadClientModule('src/client/settings/qqbot-registration.ts')
const { DEFAULT_WHALE_SETTINGS } = await loadClientModule('src/types/whale.ts')
const { saveQqSpeechDraft, validQqSpeechDraft } = await loadClientModule('src/client/settings/qqbot-speech-draft.ts')
const defaults = () => structuredClone(DEFAULT_WHALE_SETTINGS)

test('persona and QQ relay settings bind to the correct independent namespaces', async () => {
  const ctx = new Context(), registrations = new Map(), requested = []
  const scope = { getSnapshot() {}, subscribe() {} }, changes = { getSnapshot: () => false, subscribe: () => () => {} }
  ctx.provide('slots', {
    register(options, component) {
      registrations.set(options.key, { options, component })
      return () => { registrations.delete(options.key) }
    },
  })
  ctx.provide('configForms', { get(namespace) { requested.push(namespace); return scope } })
  const t = key => key
  try {
    const dispose = registerWhalePersonaSettings(ctx, t, changes)
    const page = registrations.get('dsh-xiaomi-tts#preset-whale-girl')
    assert.equal(page.options.name, 'plugins.row.config')
    assert.equal(typeof page.component, 'function')
    assert.equal(page.options.inject().scope, scope)
    const disposeVoice = registerQqbotSpeechSettings(ctx, t, changes)
    registrations.get('dsh-xiaomi-tts#speech-delivery-qqbot').options.inject()
    assert.deepEqual(requested, ['preset-whale-girl', 'xiaomi-mimo-tts'])
    disposeVoice()
    dispose()
    assert.equal(registrations.size, 0)
  } finally { await ctx.fiber.dispose() }
})

test('saving persona fields submits one atomic revision-fenced edit and preserves other settings', async () => {
  const base = defaults(), draft = defaults(), writes = []
  draft.persona.name = '小鲸'
  draft.memory.enabled = false
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 4 }), async mutate(ops, revision) { writes.push({ ops, revision }); return true } }
  await saveWhaleDraft(scope, base, draft, 4)
  assert.deepEqual(writes, [{ revision: 4, ops: [
    { op: 'set', path: ['persona', 'name'], value: '小鲸' },
    { op: 'set', path: ['memory', 'enabled'], value: false },
  ] }])
  await saveWhaleDraft(scope, base, base, 4)
  assert.equal(writes.length, 1, 'unchanged fields must not overwrite the Host')
})

test('stale, unavailable, read-only and rejected persona writes do not report success', async () => {
  const base = defaults(), draft = defaults()
  draft.persona.name = '新名字'
  for (const snapshot of [{ status: 'ready', writable: true, revision: 5 }, { status: 'unavailable', writable: true, revision: 4 }, { status: 'ready', writable: false, revision: 4 }]) {
    await assert.rejects(saveWhaleDraft({ getSnapshot: () => snapshot, mutate: () => assert.fail('must not overwrite newer or unavailable settings') }, base, draft, 4))
  }
  await assert.rejects(saveWhaleDraft({ getSnapshot: () => ({ status: 'ready', writable: true, revision: 4 }), mutate: async () => false }, base, draft, 4), { message: 'whale-settings-save-failed' })
})

test('persona form validates required identity fields and bounded persona text', () => {
  assert.equal(validateWhaleDraft(defaults()), null)
  for (const mutate of [value => { value.persona.name = '' }, value => { value.persona.selfReference = ' ' }, value => { value.persona.name = '长'.repeat(61) }, value => { value.persona.replyStyle = '长'.repeat(1201) }]) {
    const draft = defaults(); mutate(draft)
    assert.equal(validateWhaleDraft(draft), 'persona')
  }
  const draft = defaults()
  draft.persona.userAddress = ''
  draft.persona.likes = ''
  assert.equal(validateWhaleDraft(draft), null)
})

test('QQ voice rule edits write only their own fields and reject invalid or stale changes', async () => {
  const base = { qqbotEnabled: false, qqbotMaxAutoCharacters: 0, qqbotMaxDurationSeconds: 0 }
  const value = { ...base, qqbotEnabled: true, qqbotMaxDurationSeconds: 30 }, writes = []
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 3 }), async mutate(ops, revision) { writes.push({ ops, revision }); return true } }
  await saveQqSpeechDraft(scope, base, value, 3)
  assert.deepEqual(writes, [{ revision: 3, ops: [
    { op: 'set', path: ['qqbotEnabled'], value: true },
    { op: 'set', path: ['qqbotMaxDurationSeconds'], value: 30 },
  ] }])
  assert.equal(validQqSpeechDraft({ ...value, qqbotMaxAutoCharacters: -1 }), false)
  assert.equal(validQqSpeechDraft({ ...value, qqbotMaxDurationSeconds: 0.5 }), false)
  await assert.rejects(saveQqSpeechDraft(scope, base, value, 2))
  assert.equal(writes.length, 1)
})
