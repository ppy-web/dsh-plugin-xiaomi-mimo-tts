import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { isSilk } from 'silk-wasm'
import { apply, Config } from '../lib/index.js'
import { resolveTtsSettings, TTS_CAPABILITIES_ROUTE, TTS_EXPORT_ROUTE } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'

const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')
const { AudioDownloads } = await loadClientModule('src/host/audio-downloads.ts')
const { registerOpenApiRoutes } = await loadClientModule('src/host/open-api-routes.ts')
const { writeSpeechArtifact, SPEECH_FILE_TTL_MS } = await loadClientModule('src/host/speech-files.ts')

function wav() {
  const data = Buffer.alloc(4844)
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22)
  data.writeUInt32LE(24000, 24); data.writeUInt32LE(48000, 28)
  data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34)
  data.write('data', 36); data.writeUInt32LE(4800, 40)
  return data
}

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

async function close(server) {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
}

async function withApi(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-open-api-'))
  const requests = [], routes = [], disposers = [], artifacts = []
  const upstream = createServer(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    const input = JSON.parse(body)
    requests.push({ input, headers: req.headers })
    if (options.upstream) return options.upstream(req, res, input)
    res.setHeader('content-type', 'application/json')
    const data = input.audio.format === 'mp3' ? Buffer.from('ID3test') : wav()
    res.end(JSON.stringify({ choices: [{ message: { audio: { data: data.toString('base64') } } }] }))
  })
  const upstreamBase = await listen(upstream)
  const settings = resolveTtsSettings({
    apiKey: 'sk-open-api-provider-secret', baseURL: upstreamBase,
    doubaoApiKey: 'doubao-private-key', breezeApiKey: 'breeze-private-key',
    instruction: 'private-saved-instruction', voiceDesignPrompt: 'private-voice-design',
    requestTimeoutMs: 1000,
  })
  let now = Date.now(), token = 'independent-open-api-secret'
  const host = new HostSpeechService(() => settings)
  const downloads = new AudioDownloads(() => now)
  const service = {
    capabilities: () => host.capabilities(),
    async exportAudio(request) {
      if (options.exportAudio) return options.exportAudio(request, directory)
      const artifact = await writeSpeechArtifact(await host.synthesize(request), directory)
      artifacts.push(artifact)
      return artifact
    },
  }
  registerOpenApiRoutes({
    speechSynthesis: service,
    logger: { warn() {} },
    effect(effect) { disposers.push(effect()) },
    webServer: { register(route) {
      routes.push(route)
      return () => { routes.splice(routes.indexOf(route), 1) }
    } },
  }, () => token, downloads)
  const prefix = options.prefix ?? ''
  const server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname.slice(prefix.length)
    const route = routes.find(route => route.kind === 'exact' ? route.path === path : path.startsWith(route.path))
    if (!route) { res.statusCode = 404; res.end(); return }
    Promise.resolve(route.handler(req, res)).catch(() => { res.statusCode = 500; res.end() })
  })
  const origin = await listen(server)
  const base = origin + prefix
  const auth = () => ({ authorization: `Bearer ${token}` })
  const post = (body, extra = {}) => fetch(base + TTS_EXPORT_ROUTE, {
    method: 'POST', headers: { ...auth(), 'content-type': 'application/json', ...extra }, body: JSON.stringify(body),
  })
  try {
    await run({ base, origin, settings, host, requests, directory, artifacts, auth, post, service, downloads,
      setNow(value) { now = value }, now: () => now,
      setToken(value) { token = value },
      async unload() { for (const dispose of disposers.splice(0).reverse()) await dispose() },
    })
  } finally {
    for (const dispose of disposers.reverse()) await dispose()
    await host.dispose()
    await close(server)
    await close(upstream)
    await rm(directory, { recursive: true, force: true })
  }
}

