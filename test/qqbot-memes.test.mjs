import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import ToolsService from '@deepseek-ai/dsh-tools'
import { ToolExecutionPipeline } from '@deepseek-ai/dsh-tools/pipeline'
import { createScope } from '@deepseek-ai/dsh-scope'
import { buildQqbotPersona, cleanupQqbotMemes, loadWhaleMemes, registerQqbotMemeTool } from '../lib/qqbot-agent.js'

const settle = () => new Promise(resolve => setImmediate(resolve))
const root = fileURLToPath(new URL('../', import.meta.url))

async function setup(run) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-qq-memes '))
  const ctx = new Context()
  ctx.provide('systemPrompt', { tools() {} })
  ctx.provide('whaleConversations', { resolve: async () => ({ kind: 'qqbot' }) })
  ctx.provide('qqbotCompanion', { prepare: async () => {} })
  ctx.plugin(ToolsService)
  await settle()
  const component = ctx.plugin({
    name: 'qq-component-test',
    apply(owner) { owner.provide('qqbotMemes', loadWhaleMemes()) },
  })
  const agent = { id: 'qq-meme-agent' }
  const scope = createScope(ctx, agent)
  agent.ctx = scope.ctx
  scope.ctx.plugin({
    name: 'qq-meme-test', inject: ['tools', 'qqbotMemes'],
    apply(owner) { registerQqbotMemeTool(owner, { directory }) },
  })
  await settle()
  const pipeline = new ToolExecutionPipeline(ctx)
  const call = async (args, signal = new AbortController().signal) => {
    const toolSet = await ctx.tools.resolve({ agent, modelSelection: {}, signal })
    try {
      const prepared = await pipeline.prepare({ callId: randomUUID(), name: 'qqbot_send_meme', arguments: args, agent, signal, toolSet })
      return await pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
    } finally { toolSet.dispose() }
  }
  const sender = execute => ctx.tools.register({
    name: 'qqbot_send_file', description: 'test QQ file sender',
    parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { messageId: { type: 'string' }, target: { type: 'string' } }, required: ['messageId', 'target'], additionalProperties: false }, render: () => [] },
    execute,
  })
  try { await run({ ctx, scope, component, agent, call, sender, directory }) } finally {
    await scope.dispose()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

test('QQ persona and meme tool use the same installed image catalog without exposing web image markup', async () => {
  const catalog = JSON.parse(await readFile(new URL('../skills/whale-girl/memes.json', import.meta.url), 'utf8'))
  const memes = loadWhaleMemes()
  assert.deepEqual(memes.map(meme => `${meme.id}.webp`).sort(), catalog.memes.filter(meme => meme.automatic).map(meme => meme.file).sort())
  const persona = buildQqbotPersona()
  for (const meme of memes) {
    assert.ok(persona.includes(meme.id), 'each selectable ID is discoverable by the model')
    assert.ok(!relative(join(root, 'skills', 'whale-girl', 'meme'), meme.path).startsWith('..'))
    assert.ok((await readFile(meme.path)).length > 0)
  }
  assert.equal(/!\[[^\]]*\]\(/u.test(persona), false, 'QQ uses real file delivery, not local Markdown images')
})

test('QQ meme tool is scoped, sends real image bytes to its own Agent and removes only the staged copy', async () => {
  await setup(async ({ ctx, agent, call, sender, directory }) => {
    const meme = loadWhaleMemes()[0]
    const bytes = await readFile(meme.path)
    let sentPath
    sender(async (args, exec) => {
      assert.equal(exec.agent, agent)
      assert.deepEqual(Object.keys(args), ['file_path'], 'QQBot resolves the current conversation; no explicit target')
      assert.equal(relative(directory, args.file_path).startsWith('..'), false)
      assert.ok(args.file_path.endsWith('.webp'))
      assert.deepEqual(await readFile(args.file_path), bytes)
      sentPath = args.file_path
      return { messageId: 'image-message', target: 'group:current-chat' }
    })
    assert.equal(ctx.tools.get('qqbot_send_meme'), undefined)
    assert.ok(ctx.tools.get('qqbot_send_meme', agent))
    const result = await call({ meme: meme.id })
    assert.equal(result.isError, false)
    assert.deepEqual(result.value, { adapter: 'qqbot', meme: meme.id, messageId: 'image-message', target: 'group:current-chat' })
    await assert.rejects(readFile(sentPath), { code: 'ENOENT' })
    assert.deepEqual(await readFile(meme.path), bytes, 'bundled source is retained')
    assert.deepEqual(await readdir(directory), [])
  })
})

test('QQ meme delivery rejects invalid IDs and missing or restricted senders without leaking files', async () => {
  await setup(async ({ ctx, agent, call, sender, directory }) => {
    const meme = loadWhaleMemes()[0]
    for (const invalid of ['../../private', meme.path, 'unknown-meme']) assert.equal((await call({ meme: invalid })).isError, true)
    assert.equal((await call({ meme: meme.id })).isError, true)
    sender(() => assert.fail('restricted sender must not run'))
    agent.ctx.inject(['tools'], scoped => { scoped.tools.restrict({ deny: ['qqbot_send_file'] }) })
    await settle()
    assert.equal((await call({ meme: meme.id })).isError, true)
    assert.deepEqual(await readdir(directory), [])
  })
})

test('QQ meme sending observes QQ file policies and never retries a rejected or ambiguous send', async () => {
  await setup(async ({ ctx, agent, call, sender, directory }) => {
    let calls = 0
    sender(async () => { calls++; throw new Error('uncertain platform outcome') })
    const policy = agent.ctx.inject(['tools'], scoped => {
      scoped.tools.guard(exec => exec.name === 'qqbot_send_file' ? 'QQ files denied' : undefined)
    })
    await settle()
    assert.equal((await call({ meme: loadWhaleMemes()[0].id })).isError, true)
    assert.equal(calls, 0)
    assert.deepEqual(await readdir(directory), [])
    await policy.dispose()
    assert.equal((await call({ meme: loadWhaleMemes()[0].id })).isError, true)
    assert.equal(calls, 1, 'no automatic retry after an unknown send outcome')
    assert.deepEqual(await readdir(directory), [])
  })
})

test('cancellation and preset disposal drain pending QQ image sends and remove temporary files', async () => {
  for (const cancel of ['signal', 'dispose', 'component']) await setup(async ({ ctx, scope, component, agent, call, sender, directory }) => {
    let started
    const ready = new Promise(resolve => { started = resolve })
    sender(async (_args, exec) => {
      started()
      await new Promise((resolve, reject) => {
        if (exec.signal.aborted) reject(exec.signal.reason)
        else exec.signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true })
      })
      assert.fail('canceled sender must not succeed')
    })
    const controller = new AbortController()
    const task = call({ meme: loadWhaleMemes()[0].id }, controller.signal)
    await ready
    assert.equal((await readdir(directory)).length, 1)
    if (cancel === 'signal') controller.abort()
    else if (cancel === 'component') await component.dispose()
    else await scope.dispose()
    assert.equal((await task).isError, true)
    assert.deepEqual(await readdir(directory), [])
    if (cancel !== 'signal') assert.equal(ctx.tools.get('qqbot_send_meme', agent), undefined)
  })
})

