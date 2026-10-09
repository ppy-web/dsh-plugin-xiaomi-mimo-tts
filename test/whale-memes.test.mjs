import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

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

test('catalog covers every bundled English-named WebP with bounded proportional dimensions', async () => {
  const directory = new URL('../skills/whale-girl/meme/', import.meta.url)
  const files = await readdir(directory)
  assert.equal(new Set(catalog.memes.map(e => e.file)).size, catalog.memes.length)
  assert.deepEqual(files.sort(), catalog.memes.map(e => e.file).sort())
  for (const entry of catalog.memes) {
    assert.match(entry.file, /^[a-z]+(?:-[a-z]+)+\.webp$/)
    assert.ok(entry.file.endsWith(`-${entry.mood}.webp`))
    assert.equal(typeof entry.automatic, 'boolean')
    const data = await readFile(new URL(entry.file, directory))
    assert.deepEqual(webpSize(data), entry.size)
    const [w, h] = entry.size
    const [sw, sh] = entry.sourceSize
    assert.ok(w > 0 && h > 0 && Math.max(w, h) <= 250)
    assert.ok(w <= sw && h <= sh)
    const scale = Math.min(1, 250 / Math.max(sw, sh))
    assert.ok(Math.abs(w - sw * scale) <= 1 && Math.abs(h - sh * scale) <= 1)
    assert.equal(data.length, entry.bytes)
    assert.ok(entry.context.length > 0)
  }
})

test('persona exposes every bundled meme for automatic selection and preserves CDN fallback', () => {
  const persona = buildPersona(root)
  assert.ok(persona.startsWith(skill))
  for (const entry of catalog.memes) {
    const path = join(root, 'skills', 'whale-girl', 'meme', entry.file).replace(/\\/g, '/')
    assert.equal(persona.includes(`](<${path}>)`), true, entry.file)
  }
  const base = 'https://bjumymxtfpfswthiusfr.storage.supabase.co/storage/v1/object/public/ai-meme/'
  assert.ok(persona.includes(`${base}0_preview/meme/NNN.webp`))
  for (const id of ['123', '007', '037', '052', '087', '097']) assert.ok(persona.includes(`\`${id}\``))
})

test('installation paths with spaces work and damaged optional resources keep the base persona', async () => {
  const directory = await mkdtemp(join(root, 'tmp-whale memes-'))
  try {
    const skillDir = join(directory, 'skills', 'whale-girl')
    await mkdir(join(skillDir, 'meme'), { recursive: true })
    await writeFile(join(skillDir, 'SKILL.md'), skill)
    assert.equal(buildPersona(directory), skill)
    await writeFile(join(skillDir, 'memes.json'), '{broken')
    assert.equal(buildPersona(directory), skill)
    const entry = { file: 'example-happy.webp', mood: 'happy', description: '例图', context: '庆祝', automatic: true }
    const manifest = join(skillDir, 'memes.json')
    await writeFile(manifest, JSON.stringify({ memes: [entry] }))
    assert.equal(buildPersona(directory), skill)
    await writeFile(join(skillDir, 'meme', entry.file), 'fixture')
    await writeFile(manifest, JSON.stringify({ memes: [entry, entry, { ...entry, file: '../outside-happy.webp' }, { ...entry, file: 'wrong-sad.webp' }] }))
    const persona = buildPersona(directory)
    const path = join(skillDir, 'meme', entry.file).replace(/\\/g, '/')
    assert.equal(persona.split(`](<${path}>)`).length - 1, 1)
    assert.equal(persona.includes('outside-happy.webp'), false)
    assert.equal(persona.includes('wrong-sad.webp'), false)
    await writeFile(manifest, JSON.stringify({ memes: {} }))
    assert.equal(buildPersona(directory), skill)
  } finally {
    assert.ok(resolve(directory).startsWith(`${resolve(root)}${sep}tmp-whale memes-`))
    await rm(directory, { recursive: true, force: true })
  }
})

test('preset configuration resolves its installed persona loader', async () => {
  const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const expression = patch.match(/prefix: !!js >-\r?\n\s+([^\r\n]+)/)?.[1]
  assert.ok(expression)
  const baseUrl = new URL('../', import.meta.url).href
  const result = Function('baseUrl', `return (${expression})`)(baseUrl)
  assert.equal(result, buildPersona(root))
})
