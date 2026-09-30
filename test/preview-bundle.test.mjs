import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../preview/bundle-components.tsx', import.meta.url), 'utf8')

test('preview component list ships the liang-wenfeng preset as a third entry', () => {
  // The liang-wenfeng entry uses the dedicated icon asset and the shared preset module.
  assert.match(source, /liang-wenfeng\.webp/u)
  assert.match(source, /module: '@deepseek-ai\/dsh-agent-preset'/u)
  // Display names exist for both supported locales.
  assert.match(source, /梁文峰/u)
  assert.match(source, /Liang Wenfeng/u)
  // Exactly three component entries, in the documented order.
  const ids = [...source.matchAll(/id: '([a-z0-9-]+)'/gu)].map((match) => match[1])
  assert.deepEqual(ids, ['xiaomi-mimo-tts', 'preset-whale-girl', 'preset-liang-wenfeng'])
})
