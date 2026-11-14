import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { saveWhaleDraft, validateWhaleDraft } = await loadClientModule('src/client/settings/whale-draft.ts')
const { registerWhalePersonaSettings, registerQqbotSpeechSettings } = await loadClientModule('src/client/settings/qqbot-registration.ts')
const { DEFAULT_WHALE_SETTINGS } = await loadClientModule('src/types/whale.ts')
const { saveQqSpeechDraft, validQqSpeechDraft } = await loadClientModule('src/client/settings/qqbot-speech-draft.ts')
const { QqbotSpeechSettings } = await loadClientModule('src/client/settings/qqbot-settings.tsx')
const { WhalePersonaSettings } = await loadClientModule('src/client/settings/whale-settings.tsx')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const defaults = () => structuredClone(DEFAULT_WHALE_SETTINGS)

test('QQ integration is opt-in and saves or clears only its own Host setting', async () => {
  assert.equal(resolveTtsSettings({}).qqbotEnabled, false)
  const sources = ['dsh-pet']
  let user = { announcementSources: sources }
  const writes = []
  const scope = {
    getSnapshot: () => ({ value: user, user }),
    async mutate(ops) {
      writes.push(...ops)
      for (const op of ops) {
        if (op.op === 'set') user = { ...user, [op.path[0]]: op.value }
        else delete user[op.path[0]]
      }
      return true
    },
  }
  const draft = resolveTtsSettings({ ...user, qqbotEnabled: true })
  const keys = { xiaomi: '', doubao: '' }
  await saveSettingsDraft(scope, draft, { qqbotEnabled: { kind: 'set' } }, keys)
  await saveSettingsDraft(scope, draft, { qqbotEnabled: { kind: 'set' } }, keys)
  assert.deepEqual(writes, [{ op: 'set', path: ['qqbotEnabled'], value: true }])
  assert.deepEqual(user.announcementSources, sources)
  await saveSettingsDraft(scope, resolveTtsSettings(user), { qqbotEnabled: { kind: 'clear' } }, keys)
  assert.deepEqual(writes.at(-1), { op: 'unset', path: ['qqbotEnabled'] })
  assert.equal(resolveTtsSettings(user).qqbotEnabled, false)
})

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
    assert.deepEqual(requested, ['preset-whale-girl', 'xiaomi-mimo-tts', 'speech-delivery-qqbot'])
    disposeVoice()
    dispose()
    assert.equal(registrations.size, 0)
  } finally { await ctx.fiber.dispose() }
})

test('saving persona fields submits one atomic revision-fenced edit and preserves other settings', async () => {
  const base = defaults(), draft = defaults(), writes = []
  draft.persona.name = '小鲸'
  draft.memory.enabled = false
  draft.memes.enabled = false
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 4 }), async mutate(ops, revision) { writes.push({ ops, revision }); return true } }
  await saveWhaleDraft(scope, base, draft, 4)
  assert.deepEqual(writes, [{ revision: 4, ops: [
    { op: 'set', path: ['persona', 'name'], value: '小鲸' },
    { op: 'set', path: ['memory', 'enabled'], value: false },
    { op: 'set', path: ['memes', 'enabled'], value: false },
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

test('rendered QQ controls read QQ persona values and preserve separate write permissions for speech settings', () => {
  const makeScope = (value, writable) => {
    const snapshot = { status: 'ready', value, writable, revision: 1 }
    return { getSnapshot: () => snapshot, subscribe: () => () => {} }
  }
  const qq = defaults(), desktop = defaults()
  qq.persona.name = 'QQ configured name'
  desktop.persona.name = 'DSH configured name'
  const t = key => key
  const html = renderToStaticMarkup(createElement(QqbotSpeechSettings, {
    view: 'page', personaScope: makeScope(qq, false), scope: makeScope({ qqbotEnabled: true }, true), t,
  }))
  const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/gu)].map(match => match[0])
  assert.equal(forms.length, 2, 'persona and Host voice settings have independent submit boundaries')
  const personaForm = forms.find(form => form.includes('aria-label="qq.persona"'))
  const voiceForm = forms.find(form => form.includes('aria-label="qq.voice"'))
  assert.ok(personaForm.includes('value="QQ configured name"'))
  assert.ok(!html.includes('DSH configured name'))
  const personaInputs = [...personaForm.matchAll(/<(?:input|textarea)\b[^>]*>/gu)]
  assert.ok(personaInputs.length > 0)
  assert.ok(personaInputs.every(([tag]) => /\bdisabled=""/u.test(tag)))
  const automatic = [...voiceForm.matchAll(/<input\b[^>]*>/gu)].find(([tag]) => tag.includes('role="switch"'))[0]
  assert.ok(automatic.includes('checked=""'))
  assert.ok(!automatic.includes('disabled=""'), 'a read-only QQ persona must not disable editable Host voice settings')
  const desktopHtml = renderToStaticMarkup(createElement(WhalePersonaSettings, {
    view: 'page', scope: makeScope(desktop, true), t,
  }))
  assert.ok(desktopHtml.includes('value="DSH configured name"'))
  assert.ok(!desktopHtml.includes('QQ configured name'))
  assert.ok(desktopHtml.includes('aria-label="whale.memoryEnabled"'))
  assert.ok(desktopHtml.includes('aria-label="whale.memesEnabled"'))
  assert.ok(!personaForm.includes('aria-label="whale.memesEnabled"'))
})
