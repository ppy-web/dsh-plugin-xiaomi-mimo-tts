import assert from 'node:assert/strict'
import { readFile, stat } from 'node:fs/promises'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'
import Loader, { EntryGroup } from '@deepseek-ai/cordis-plugin-loader'
import Sessions from '@deepseek-ai/dsh-session'
import Projections from '@deepseek-ai/dsh-session-projection'
import Presets from '@deepseek-ai/dsh-agent-preset-registry'
import OfficialPreset from '@deepseek-ai/dsh-agent-preset'
import { load } from 'js-yaml'
import { entryListSchema, applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import * as child from 'dsh-xiaomi-tts/whale-girl'

const specifier = 'dsh-xiaomi-tts/whale-girl'
const patch = load(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), { schema: entryListSchema })
const presetRow = applyEntryPatches([], patch, message => assert.fail(message))
  .find(row => row.id === 'preset-whale-girl')

function useChild(ctx) {
  ctx.loader.internal = {
    version: 'v2',
    async import(name) {
      assert.equal(name, specifier)
      return child
    },
  }
}

async function toggle(ctx, entry) {
  const firstFiber = entry.fiber
  assert.ok(firstFiber)
  await entry.update({ disabled: true })
  await firstFiber.dispose()
  await ctx.loader.await()
  return async () => {
    await entry.update({ disabled: false })
    await ctx.loader.await()
    assert.ok(entry.fiber)
    assert.notEqual(entry.fiber, firstFiber)
  }
}

test('Whale Girl module retains the official preset implementation', () => {
  assert.equal(child.default, OfficialPreset)
  assert.equal(child.default[EntryGroup.key], true)
  assert.equal(presetRow.name, specifier)
  assert.equal(presetRow.config.id, 'whale-girl')
})

test('Loader preserves the full preset configuration and deferred child expressions', async () => {
  const ctx = new Context()
  const active = new Map()
  const registrations = []
  class RecordingPresets extends Service {
    constructor(owner) { super(owner, 'agentPresets') }
    async register(config) {
      assert.equal(active.has(config.id), false)
      active.set(config.id, config)
      registrations.push(config)
      return async () => { active.delete(config.id) }
    }
  }
  try {
    await ctx.plugin(Loader)
    await ctx.plugin(RecordingPresets)
    useChild(ctx)
    await ctx.loader.root.update([presetRow])
    await ctx.loader.await()
    assert.equal(active.size, 1)
    assert.deepEqual(registrations[0], presetRow.config)
    assert.equal(typeof registrations[0].plugins[0].config.prefix.__jsExpr, 'string')
    const entry = [...ctx.loader.entries()].find(row => row.options.id === presetRow.id)
    const reenable = await toggle(ctx, entry)
    assert.equal(active.size, 0)
    await reenable()
    assert.equal(active.size, 1)
    assert.equal(registrations.length, 2)
    assert.deepEqual(registrations[1], presetRow.config)
  } finally {
    await ctx.fiber.dispose()
  }
  assert.equal(active.size, 0)
})

test('official registry registers exactly once, disposes, and re-enables through Loader', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(Loader)
    await ctx.plugin(Sessions)
    await ctx.plugin(Projections)
    await ctx.plugin(Presets, { default: 'whale-girl' })
    useChild(ctx)
    await ctx.loader.root.update([{ ...presetRow, config: { ...presetRow.config, plugins: [] } }])
    await ctx.loader.await()
    assert.deepEqual((await ctx.agentPresets.list()).map(row => row.id), ['whale-girl'])
    assert.deepEqual(await ctx.agentPresets.resolve('whale-girl'), { id: 'whale-girl' })
    assert.equal((await ctx.agentPresets.list())[0].name, presetRow.config.name)
    const entry = [...ctx.loader.entries()].find(row => row.options.id === presetRow.id)
    const reenable = await toggle(ctx, entry)
    assert.deepEqual(await ctx.agentPresets.list(), [])
    await assert.rejects(ctx.agentPresets.resolve('whale-girl'), /Unknown agent preset/u)
    await reenable()
    assert.deepEqual((await ctx.agentPresets.list()).map(row => row.id), ['whale-girl'])
    assert.deepEqual(await ctx.agentPresets.resolve('whale-girl'), { id: 'whale-girl' })
    assert.equal((await ctx.agentPresets.list())[0].description, presetRow.config.description)
  } finally {
    await ctx.fiber.dispose()
  }
})

test('component resources resolve independently through package exports', async () => {
  for (const language of ['en', 'zh']) {
    const path = import.meta.resolve(`${specifier}/locale/${language}.json`)
    const dictionary = JSON.parse(await readFile(new URL(path), 'utf8'))
    assert.ok(dictionary.meta.title.trim())
    assert.ok(dictionary.meta.description.trim())
    assert.notEqual(path, import.meta.resolve(`dsh-xiaomi-tts/locale/${language}.json`))
  }
  const iconURL = new URL(import.meta.resolve(`${specifier}/icon`))
  const bytes = await readFile(iconURL)
  assert.ok((await stat(iconURL)).isFile())
  assert.ok(bytes.length > 0 && bytes.length <= 256 * 1024)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP')
})
