import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { load } from 'js-yaml'
import { entryListSchema, applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const buildPersona = require('../skills/whale-girl/persona.cjs')
const catalog = JSON.parse(await readFile(new URL('../skills/whale-girl/memes.json', import.meta.url), 'utf8'))
const skill = (await readFile(new URL('../skills/whale-girl/SKILL.md', import.meta.url), 'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')

function webpSize(data) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF')
  assert.equal(data.toString('ascii', 8, 12), 'WEBP')
  assert.equal(data.readUInt32LE(4) + 8, data.length)
  for (let offset = 12; offset + 8 <= data.length;) {
    const kind = data.toString('ascii', offset, offset + 4)
    const size = data.readUInt32LE(offset + 4)
    const start = offset + 8
    assert.ok(start + size <= data.length)
    if (kind === 'VP8X') return [data.readUIntLE(start + 4, 3) + 1, data.readUIntLE(start + 7, 3) + 1]
    if (kind === 'VP8 ') {
      assert.deepEqual([...data.subarray(start + 3, start + 6)], [0x9d, 0x01, 0x2a])
      return [data.readUInt16LE(start + 6) & 0x3fff, data.readUInt16LE(start + 8) & 0x3fff]
    }
    if (kind === 'VP8L') {
      assert.equal(data[start], 0x2f)
      const bits = data.readUInt32LE(start + 1)
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1]
    }
    offset = start + size + (size % 2)
  }
  assert.fail('Missing WebP image chunk')
}

test('catalog entries reference unique, readable WebP images', async () => {
  const directory = new URL('../skills/whale-girl/meme/', import.meta.url)
  assert.equal(new Set(catalog.memes.map(e => e.file)).size, catalog.memes.length)
  for (const entry of catalog.memes) {
    const data = await readFile(new URL(entry.file, directory))
    const [width, height] = webpSize(data)
    assert.ok(width > 0 && height > 0, entry.file)
  }
})

test('persona exposes every bundled meme for automatic selection', () => {
  const persona = buildPersona(root)
  assert.ok(persona.includes('鲸鱼娘'))
  for (const entry of catalog.memes.filter(entry => entry.automatic)) {
    const path = join(root, 'skills', 'whale-girl', 'meme', entry.file).replace(/\\/g, '/')
    assert.equal(persona.includes(`](<${path}>)`), true, entry.file)
  }
})

test('installation paths with spaces work and damaged optional resources keep the base persona', async () => {
  const directory = await mkdtemp(join(root, 'tmp-whale memes-'))
  try {
    const skillDir = join(directory, 'skills', 'whale-girl')
    await mkdir(join(skillDir, 'meme'), { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), skill)
    const base = buildPersona(directory)
    assert.ok(base.includes('鲸鱼娘'))
    await writeFile(join(skillDir, 'memes.json'), '{broken')
    assert.equal(buildPersona(directory), base)
    const entry = { file: 'example-happy.webp', mood: 'happy', description: '例图', context: '庆祝', automatic: true }
    const manifest = join(skillDir, 'memes.json')
    await writeFile(manifest, JSON.stringify({ memes: [entry] }))
    assert.equal(buildPersona(directory), base)
    await writeFile(join(skillDir, 'meme', entry.file), 'fixture')
    await writeFile(manifest, JSON.stringify({ memes: [entry, entry, { ...entry, file: '../outside-happy.webp' }, { ...entry, file: 'wrong-sad.webp' }] }))
    const persona = buildPersona(directory)
    const path = join(skillDir, 'meme', entry.file).replace(/\\/g, '/')
    assert.equal(persona.split(`](<${path}>)`).length - 1, 1)
    assert.equal(persona.includes('outside-happy.webp'), false)
    assert.equal(persona.includes('wrong-sad.webp'), false)
    await writeFile(manifest, JSON.stringify({ memes: {} }))
    assert.equal(buildPersona(directory), base)
  } finally {
    assert.ok(resolve(directory).startsWith(`${resolve(root)}${sep}tmp-whale memes-`))
    await rm(directory, { recursive: true, force: true })
  }
})

test('DSH and QQ share configurable character fields while exposing only their own image delivery format', () => {
  const persona = { name: '同一个小鲸', selfReference: '我', userAddress: '朋友', relationship: '可靠助手', personality: '机灵', replyStyle: '简短', likes: '绘画', boundaries: '不嘲笑' }
  const dsh = buildPersona(root, { persona, channel: 'dsh' })
  const qq = buildPersona(root, { persona, channel: 'qq' })
  for (const text of [dsh, qq]) {
    for (const value of Object.values(persona)) assert.ok(text.includes(value))
  }
  const file = catalog.memes.find(entry => entry.automatic).file
  assert.ok(dsh.includes(join(root, 'skills', 'whale-girl', 'meme', file).replace(/\\/g, '/')))
  assert.ok(!qq.includes(join(root, 'skills', 'whale-girl', 'meme', file).replace(/\\/g, '/')))
  assert.ok(qq.includes(file.slice(0, -5)))
})
