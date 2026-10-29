import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

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
