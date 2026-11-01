import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { mossVoiceChoices, normalizeMossBaseURL, parseMossDemoList } = await import('../lib/shared.js')
const { probeMoss, synthesizeMoss } = await loadClientModule('src/host/moss.ts')
const { registerMossRoutes } = await loadClientModule('src/host/moss-routes.ts')
const { MOSS_DEPLOY_PROMPT } = await loadClientModule('src/client/settings/moss-deploy-prompt.ts')

const WAV = (() => {
  const bytes = Buffer.alloc(48)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(40, 4)
  bytes.write('WAVE', 8, 'ascii')
  bytes.write('fmt ', 12, 'ascii')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(48000, 24)
  bytes.writeUInt32LE(96000, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36, 'ascii')
  bytes.writeUInt32LE(4, 40)
  return bytes
})()

const DEMO_HTML = `<html><script>
const DEMOS = [{"id": "demo-1", "name": "🇨🇳 欢迎", "prompt_speech": "assets\\\\audio\\\\zh_1.wav", "text": "hello"}, {"id": "demo-2", "name": "Bracket ] and \\"quote\\"", "prompt_speech": "assets/audio/zh_2.wav", "text": "a ] b \\"c\\""}];
</script></html>`

async function withMossServer(run, options = {}) {
  const requests = []
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8')
      requests.push({ method: req.method, url: req.url, body })
      if (req.url === '/health') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ status: 'ok', device: 'cpu', cpu_runtime_loaded: true, text_normalization_status: 'ready' }))
      } else if (req.url === '/api/warmup-status') {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ state: 'ready', progress: 1, message: 'Warmup complete.', ready: true, failed: false }))
      } else if (req.url === '/') {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(DEMO_HTML)
      } else if (req.url === '/api/generate' && req.method === 'POST') {
        if (options.failGenerate === true) {
          res.statusCode = 400
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'demo_id is required unless prompt speech is uploaded.' }))
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ audio_base64: WAV.toString('base64'), sample_rate: 48000 }))
      } else {
        res.statusCode = 404
        res.end()
      }
    })
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const baseURL = `http://127.0.0.1:${server.address().port}`
  try {
    await run({ baseURL, requests })
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

test('MOSS base URL normalization keeps an optional path and rejects unsafe forms', () => {
  assert.equal(normalizeMossBaseURL('http://127.0.0.1:18083/'), 'http://127.0.0.1:18083')
  assert.equal(normalizeMossBaseURL(' http://127.0.0.1:18083/moss// '), 'http://127.0.0.1:18083/moss')
  assert.throws(() => normalizeMossBaseURL('ftp://127.0.0.1:18083'), /moss-invalid-url/u)
  assert.throws(() => normalizeMossBaseURL('http://user:pass@127.0.0.1:18083'), /moss-invalid-url/u)
  assert.throws(() => normalizeMossBaseURL(''), /moss-invalid-url/u)
})

test('MOSS demo metadata parses names, reference audio and JSON escapes', () => {
  const voices = parseMossDemoList(DEMO_HTML)
  assert.deepEqual(voices, [
    { id: 'demo-1', name: '🇨🇳 欢迎', promptSpeech: 'assets\\audio\\zh_1.wav' },
    { id: 'demo-2', name: 'Bracket ] and "quote"', promptSpeech: 'assets/audio/zh_2.wav' },
  ])
  assert.deepEqual(parseMossDemoList('<html>no demo list</html>'), [])
  assert.deepEqual(parseMossDemoList('const DEMOS = [{"id": ""}, null, 1]'), [])
})

test('stored MOSS voices stay selectable when the service list is unavailable', () => {
  assert.deepEqual(mossVoiceChoices([{ id: 'demo-1', name: 'One' }], 'demo-9', 'Saved'), [
    { id: 'demo-9', name: 'Saved' },
    { id: 'demo-1', name: 'One' },
  ])
  assert.deepEqual(mossVoiceChoices([{ id: 'demo-1', name: 'One' }], 'demo-1', 'Saved'), [{ id: 'demo-1', name: 'One' }])
})

test('probing a MOSS server returns health, warmup and demo voices', async () => {
  await withMossServer(async ({ baseURL, requests }) => {
    const result = await probeMoss(baseURL, new AbortController().signal)
    assert.equal(result.baseURL, baseURL)
    assert.equal(result.health.status, 'ok')
    assert.equal(result.health.device, 'cpu')
    assert.equal(result.health.cpuRuntimeLoaded, true)
    assert.equal(result.warmup?.ready, true)
    assert.deepEqual(result.voices.map(voice => voice.id), ['demo-1', 'demo-2'])
    assert.deepEqual(requests.map(request => request.url), ['/health', '/api/warmup-status', '/'])
  })
})

test('MOSS synthesis posts the selected demo voice and returns the WAV envelope', async () => {
  await withMossServer(async ({ baseURL, requests }) => {
    const audio = await synthesizeMoss(baseURL, 'demo-2', '你好，世界', new AbortController().signal, { maxAudioBytes: 1024 * 1024 })
    assert.deepEqual(audio, WAV)
    const request = requests.find(item => item.url === '/api/generate')
    assert.ok(request !== undefined)
    assert.match(request.body, /name="text"/u)
    assert.match(request.body, /你好，世界/u)
    assert.match(request.body, /name="demo_id"/u)
    assert.match(request.body, /demo-2/u)
  })
})

test('MOSS synthesis requires a voice and surfaces upstream errors', async () => {
  await withMossServer(async ({ baseURL }) => {
    await assert.rejects(synthesizeMoss(baseURL, '  ', 'hello', new AbortController().signal, { maxAudioBytes: 1024 * 1024 }), error => error.code === 'moss-voice-required')
  })
  await withMossServer(async ({ baseURL }) => {
    await assert.rejects(synthesizeMoss(baseURL, 'demo-1', 'hello', new AbortController().signal, { maxAudioBytes: 1024 * 1024 }), error => error.code === 'moss-api-error' && /demo_id is required/u.test(error.message))
  }, { failGenerate: true })
})

test('MOSS deployment prompt states goals, addresses and directions without code', () => {
  for (const needle of [
    'Windows',
    '不使用管理员权限',
    '不要 conda',
    'uv-x86_64-pc-windows-msvc.zip',
    'https://github.com/OpenMOSS/MOSS-TTS-Nano',
    'OpenMOSS-Team/MOSS-TTS-Nano',
    'OpenMOSS-Team/MOSS-Audio-Tokenizer-Nano',
    '127.0.0.1:18083',
    'WeTextProcessing',
    'pynini',
    'wetext',
    'HF_HOME',
    'infer.py',
    'app.py',
    '/health',
    '/api/warmup-status',
    '/api/generate',
  ]) assert.ok(MOSS_DEPLOY_PROMPT.includes(needle), `deployment prompt should include: ${needle}`)
  for (const forbidden of ['uv pip install', 'uv python install', 'git clone', 'python -m', 'python infer.py', 'field(default_factory', 'queue.Queue()']) {
    assert.ok(!MOSS_DEPLOY_PROMPT.includes(forbidden), `deployment prompt should not embed the concrete command: ${forbidden}`)
  }
})

test('Host MOSS routes probe and synthesize over same-origin JSON', async () => {
  const routes = new Map()
  const disposers = []
  const ctx = {
    effect(effect) { disposers.push(effect()) },
    webServer: {
      register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) },
    },
  }
  const settings = resolveTtsSettings({ mossVoice: 'demo-1' })
  await withMossServer(async ({ baseURL }) => {
    registerMossRoutes(ctx, () => settings)
    const server = createServer((req, res) => {
      const handler = routes.get(new URL(req.url, 'http://localhost').pathname)
      if (handler) void handler(req, res).catch(error => { res.statusCode = 500; res.end(String(error)) })
      else { res.statusCode = 404; res.end() }
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const base = `http://127.0.0.1:${server.address().port}`
    try {
      const probe = await fetch(`${base}/plugins/xiaomi-mimo-tts/moss/probe`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ baseURL }),
      })
      assert.equal(probe.status, 200)
      const probeBody = await probe.json()
      assert.equal(probeBody.ok, true)
      assert.deepEqual(probeBody.voices.map(voice => voice.id), ['demo-1', 'demo-2'])

      const synth = await fetch(`${base}/plugins/xiaomi-mimo-tts/moss/synthesize`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '你好', baseURL, voice: 'demo-2' }),
      })
      assert.equal(synth.status, 200)
      assert.equal(synth.headers.get('content-type'), 'audio/wav')
      assert.deepEqual(Buffer.from(await synth.arrayBuffer()), WAV)

      const plain = await fetch(`${base}/plugins/xiaomi-mimo-tts/moss/probe`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{}',
      })
      assert.equal(plain.status, 415)
    } finally {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
      for (const dispose of disposers.reverse()) dispose()
    }
  })
})
