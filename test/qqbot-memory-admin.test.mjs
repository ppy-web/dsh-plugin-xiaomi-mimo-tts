import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QqIdentityReader, QqMemoryStore, QqMemoryAdmin } from '../lib/qqbot.js'

test('QQ memory admin lists known peers and edits only the selected namespace', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qq-memory-admin-'))
  const mapping = join(directory, 'model-prefs.json')
  const key = 'qqbot:bot:c2c:peer', other = 'qqbot:bot:group:room'
  await writeFile(mapping, JSON.stringify({ sessionIds: { [key]: 'session-one', [other]: 'session-two' } }))
  const store = new QqMemoryStore('admin-test', directory), admin = new QqMemoryAdmin(store, new QqIdentityReader(mapping))
  try {
    const first = await admin.update({ key, action: 'save', kind: 'preference', text: '叫我小林' })
    assert.equal(first.entries[0].text, '叫我小林')
    const edited = await admin.update({ key, action: 'save', id: first.entries[0].id, kind: 'preference', text: '叫我小鲸' })
    assert.equal(edited.entries[0].text, '叫我小鲸')
    assert.equal((await admin.list()).find(peer => peer.key === other).entries.length, 0)
    await admin.update({ key, action: 'delete', id: edited.entries[0].id })
    assert.equal((await admin.list()).find(peer => peer.key === key).entries.length, 0)
    await assert.rejects(admin.update({ key: 'qqbot:bot:c2c:unknown', action: 'clear' }), { code: 'qqbot-memory-identity-unavailable' })
  } finally { await rm(directory, { recursive: true, force: true }) }
})
