import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import SettingsForms from '@deepseek-ai/dsh-settings'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { createServer as createHttpServer } from 'node:http'
import * as passport from '../lib/passport.js'

const id = 'speech-delivery-passport'
const token = 'passport-lifecycle-device-token-123456'
const pause = () => new Promise(resolve => setTimeout(resolve, 10))
async function until(check) {
  const deadline = Date.now() + 5000
  while (!await check()) { assert.ok(Date.now() < deadline, 'Host lifecycle did not settle'); await pause() }
}
async function freePort() {
  const server = createServer().listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function host(t, config = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'passport-lifecycle-'))
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  await ctx.plugin(Loader)
  ctx.loader.internal = { version: 'v2', async import(name) { assert.equal(name, 'dsh-xiaomi-tts/passport'); return passport } }
  await ctx.loader.root.update([{ id, name: 'dsh-xiaomi-tts/passport', config }])
  await ctx.loader.await()
  // Keep persistence isolated while using the real Loader, schema projection and settings mutations.
  ctx.provide('profileContext', { home: directory, name: 'passport-test' })
  ctx.provide('configEditor', {
    documentPath: join(directory, 'dsh.yml'),
    entries: () => [...ctx.loader.entries()],
    configuration: () => [...ctx.loader.entries()].map(entry => ({ entry, inherited: {}, override: entry.options.config ?? {} })),
    async edit(entry, change) {
      await entry.update({ config: change(structuredClone(entry.options.config ?? {}), {}) })
      await ctx.loader.await()
    },
  })
  await ctx.plugin(SettingsForms)
  const routes = new Map()
  ctx.provide('webServer', { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } })
  const web = createHttpServer((req, res) => {
    const handler = routes.get(req.url)
    if (typeof handler === 'function') handler(req, res)
    else { res.writeHead(404); res.end() }
  }).listen(0, '127.0.0.1')
  await once(web, 'listening')
  t.after(() => new Promise(resolve => web.close(resolve)))
  const status = async () => (await fetch(`http://127.0.0.1:${web.address().port}/plugins/xiaomi-mimo-tts/passport-status`)).json()
  const view = () => ctx.settings.describe({ redactSecrets: true }).find(value => value.ns === id)
  const registered = []
  const services = () => ctx.plugin({ name: 'passport-test-services', apply(child) {
    child.provide('speechSynthesis', { registerDelivery(adapter) { registered.push(adapter); return () => registered.splice(registered.indexOf(adapter), 1) } })
    for (const name of ['speechToText', 'agents', 'agentPresets', 'agentDefaultModel']) child.provide(name, {})
  } })
  return { ctx, view, registered, services, status, webBaseURL: `http://127.0.0.1:${web.address().port}`, entry: ctx.loader.resolve(id) }
}

test('live status rejects cross-origin reads and device artwork is available', async t => {
  const run = await host(t)
  const url = `${run.webBaseURL}/plugins/xiaomi-mimo-tts/passport-status`
  for (const headers of [{ origin: 'https://foreign.example' }, { 'sec-fetch-site': 'cross-site' }, { origin: 'null' }]) {
    assert.equal((await fetch(url, { headers })).status, 403)
  }
  const response = await fetch(url)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /no-store/u)
  for (const name of ['passport-device.webp', 'passport-screen.webp']) {
    const asset = await fetch(`${run.webBaseURL}/plugins/xiaomi-mimo-tts/${name}`)
    assert.equal(asset.status, 200)
    assert.equal(asset.headers.get('content-type'), 'image/webp')
    assert.ok((await asset.arrayBuffer()).byteLength > 0)
  }
})

test('recognition test probes the selected provider and rejects untrusted requests', async t => {
  const run = await host(t)
  const calls = []
  let result = ''
  run.ctx.provide('passportRecognition', {
    recognizer(source) {
      calls.push(source)
      return { check() {}, create() { return {
        append(pcm) { assert.equal(pcm.length, 32000); assert.ok(pcm.every(byte => byte === 0)) },
        async finish() { if (result instanceof Error) throw result; if (result) throw new Error(result); return '' },
        cancel() {},
      } } }
    },
  })
  const url = `${run.webBaseURL}/plugins/xiaomi-mimo-tts/passport-asr-test`
  const post = (source, headers = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ source }) })
  assert.equal((await post('xiaomi', { origin: 'https://foreign.example' })).status, 403)
  assert.equal((await post('xiaomi')).status, 403)
  assert.equal((await post('bad', { 'x-dsh-speech-adapter': '1' })).status, 400)
  assert.equal(calls.length, 0)
  assert.equal((await post('doubao', { 'x-dsh-speech-adapter': '1' })).status, 200)
  assert.deepEqual(calls, ['doubao'])
  result = 'passport-no-speech'
  assert.equal((await post('xiaomi', { origin: run.webBaseURL })).status, 200)
  result = 'passport-asr-auth-failed'
  const failed = await post('xiaomi', { origin: run.webBaseURL })
  assert.equal(failed.status, 502)
  assert.deepEqual(await failed.json(), { error: 'passport-asr-auth-failed' })
  result = Object.assign(new Error('passport-asr-permission-denied'), { upstreamStatus: 403, upstreamCode: 45000123 })
  const details = await post('doubao', { origin: run.webBaseURL })
  assert.deepEqual(await details.json(), { error: 'passport-asr-permission-denied', upstreamStatus: 403, upstreamCode: 45000123 })
  result = 'passport-asr-secret-key'
  const unsafe = await post('xiaomi', { origin: run.webBaseURL })
  assert.deepEqual(await unsafe.json(), { error: 'passport-recognition-failed' })
})

