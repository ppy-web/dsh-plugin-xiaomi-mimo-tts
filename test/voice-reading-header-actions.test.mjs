import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { TTS_QQ_GROUP_ASSET_ROUTE } = await import('../lib/shared.js')

test('the QQ invite route references a shipped WebP asset', async () => {
  const filename = TTS_QQ_GROUP_ASSET_ROUTE.split('/').at(-1)
  const asset = await readFile(new URL(`../assets/ui/${filename}`, import.meta.url))
  assert.equal(asset.toString('ascii', 0, 4), 'RIFF')
  assert.equal(asset.toString('ascii', 8, 12), 'WEBP')
})
