import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

test('QQ identity and default speech delivery share QQBOT_DATA_DIR and clean staged audio', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-qq-data-dir-'))
  const dataDir = join(directory, 'qqbot'), userHome = join(directory, 'user')
  await mkdir(dataDir)
  await mkdir(userHome)
  await writeFile(join(dataDir, 'model-prefs.json'), JSON.stringify({ sessionIds: { 'qqbot:bot:c2c:peer': 'qq-agent' } }))
  try {
    await promisify(execFile)(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict'
      import { readFile, readdir } from 'node:fs/promises'
      import { dirname, join } from 'node:path'
      import { Context } from '@deepseek-ai/cordis'
      import ToolsService from '@deepseek-ai/dsh-tools'
      import { NativeToolRegistry } from '@deepseek-ai/dsh-tools/pipeline'
      import { createScope } from '@deepseek-ai/dsh-scope'
      import { QqIdentityReader, createQqbotSpeechDelivery } from './lib/qqbot.js'
      const ctx = new Context(), media = join(process.env.QQBOT_DATA_DIR, 'media')
      const agent = { id: 'qq-agent', session: { header: {} } }
      const scope = createScope(ctx, agent)
      agent.ctx = scope.ctx
      ctx.provide('systemPrompt', { tools() {} })
      await ctx.plugin(ToolsService).await()
      ctx.tools.setRoot(new NativeToolRegistry())
      const audio = { data: Buffer.from('fixture-silk'), text: '语音', format: 'silk', contentType: 'audio/silk', provider: 'xiaomi' }
      const uploads = []
      ctx.tools.register({
        name: 'qqbot_send_file', description: 'fixture QQ sender',
        parameters: { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'], additionalProperties: false },
        output: { schema: { type: 'object', properties: { messageId: { type: 'string' } }, required: ['messageId'] }, render: () => [] },
        async execute(args) {
          assert.equal(dirname(args.file_path), media, 'the default QQ media whitelist must accept the staged audio')
          assert.deepEqual(await readFile(args.file_path), audio.data)
          uploads.push(args.file_path)
          return { messageId: 'fixture-message' }
        },
      })
      try {
        const identity = await new QqIdentityReader().resolve(agent.id)
        assert.equal(identity.key, 'qqbot:bot:c2c:peer')
        const result = await createQqbotSpeechDelivery(ctx).send(audio, { agent, signal: new AbortController().signal })
        assert.equal(result.messageId, 'fixture-message')
        assert.equal(uploads.length, 1)
        assert.deepEqual(await readdir(media), [])
      } finally { await scope.dispose(); await ctx.fiber.dispose() }
    `], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, QQBOT_DATA_DIR: dataDir, HOME: userHome, USERPROFILE: userHome },
      timeout: 30000,
    })
    assert.deepEqual(await readdir(userHome), [])
  } finally { await rm(directory, { recursive: true, force: true }) }
})