test('cloud ASR listens without Host speechToText and exposes only credential availability', async t => {
  const run = await host(t, { port: await freePort(), accessToken: token, asrProvider: 'xiaomi' })
  await run.ctx.plugin({ name: 'cloud-services', apply(child) {
    child.provide('speechSynthesis', { registerDelivery() { return () => {} } })
    child.provide('passportRecognition', new passport.PassportRecognition(() => ({ apiKey: 'private-cloud-key', doubaoApiKey: '' })))
    for (const name of ['agents', 'agentPresets', 'agentDefaultModel']) child.provide(name, {})
  } })
  await until(async () => (await run.status()).listening)
  const status = await run.status()
  assert.equal(status.servicesReady, true)
  assert.equal(status.recognitionReady, true)
  assert.equal(status.asrProvider, 'xiaomi')
  assert.equal(run.ctx.get('speechToText'), undefined)
  assert.equal(JSON.stringify(status).includes('private-cloud-key'), false)
  assert.equal(status.recognitionChoices.find(c => c.id === 'doubao').configured, false)
})

test('fresh enabled Passport exposes editable Host settings without a token or ASR services', async t => {
  const port = await freePort()
  const run = await host(t, { port })
  assert.equal(run.entry.fiber.state, 2)
  const view = run.view()
  assert.ok(view)
  assert.equal(view.autoGenerate, false)
  assert.equal(view.value.host, '127.0.0.1')
  assert.equal(Object.hasOwn(view.value, 'accessToken'), false)
  assert.ok(view.secrets.some(value => value.path[0] === 'accessToken'))
  assert.equal((await run.status()).configured, false)
  for (const path of ['missing', 'constructor', 'toString', '__defineSetter__']) {
    const response = await fetch(`${run.webBaseURL}/${path}`)
    assert.equal(response.status, 404)
  }
  await assert.rejects(fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1000) }))
  await run.services()
  await pause()
  assert.equal(run.registered.length, 0, 'unconfigured components must not offer delivery')
  assert.ok(run.view(), 'waiting for configuration must not remove the form')
})

test('saving credentials activates the listener, rotates tokens and preserves the configuration owner', async t => {
  const port = await freePort(), run = await host(t, { port }), owner = run.entry.fiber
  const service = run.services()
  await service
  await run.ctx.settings.mutate(id, [{ op: 'set', path: ['accessToken'], value: token }], run.view().revision)
  const status = async value => {
    try { return (await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Authorization: `Bearer ${value}` }, signal: AbortSignal.timeout(500) })).status } catch { return 0 }
  }
  await until(async () => await status(token) === 200)
  assert.equal(run.entry.fiber, owner)
  assert.equal(run.registered.length, 1)
  const credentialStatus = await run.status()
  assert.equal(credentialStatus.configured, true)
  assert.ok(!JSON.stringify(credentialStatus).includes(token))
  const accepted = run.view()
  assert.equal(Object.hasOwn(accepted.value, 'accessToken'), false)
  assert.ok(accepted.secrets.some(value => value.path[0] === 'accessToken' && value.set))
  await run.ctx.settings.mutate(id, [{ op: 'set', path: ['accessToken'], value: `${token}-rotated` }], accepted.revision)
  await until(async () => await status(`${token}-rotated`) === 200 && await status(token) === 401)
  assert.equal(run.registered.length, 1)
  await service.dispose()
  await until(async () => await status(`${token}-rotated`) === 0)
  assert.equal(run.registered.length, 0)
  assert.ok(run.view(), 'loss of runtime services must leave the configuration editable')
})

test('a failed listener leaves Host settings editable so the port can be repaired', async t => {
  const occupied = createServer().listen(0, '127.0.0.1')
  await once(occupied, 'listening')
  t.after(() => new Promise(resolve => occupied.close(resolve)))
  const run = await host(t, { port: occupied.address().port, accessToken: token })
  await run.services()
  await pause()
  assert.ok(run.view())
  assert.equal(run.entry.fiber.state, 2)
  const port = await freePort()
  await run.ctx.settings.mutate(id, [{ op: 'set', path: ['port'], value: port }], run.view().revision)
  await until(async () => {
    try { return (await fetch(`http://127.0.0.1:${port}/api/health`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(500) })).ok } catch { return false }
  })
  assert.equal(run.registered.length, 1)
})
