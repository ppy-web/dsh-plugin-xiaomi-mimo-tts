import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../preview/bundle-components.tsx', import.meta.url), 'utf8')

test('preview component list includes the active TTS and whale-girl entries', () => {
  const ids = [...source.matchAll(/id: '([a-z0-9-]+)'/gu)].map((match) => match[1])
  assert.deepEqual(ids, ['xiaomi-mimo-tts', 'preset-whale-girl'])
})
