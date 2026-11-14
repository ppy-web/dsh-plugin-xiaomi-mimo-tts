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
const catalog = Object.entries(JSON.parse(await readFile(new URL('../skills/whale-girl/memes.json', import.meta.url), 'utf8')))
const skill = (await readFile(new URL('../skills/whale-girl/SKILL.md', import.meta.url), 'utf8')).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
const imageTemplate = /!\[[^\]\n]*\]\(<([^>\n]+\/)编号\.webp>\)/u

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

test('DSH persona indexes the bundled WebP images using the installation path', async () => {
  assert.ok(catalog.length > 0)
  const persona = buildPersona(root)
  const directory = imageTemplate.exec(persona)?.[1]
  assert.equal(directory, `${join(root, 'skills', 'whale-girl', 'meme').replace(/\\/g, '/')}/`)
  const rows = new Set(persona.split('\n'))
  for (const [id, label] of catalog) {
    assert.ok(rows.has(`${id} ${label}`), `meme ${id} must be selectable by label`)
    const data = await readFile(`${directory}${id}.webp`)
    const [width, height] = webpSize(data)
    assert.ok(width > 0 && height > 0, `${id}.webp`)
  }
})

test('installation paths with spaces work and damaged optional resources keep the base persona', async () => {
  const directory = await mkdtemp(join(root, 'tmp-whale memes-'))
  try {
    const skillDir = join(directory, 'skills', 'whale-girl')
    await mkdir(join(skillDir, 'meme'), { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), skill)
    for (const file of ['memory-instructions.md', 'meme-instructions.md']) {
      await writeFile(join(skillDir, file), await readFile(join(root, 'skills', 'whale-girl', file)))
    }
    const base = buildPersona(directory)
    assert.ok(base.trim())
    await writeFile(join(skillDir, 'memes.json'), '{broken')
    assert.equal(buildPersona(directory), base)
    const manifest = join(skillDir, 'memes.json')
    await writeFile(manifest, JSON.stringify({ 1: '庆祝图' }))
    assert.equal(buildPersona(directory), base)
    await writeFile(join(skillDir, 'meme', '1.webp'), 'fixture')
    await writeFile(join(skillDir, 'outside.webp'), 'outside image')
    await mkdir(join(skillDir, 'meme', '3.webp'))
    await writeFile(manifest, JSON.stringify({ 1: '庆祝图', 2: '缺失图片', 3: '目录冒充图片', '../outside': '目录外图片' }))
    const persona = buildPersona(directory)
    const imageDirectory = imageTemplate.exec(persona)?.[1]
    assert.equal(`${imageDirectory}1.webp`, join(skillDir, 'meme', '1.webp').replace(/\\/g, '/'))
    assert.ok(persona.includes('\n1 庆祝图\n'))
    for (const label of ['缺失图片', '目录冒充图片', '目录外图片']) assert.ok(!persona.includes(label))
    await writeFile(manifest, JSON.stringify(['庆祝图', '其他图片']))
    assert.equal(buildPersona(directory), base)
  } finally {
    assert.ok(resolve(directory).startsWith(`${resolve(root)}${sep}tmp-whale memes-`))
    await rm(directory, { recursive: true, force: true })
  }
})

test('independent DSH and QQ skills apply custom fields and expose only their own image delivery format', () => {
  const persona = { name: '同一个小鲸', selfReference: '我', userAddress: '朋友', relationship: '可靠助手', personality: '机灵', replyStyle: '简短', likes: '绘画', boundaries: '不嘲笑' }
  const dsh = buildPersona(root, { persona, channel: 'dsh' })
  const qq = buildPersona(root, { persona, channel: 'qq' })
  for (const text of [dsh, qq]) {
    for (const value of Object.values(persona)) assert.ok(text.includes(value))
  }
  assert.ok(imageTemplate.test(dsh))
  assert.ok(!qq.includes(join(root, 'skills', 'whale-girl', 'meme').replace(/\\/g, '/')))
})


test('DSH persona includes custom settings and only enabled capabilities', () => {
  const persona = { name: '自定义小鲸', selfReference: '我', userAddress: '朋友', relationship: '助手', personality: '认真', replyStyle: '简短', likes: '绘画', boundaries: '不嘲笑' }
  const [id, label] = catalog[0]
  for (const memoryEnabled of [false, true]) {
    for (const memesEnabled of [false, true]) {
      const prompt = buildPersona(root, { channel: 'dsh', persona, memoryEnabled, memesEnabled })
      assert.ok(prompt.includes(JSON.stringify(persona)))
      assert.equal(prompt.includes('whale-girl-memory'), memoryEnabled)
      assert.equal(prompt.split('\n').includes(`${id} ${label}`), memesEnabled)
    }
  }
})