test('capabilities follow saved settings and expose actionable model features without secrets or requests', async () => {
  await withApi(async ({ host, base, auth, settings, requests }) => {
    const response = await fetch(base + TTS_CAPABILITIES_ROUTE, { headers: auth() })
    assert.equal(response.status, 200)
    const result = await response.json()
    assert.equal(result.provider, 'xiaomi')
    const byProvider = new Map(result.providers.map(provider => [provider.id, provider]))
    const xiaomi = byProvider.get('xiaomi')
    assert.equal(xiaomi.ready, true)
    const preset = xiaomi.models.find(model => model.id === 'mimo-v2.5-tts')
    assert.ok(preset.voices.some(voice => voice.id === settings.voice))
    assert.equal(preset.audioTags, true)
    assert.equal(preset.streaming, true)
    const design = xiaomi.models.find(model => model.voiceDesign)
    assert.equal(design.audioTags, false)
    assert.equal(design.streaming, false)
    const clone = byProvider.get('doubao').models.find(model => model.id === 'seed-icl-2.0')
    assert.equal(clone.customVoice, true)
    assert.equal(clone.speechInstruction, false)
    assert.equal(clone.duplex, true)
    assert.equal(byProvider.get('breeze').maxTextLength, 1000)
    assert.ok(result.http.exportFormats.includes('silk'))
    assert.equal(result.http.formats.includes('silk'), false)
    for (const secret of [settings.apiKey, settings.doubaoApiKey, settings.breezeApiKey, settings.baseURL,
      settings.instruction, settings.voiceDesignPrompt]) assert.equal(JSON.stringify(result).includes(secret), false)
    assert.equal(requests.length, 0)

    settings.provider = 'doubao'
    settings.doubaoModel = 'seed-icl-2.0'
    settings.doubaoClonedVoice = ''
    let current = host.capabilities()
    assert.equal(current.provider, 'doubao')
    assert.equal(current.providers.find(provider => provider.id === 'doubao').unavailableReason, 'voice-required')
    settings.doubaoClonedVoice = 'custom-clone-id'
    settings.apiKey = ''
    settings.breezeApiKey = 'bad\nkey'
    settings.maxTextLength = 50
    current = host.capabilities()
    assert.equal(current.providers.find(provider => provider.id === 'doubao').ready, true)
    assert.equal(current.providers.find(provider => provider.id === 'xiaomi').configured, false)
    assert.equal(current.providers.find(provider => provider.id === 'xiaomi').unavailableReason, 'api-key-not-configured')
    assert.equal(current.providers.find(provider => provider.id === 'breeze').unavailableReason, 'api-key-rejected')
    assert.equal(current.providers.find(provider => provider.id === 'breeze').maxTextLength, 50)
  })
})

test('management requires its own token, rejects cross-origin calls and observes token rotation', async () => {
  await withApi(async ({ base, origin, auth, setToken, requests }) => {
    for (const path of [TTS_CAPABILITIES_ROUTE, TTS_EXPORT_ROUTE]) {
      for (const headers of [{}, { authorization: 'Bearer sk-open-api-provider-secret' },
        { origin, 'sec-fetch-site': 'same-origin' }]) {
        const response = await fetch(base + path, { method: path === TTS_EXPORT_ROUTE ? 'POST' : 'GET', headers })
        assert.equal(response.status, 401)
        assert.equal((await response.json()).error, 'open-api-unauthorized')
      }
      for (const originHeader of ['https://other.example', 'null', 'not-an-origin']) {
        const response = await fetch(base + path, {
          method: path === TTS_EXPORT_ROUTE ? 'POST' : 'GET', headers: { ...auth(), origin: originHeader },
        })
        assert.equal(response.status, 403)
      }
    }
    const previous = auth()
    setToken('rotated-token')
    assert.equal((await fetch(base + TTS_CAPABILITIES_ROUTE, { headers: previous })).status, 401)
    assert.equal((await fetch(base + TTS_CAPABILITIES_ROUTE, { headers: { ...auth(), origin } })).status, 200)
    setToken('')
    const disabled = await fetch(base + TTS_CAPABILITIES_ROUTE, { headers: previous })
    assert.equal(disabled.status, 503)
    assert.equal((await disabled.json()).error, 'open-api-disabled')
    assert.equal(requests.length, 0)
  })
})

