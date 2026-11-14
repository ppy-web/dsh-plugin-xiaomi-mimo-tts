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
  const settings = { memes: { enabled: true } }
  ctx.provide('systemPrompt', { tools() {} })
  ctx.plugin(ToolsService)
  await settle()
  const component = ctx.plugin({
    name: 'qq-component-test',
    apply(owner) {
      owner.provide('qqbotMemes', loadWhaleMemes())
      owner.provide('qqbotSettings', { current: () => settings })
    },
  })
  const agent = { id: 'qq-meme-agent' }
  const scope = createScope(ctx, agent)
  agent.ctx = scope.ctx
  scope.ctx.plugin({
    name: 'qq-meme-test', inject: ['tools', 'qqbotMemes', 'qqbotSettings'],
    apply(owner) { registerQqbotMemeTool(owner, { directory }) },
  })
  await settle()
  const pipeline = new ToolExecutionPipeline(ctx)
  const call = async (args, signal = new AbortController().signal, admitted) => {
    const toolSet = admitted ?? await ctx.tools.resolve({ agent, modelSelection: {}, signal })
    try {
      const prepared = await pipeline.prepare({ callId: randomUUID(), name: 'qqbot_send_meme', arguments: args, agent, signal, toolSet })
      return await pipeline.complete(prepared.exec, prepared.kind === 'dispatch' ? await pipeline.dispatch(prepared.exec) : prepared)
    } finally { if (!admitted) toolSet.dispose() }
  }
  const sender = execute => ctx.tools.register({
    name: 'qqbot_send_file', description: 'test QQ file sender',
    parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'], additionalProperties: false },
    output: { schema: { type: 'object', properties: { messageId: { type: 'string' }, target: { type: 'string' } }, required: ['messageId', 'target'], additionalProperties: false }, render: () => [] },
    execute,
  })
  try { await run({ ctx, scope, component, agent, call, sender, directory, settings }) } finally {
    await scope.dispose()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  }
}

test('QQ persona and meme tool use the same installed image catalog without exposing web image markup', async () => {
  const catalog = JSON.parse(await readFile(new URL('../skills/whale-girl/memes.json', import.meta.url), 'utf8'))
  const memes = loadWhaleMemes()
  assert.deepEqual(memes.map(meme => meme.id).sort(), Object.keys(catalog).sort())
  const persona = buildQqbotPersona()
  const rows = new Set(persona.split('\n'))
  for (const meme of memes) {
    assert.ok(rows.has(`${meme.id} ${catalog[meme.id]}`), 'each selectable ID is discoverable by its label')
    assert.equal(meme.path, join(root, 'skills', 'whale-girl', 'meme', `${meme.id}.webp`))
    assert.ok((await readFile(meme.path)).length > 0)
  }
  assert.equal(/!\[[^\]]*\]\(/u.test(persona), false, 'QQ uses real file delivery, not local Markdown images')
})

test('disabling QQ memes withdraws the tool and rejects calls already admitted by a model step', async () => {
  await setup(async ({ ctx, agent, call, sender, directory, settings }) => {
    const signal = new AbortController().signal
    const resolveTools = () => ctx.tools.resolve({ agent, modelSelection: {}, signal })
    const admitted = await resolveTools()
    const args = { meme: loadWhaleMemes()[0].id }
    let sends = 0
    sender(() => { sends++; return { messageId: 'image-message', target: 'group:current-chat' } })
    try {
      assert.ok(ctx.tools.get('qqbot_send_meme', agent, admitted))
      settings.memes.enabled = false
      const disabled = await resolveTools()
      try { assert.equal(ctx.tools.get('qqbot_send_meme', agent, disabled), undefined) }
      finally { disabled.dispose() }
      assert.equal((await call(args, signal, admitted)).isError, true)
      assert.equal(sends, 0)
      assert.deepEqual(await readdir(directory), [])
      settings.memes.enabled = true
      assert.equal((await call(args)).value.meme, args.meme)
      assert.equal(sends, 1)
    } finally { admitted.dispose() }
  })
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
    await mkdir(join(skillDir, 'meme'), { recursive: true })
    await writeFile(join(skillDir, 'persona.cjs'), await readFile(new URL('../skills/whale-girl/persona.cjs', import.meta.url)))
    const qqSkill = join(directory, 'skills', 'qqbot-whale-girl')
    await mkdir(qqSkill, { recursive: true })
    for (const file of ['SKILL.md', 'meme-instructions.md', 'memory-instructions.md']) {
      await writeFile(join(qqSkill, file), await readFile(new URL(`../skills/qqbot-whale-girl/${file}`, import.meta.url)))
    }
    const base = buildQqbotPersona(directory)
    assert.ok(base.length > 0)
    assert.deepEqual(loadWhaleMemes(directory), [])
    const manifest = join(skillDir, 'memes.json')
    await writeFile(manifest, '{invalid')
    assert.equal(buildQqbotPersona(directory), base)
    assert.deepEqual(loadWhaleMemes(directory), [])
    await writeFile(manifest, JSON.stringify({ 1: '庆祝图', 2: '缺失图片', '../outside': '目录外图片' }))
    await writeFile(join(skillDir, 'meme', '1.webp'), 'test image')
    await writeFile(join(skillDir, 'outside.webp'), 'outside image')
    assert.deepEqual(loadWhaleMemes(directory).map(meme => meme.id), ['1'])
    const persona = buildQqbotPersona(directory)
    assert.ok(persona.includes('\n1 庆祝图\n'))
    for (const label of ['缺失图片', '目录外图片']) assert.ok(!persona.includes(label))
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
