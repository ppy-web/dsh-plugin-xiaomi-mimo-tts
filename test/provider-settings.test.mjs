import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_TTS_SETTINGS, resolveTtsSettings, ttsSelection } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { saveSettingsDraft, validateSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

function form(initial = {}, rejectField) {
  const user = { ...initial }
  const writes = []
  return {
    user, writes,
    getSnapshot: () => ({ user, value: resolveTtsSettings(user) }),
    async mutate(ops) {
      writes.push(ops)
      if (ops.some(op => op.path[0] === rejectField)) return false
      for (const op of ops) {
        if (op.op === 'set') user[op.path[0]] = op.value
        else delete user[op.path[0]]
      }
      return true
    },
  }
}

test('provider settings retain separate credentials, models and voices across switches', async () => {
  const scope = form({ apiKey: 'sk-original', voice: '茉莉', model: 'mimo-v2.5-tts-voicedesign' })
  const draft = resolveTtsSettings({ ...scope.user, provider: 'doubao', doubaoVoice: 'my-standard' })
  await saveSettingsDraft(scope, draft, { provider: { kind: 'set' }, doubaoVoice: { kind: 'set' }, doubaoApiKey: { kind: 'set' } }, { xiaomi: '', doubao: 'new-doubao' })
  assert.equal(scope.writes.length, 1)
  assert.equal(scope.writes[0].length, 3)
  assert.equal(scope.user.apiKey, 'sk-original')
  assert.equal(scope.user.doubaoApiKey, 'new-doubao')
  assert.equal(ttsSelection(resolveTtsSettings(scope.user)).voice, 'my-standard')
  await saveSettingsDraft(scope, resolveTtsSettings({ ...scope.user, provider: 'xiaomi' }), { provider: { kind: 'set' } }, { xiaomi: '', doubao: '' })
  assert.equal(scope.user.model, 'mimo-v2.5-tts-voicedesign')
  assert.equal(scope.user.voice, '茉莉')
  assert.equal(scope.user.doubaoVoice, 'my-standard')
  assert.equal(scope.user.doubaoApiKey, 'new-doubao')
})

test('replacing one credential preserves the other provider credential', async () => {
  const scope = form({ apiKey: 'sk-one', doubaoApiKey: 'two' })
  await saveSettingsDraft(scope, resolveTtsSettings(scope.user), { doubaoApiKey: { kind: 'set' } }, { xiaomi: '', doubao: 'replacement' })
  assert.deepEqual(scope.writes, [[{ op: 'set', path: ['doubaoApiKey'], value: 'replacement' }]])
  assert.equal(scope.user.apiKey, 'sk-one')
  assert.equal(scope.user.doubaoApiKey, 'replacement')
})

test('rejected writes preserve the selected provider and leave caller-owned drafts intact for retry', async () => {
  const scope = form({ provider: 'xiaomi' }, 'doubaoApiKey')
  const draft = resolveTtsSettings({ provider: 'doubao', doubaoVoice: 'new-voice' })
  const keys = { xiaomi: '', doubao: 'new-doubao' }
  const changes = { provider: { kind: 'set' }, doubaoVoice: { kind: 'set' }, doubaoApiKey: { kind: 'set' } }
  await assert.rejects(saveSettingsDraft(scope, draft, changes, keys), Error)
  assert.equal(scope.user.provider, 'xiaomi')
  assert.deepEqual(scope.user, { provider: 'xiaomi' })
  assert.equal(scope.writes.length, 1)
  assert.equal(keys.doubao, 'new-doubao')
  assert.equal(changes.doubaoApiKey.kind, 'set')
})

test('missing clone voice and invalid Xiaomi key are rejected before any settings write', async () => {
  const scope = form()
  const draft = resolveTtsSettings({ provider: 'doubao', doubaoModel: 'seed-icl-2.0' })
  assert.equal(validateSettingsDraft(draft), 'voice-required')
  await assert.rejects(saveSettingsDraft(scope, draft, { provider: { kind: 'set' } }, { xiaomi: '', doubao: '' }), /voice-required/)
  await assert.rejects(saveSettingsDraft(scope, DEFAULT_TTS_SETTINGS, { apiKey: { kind: 'set' } }, { xiaomi: 'wrong-key', doubao: '' }), /api-key-rejected/)
  assert.deepEqual(scope.writes, [])
})

test('standard and clone voice selections remain independent', () => {
  const base = resolveTtsSettings({ provider: 'doubao', doubaoVoice: 'standard', doubaoClonedVoice: 'clone' })
  assert.equal(ttsSelection(base).voice, 'standard')
  assert.equal(ttsSelection({ ...base, doubaoModel: 'seed-icl-2.0' }).voice, 'clone')
  assert.equal(ttsSelection({ ...base, provider: 'xiaomi' }).voice, DEFAULT_TTS_SETTINGS.voice)
})

test('instructions save independently, survive provider switches and reset by removing their override', async () => {
  const scope = form({ instruction: 'Xiaomi context', voiceDesignPrompt: 'Xiaomi design', doubaoApiKey: 'saved-key' })
  assert.equal(resolveTtsSettings(scope.user).doubaoInstruction, '')
  const draft = resolveTtsSettings({ ...scope.user, provider: 'doubao', doubaoInstruction: 'my delivery' })
  await saveSettingsDraft(scope, draft, { provider: { kind: 'set' }, doubaoInstruction: { kind: 'set' } }, { xiaomi: '', doubao: '' })
  assert.equal(scope.user.doubaoInstruction, 'my delivery')
  await saveSettingsDraft(scope, { ...draft, provider: 'xiaomi' }, { provider: { kind: 'set' } }, { xiaomi: '', doubao: '' })
  assert.equal(scope.user.doubaoInstruction, 'my delivery')
  assert.equal(scope.user.instruction, 'Xiaomi context')
  assert.equal(scope.user.voiceDesignPrompt, 'Xiaomi design')
  await saveSettingsDraft(scope, { ...draft, provider: 'xiaomi', instruction: 'Xiaomi delivery' }, { instruction: { kind: 'set' } }, { xiaomi: '', doubao: '' })
  assert.equal(scope.user.instruction, 'Xiaomi delivery')
  assert.equal(scope.user.doubaoInstruction, 'my delivery')
  await saveSettingsDraft(scope, draft, { instruction: { kind: 'clear' } }, { xiaomi: '', doubao: '' })
  assert.equal(Object.hasOwn(scope.user, 'instruction'), false)
  await saveSettingsDraft(scope, { ...draft, doubaoInstruction: '' }, { doubaoInstruction: { kind: 'clear' } }, { xiaomi: '', doubao: '' })
  assert.equal(Object.hasOwn(scope.user, 'doubaoInstruction'), false)
  assert.equal(scope.user.doubaoApiKey, 'saved-key')
})

test('erasing a key draft leaves the saved credentials unchanged', async () => {
  const scope = form({ apiKey: 'sk-saved', doubaoApiKey: 'saved-doubao' })
  await saveSettingsDraft(scope, resolveTtsSettings({ ...scope.user, provider: 'doubao' }), { apiKey: { kind: 'set' }, doubaoApiKey: { kind: 'set' }, provider: { kind: 'set' } }, { xiaomi: '  ', doubao: '' })
  assert.equal(scope.user.apiKey, 'sk-saved')
  assert.equal(scope.user.doubaoApiKey, 'saved-doubao')
  assert.deepEqual(scope.writes, [[{ op: 'set', path: ['provider'], value: 'doubao' }]])
})

test('unchanged settings and absent overrides do not submit a mutation', async () => {
  const scope = form()
  await saveSettingsDraft(scope, resolveTtsSettings(), { voiceVolume: { kind: 'set' }, instruction: { kind: 'clear' } }, { xiaomi: '', doubao: '' })
  assert.deepEqual(scope.writes, [])
})