for (const prefix of ['', '/tools/dsh']) test(`exports playable audio with repeatable GET and HEAD downloads under '${prefix}'`, async () => {
  await withApi(async ({ post, base, requests }) => {
    for (const format of ['wav', 'mp3', 'silk']) {
      const response = await post({ text: '下载音频。', format, speechInstruction: '温柔' })
      assert.equal(response.status, 201)
      const result = await response.json()
      assert.equal(result.format, format)
      assert.equal('path' in result, false)
      assert.ok(Date.parse(result.expiresAt) > Date.now())
      const url = new URL(result.url, response.url)
      assert.ok(url.href.startsWith(base + '/plugins/xiaomi-mimo-tts/audio/'))
      const head = await fetch(url, { method: 'HEAD' })
      assert.equal(head.status, 200)
      assert.equal(Number(head.headers.get('content-length')), result.size)
      assert.equal((await head.arrayBuffer()).byteLength, 0)
      const audio = await fetch(url)
      assert.equal(audio.status, 200)
      assert.equal(audio.headers.get('content-type'), result.contentType)
      assert.equal(audio.headers.get('cache-control'), 'no-store')
      const bytes = Buffer.from(await audio.arrayBuffer())
      assert.equal(bytes.length, result.size)
      if (format === 'silk') assert.equal(isSilk(bytes), true)
      else if (format === 'wav') assert.deepEqual(bytes, wav())
      else assert.equal(bytes.toString('ascii', 0, 3), 'ID3')
      assert.equal((await fetch(url)).status, 200)
    }
    assert.equal(requests.length, 3, 'downloading an artifact must not synthesize it again')
    assert.ok(requests.every(request => request.headers.authorization === 'Bearer sk-open-api-provider-secret'))
  }, { prefix })
})

test('export validation rejects unsafe or invalid requests before synthesis', async () => {
  await withApi(async ({ base, auth, post, requests }) => {
    for (const [body, code] of [
      [{ text: 'hello', path: '../outside.wav' }, 'unknown-request-field'],
      [{ text: 'hello', apiKey: 'injected-key' }, 'unknown-request-field'],
      [{ text: 'hello', baseURL: 'https://other.example' }, 'unknown-request-field'],
      [{ text: 'hello', signal: {} }, 'unknown-request-field'],
      [{ text: 'hello', splitLongText: true }, 'unknown-request-field'],
      [{ text: 'hello', format: 'pcm' }, 'invalid-audio-format'],
      [{ text: 'hello', format: null }, 'invalid-audio-format'],
      [{ text: '' }, 'text-required'],
      [{ text: 'hello', provider: 'unknown' }, 'invalid-provider'],
      [{ text: 'hello', model: 'unknown' }, 'invalid-model'],
      [[], 'invalid-request'],
    ]) {
      const response = await post(body)
      assert.equal(response.status, 400)
      assert.equal((await response.json()).error, code)
    }
    const wrongType = await fetch(base + TTS_EXPORT_ROUTE, { method: 'POST', headers: auth(), body: '{}' })
    assert.equal(wrongType.status, 415)
    for (const [body, code, status] of [['{', 'invalid-json', 400], [' '.repeat(128 * 1024 + 1), 'request-body-too-large', 413]]) {
      const response = await fetch(base + TTS_EXPORT_ROUTE, { method: 'POST', headers: { ...auth(), 'content-type': 'application/json' }, body })
      assert.equal(response.status, status)
      assert.equal((await response.json()).error, code)
    }
    assert.equal(requests.length, 0)
  })
})

test('expired, unknown and missing downloads return 404 while cleanup preserves unrelated files', async () => {
  await withApi(async ({ post, directory, downloads, setNow, now, artifacts }) => {
    const unrelated = join(directory, 'user-audio.wav')
    await writeFile(unrelated, 'keep')
    const response = await post({ text: '短期下载', format: 'wav' })
    const result = await response.json()
    const url = new URL(result.url, response.url)
    assert.equal((await fetch(new URL('audio/' + '0'.repeat(64), response.url))).status, 404)
    assert.equal((await fetch(new URL('audio/..%2F..%2Fuser-audio.wav', response.url))).status, 404)
    assert.equal((await fetch(new URL('audio/nested/' + result.audioId, response.url))).status, 404)
    setNow(now() + SPEECH_FILE_TTL_MS)
    assert.equal((await fetch(url)).status, 404, 'expiry is enforced before the periodic cleanup')
    await assert.rejects(readFile(artifacts[0].path), { code: 'ENOENT' })
    assert.equal(await readFile(unrelated, 'utf8'), 'keep')

    const second = await post({ text: '已移除文件', format: 'wav' })
    const missing = await second.json()
    await artifacts[1].remove()
    assert.equal((await fetch(new URL(missing.url, second.url))).status, 404)
    const third = await post({ text: '定时清理', format: 'wav' })
    await third.json()
    setNow(now() + SPEECH_FILE_TTL_MS)
    await downloads.sweep()
    await assert.rejects(readFile(artifacts[2].path), { code: 'ENOENT' })
    assert.equal(await readFile(unrelated, 'utf8'), 'keep')
  })
})