test('damaged optional catalog resources retain the QQ persona and skip unusable entries', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-qq catalog '))
  try {
    const skillDir = join(directory, 'skills', 'whale-girl')
    const imageDir = join(directory, 'skills', 'whale-girl')
    await mkdir(skillDir, { recursive: true })
    await mkdir(join(imageDir, 'meme'), { recursive: true })
    for (const file of ['SKILL.md', 'persona.cjs', 'qq.md']) await writeFile(join(skillDir, file), await readFile(new URL(`../skills/whale-girl/${file}`, import.meta.url)))
    const base = buildQqbotPersona(directory)
    assert.ok(base.length > 0)
    assert.deepEqual(loadWhaleMemes(directory), [])
    await writeFile(join(imageDir, 'memes.json'), '{invalid')
    assert.equal(buildQqbotPersona(directory), base)
    const entry = { file: 'example-happy.webp', mood: 'happy', description: 'example', context: 'celebrate', automatic: true }
    await writeFile(join(imageDir, 'memes.json'), JSON.stringify({ memes: [entry, entry, { ...entry, file: '../escape-happy.webp' }, { ...entry, file: 'missing-happy.webp' }] }))
    await writeFile(join(imageDir, 'meme', entry.file), 'test image')
    assert.deepEqual(loadWhaleMemes(directory).map(meme => meme.id), ['example-happy'])
    assert.ok(buildQqbotPersona(directory).includes('example-happy'))
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('expired QQ meme copies are removed without deleting current or unrelated media', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-qq-meme-cleanup-'))
  const now = Date.now()
  const old = join(directory, `dsh-meme-${randomUUID()}.webp`)
  const fresh = `dsh-meme-${randomUUID()}.webp`
  try {
    for (const path of [old, join(directory, fresh), join(directory, 'user-photo.webp')]) await writeFile(path, 'image')
    await utimes(old, new Date(now - 48 * 3600000), new Date(now - 48 * 3600000))
    await cleanupQqbotMemes(directory, now)
    assert.deepEqual((await readdir(directory)).sort(), [fresh, 'user-photo.webp'].sort())
  } finally { await rm(directory, { recursive: true, force: true }) }
})
