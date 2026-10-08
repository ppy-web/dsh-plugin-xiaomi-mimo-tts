// Built-artifact smoke through DSH's actual boot/Loader, with an ephemeral HTTP port.
// node test/audio-history-host.probe.mjs <installed dsh-app-boot/lib/index.js>
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const bootPath = process.argv[2]
if (!bootPath) throw new Error('Pass the installed dsh-app-boot/lib/index.js path')
const { boot } = await import(pathToFileURL(resolve(bootPath)).href)
const require = createRequire(import.meta.url)
const directory = await mkdtemp(join(tmpdir(), 'mimo-history-smoke-'))
const configPath = join(directory, 'cordis.yml')
let ctx
try {
  await writeFile(configPath, JSON.stringify([
    { id: 'web', name: pathToFileURL(require.resolve('@deepseek-ai/dsh-host-webserver')).href, config: { host: '127.0.0.1', port: 0 } },
    { id: 'tts', name: new URL('../lib/index.js', import.meta.url).href, config: { apiKey: '' } },
  ]))
  ctx = await boot('mimo-history-smoke', configPath, [])
  const { TTS_HISTORY_EMPTY_ASSET_ROUTE } = await import('../lib/shared.js')
  const url = `http://127.0.0.1:${ctx.webServer.port}${TTS_HISTORY_EMPTY_ASSET_ROUTE}`
  const asset = await readFile(new URL('../assets/ui/history-empty-whale.webp', import.meta.url))
  const get = await fetch(url)
  assert.equal(get.status, 200)
  assert.equal(get.headers.get('content-type'), 'image/webp')
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), asset)
  const head = await fetch(url, { method: 'HEAD' })
  assert.equal(head.status, 200)
  assert.equal(Number(head.headers.get('content-length')), asset.byteLength)
  assert.equal((await head.arrayBuffer()).byteLength, 0)
  const post = await fetch(url, { method: 'POST' })
  assert.equal(post.status, 405)
  assert.equal(post.headers.get('allow'), 'GET, HEAD')
  await ctx.fiber.dispose()
  ctx = undefined
  await assert.rejects(fetch(url))
  console.log(`PASS: Loader cold start, built artifact, image GET/HEAD/405 and HTTP cleanup (${fileURLToPath(new URL('../lib/index.js', import.meta.url))})`)
} finally {
  await ctx?.fiber.dispose()
  assert.ok(resolve(directory).startsWith(`${resolve(tmpdir())}${sep}mimo-history-smoke-`))
  await rm(directory, { recursive: true, force: true })
}