test('unloading withdraws routes and removes only published files, including late publications', async () => {
  await withApi(async ({ post, downloads, directory, unload }) => {
    const unrelated = join(directory, 'other.txt')
    await writeFile(unrelated, 'keep')
    const localOnly = await writeSpeechArtifact({ data: wav(), format: 'wav', contentType: 'audio/wav' }, directory)
    const response = await post({ text: '卸载清理', format: 'wav' })
    const result = await response.json()
    const url = new URL(result.url, response.url)
    await unload()
    assert.equal((await fetch(url)).status, 404)
    assert.deepEqual(await readFile(localOnly.path), wav(), 'ordinary Host exports must survive download URL cleanup')
    const late = await writeSpeechArtifact({ data: wav(), format: 'wav', contentType: 'audio/wav' }, directory)
    await assert.rejects(downloads.publish(late), error => error.code === 'speech-service-disposed')
    await assert.rejects(readFile(late.path), { code: 'ENOENT' })
    assert.equal(await readFile(unrelated, 'utf8'), 'keep')
  })
})

test('disconnecting an export request cancels synthesis and does not publish an artifact', async () => {
  let started, canceled
  const ready = new Promise(resolve => { started = resolve })
  const stopped = new Promise(resolve => { canceled = resolve })
  await withApi(async ({ base, auth, directory }) => {
    const controller = new AbortController()
    const request = fetch(base + TTS_EXPORT_ROUTE, {
      method: 'POST', headers: { ...auth(), 'content-type': 'application/json' },
      body: JSON.stringify({ text: '等待合成' }), signal: controller.signal,
    })
    const rejected = assert.rejects(request, error => error.name === 'AbortError')
    await ready
    controller.abort()
    await rejected
    await stopped
    assert.deepEqual(await readdir(directory), [])
  }, { exportAudio(request) {
    started()
    return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => {
      canceled()
      reject(new Error('canceled'))
    }, { once: true }))
  } })
})

test('export failures return codes without exposing upstream secrets or prose', async () => {
  await withApi(async ({ post }) => {
    const response = await post({ text: '上游失败', format: 'wav' })
    assert.equal(response.status, 403)
    assert.deepEqual(await response.json(), { error: 'xiaomi-api-error' })
  }, { upstream(_req, res) {
    res.statusCode = 403
    res.end(JSON.stringify({ error: 'rejected sk-open-api-provider-secret private upstream details' }))
  } })
})

test('unloading cancels pending exports and closes their HTTP responses', async () => {
  let started
  const ready = new Promise(resolve => { started = resolve })
  await withApi(async ({ post, unload, directory }) => {
    const pending = post({ text: '卸载时停止' })
    await ready
    await unload()
    const response = await pending
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error, 'speech-service-disposed')
    assert.deepEqual(await readdir(directory), [])
  }, { exportAudio(request) {
    started()
    return new Promise((_resolve, reject) => request.signal.addEventListener('abort', () => reject(new Error('disposed')), { once: true }))
  } })
})

test('default Web entry registers the new routes when the Host service becomes available and unloads them', async () => {
  const ctx = new Context(), routes = new Map()
  ctx.provide('webServer', {
    register(route) { routes.set(route.path, route); return () => routes.delete(route.path) },
    registerUpgrade() { return () => {} },
  })
  const fiber = ctx.plugin({ apply, Config }, { openApiToken: 'registration-token' })
  try {
    for (let i = 0; i < 10 && !routes.has(TTS_CAPABILITIES_ROUTE); i++) await settle()
    assert.ok(ctx.get('speechSynthesis'))
    assert.ok(routes.has(TTS_CAPABILITIES_ROUTE))
    assert.ok(routes.has(TTS_EXPORT_ROUTE))
    await fiber.dispose()
    assert.equal(routes.has(TTS_CAPABILITIES_ROUTE), false)
    assert.equal(routes.has(TTS_EXPORT_ROUTE), false)
  } finally { await ctx.fiber.dispose() }
})
