import assert from 'node:assert/strict'
import test from 'node:test'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { gzipSync, gunzipSync } from 'node:zlib'
import { WebSocket, WebSocketServer } from 'ws'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { PassportRecognition } = await loadClientModule('src/passport/recognition.ts')
const { PcmUtterances } = await loadClientModule('src/passport/audio.ts')
const tick = () => new Promise(resolve => setImmediate(resolve))

test('cloud recognition reuses its own saved key independently of TTS selection and Host ASR', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let submitted
  globalThis.fetch = async (url, options) => {
    submitted = { url, ...options, body: JSON.parse(options.body) }
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: ' 转写结果 ' } }] })
  }
  const settings = resolveTtsSettings({ provider: 'breeze', apiKey: 'saved-xiaomi', doubaoApiKey: 'saved-doubao' })
  const service = new PassportRecognition(() => settings)
  const choices = service.choices()
  assert.ok(!JSON.stringify(choices).includes('saved-'))
  const recognizer = service.recognizer('xiaomi')
  recognizer.check()
  const input = recognizer.create(new AbortController().signal, 32000)
  input.append(Buffer.alloc(640)); input.append(Buffer.alloc(640))
  assert.equal(submitted, undefined, 'Xiaomi waits for local segmentation')
  assert.equal(await input.finish(), '转写结果')
  assert.equal(submitted.headers['api-key'], 'saved-xiaomi')
  assert.equal(submitted.body.model, 'mimo-v2.5-asr')
  const audio = Buffer.from(submitted.body.messages[0].content[0].input_audio.data.split(',')[1], 'base64')
  assert.equal(audio.readUInt32LE(24), 16000)
  assert.equal(audio.length, 44 + 1280)
  assert.throws(() => service.recognizer('host').check(), /passport-asr-unavailable/)
})

test('cloud failures expose stable codes and cancellation rejects a late transcript', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const service = new PassportRecognition(() => resolveTtsSettings({ apiKey: 'secret' }))
  for (const [status, code] of [[401, 'auth-failed'], [403, 'permission-denied'], [402, 'quota-exceeded'], [429, 'rate-limited']]) {
    globalThis.fetch = async () => Response.json({ error: { message: 'secret', code: '' } }, { status })
    const input = service.recognizer('xiaomi').create(new AbortController().signal, 640)
    input.append(Buffer.alloc(640))
    await assert.rejects(input.finish(), { message: `passport-asr-${code}` })
  }
  const result = Promise.withResolvers(), controller = new AbortController()
  globalThis.fetch = () => result.promise
  const input = service.recognizer('xiaomi').create(controller.signal, 640)
  input.append(Buffer.alloc(640)); const pending = input.finish(); controller.abort()
  result.resolve(Response.json({ choices: [{ finish_reason: 'stop', message: { content: 'late' } }] }))
  await assert.rejects(pending, { name: 'AbortError' })
})

function response(text, last = false) {
  const body = gzipSync(Buffer.from(JSON.stringify({ result: { text } })))
  const header = Buffer.alloc(12)
  header[0] = 0x11; header[1] = last ? 0x93 : 0x91; header[2] = 0x11
  header.writeInt32BE(last ? -1 : 1, 4); header.writeUInt32BE(body.length, 8)
  return Buffer.concat([header, body])
}

for (const [source, endpoint] of [['doubao', 'bigmodel_async'], ['doubao-nostream', 'bigmodel_nostream']]) for (const plan of [false, true]) test(`Doubao ${source} uploads and returns the final result with ${plan ? 'Plan' : 'standard'} credentials`, async t => {
  const server = createServer(), wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    assert.equal(req.headers['x-api-key'], 'doubao-key')
    if (plan && !req.url.includes('/plan/')) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws))
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(async () => { for (const ws of wss.clients) ws.terminate(); wss.close(); await new Promise(resolve => server.close(resolve)) })
  const paths = [], uploaded = Promise.withResolvers(), frames = []
  wss.on('connection', ws => ws.on('message', raw => {
    const frame = Buffer.from(raw), kind = frame[1] >> 4, flags = frame[1] & 15
    if (kind === 1) return
    const pcm = gunzipSync(frame.subarray(12)); frames.push(pcm)
    if (flags & 2) ws.send(response('最终整句', true))
    else { ws.send(response('临时结果')); uploaded.resolve() }
  }))
  const service = new PassportRecognition(() => resolveTtsSettings({ provider: 'xiaomi', doubaoApiKey: 'doubao-key' }), (url, headers) => {
    paths.push(new URL(url).pathname)
    return new WebSocket(`ws://127.0.0.1:${server.address().port}${new URL(url).pathname}`, { headers })
  })
  const input = service.recognizer(source).create(new AbortController().signal, 32000)
  input.append(Buffer.alloc(6400, 1)); await uploaded.promise
  assert.equal(Buffer.concat(frames).length, 6400)
  input.append(Buffer.alloc(640, 2)); assert.equal(await input.finish(), '最终整句')
  assert.deepEqual(Buffer.concat(frames), Buffer.concat([Buffer.alloc(6400, 1), Buffer.alloc(640, 2)]))
  const next = service.recognizer(source).create(new AbortController().signal, 32000)
  next.append(Buffer.alloc(640)); assert.equal(await next.finish(), '最终整句')
  assert.deepEqual(paths, plan
    ? [`/api/v3/sauc/${endpoint}`, `/api/v3/plan/sauc/${endpoint}`, `/api/v3/plan/sauc/${endpoint}`]
    : [`/api/v3/sauc/${endpoint}`, `/api/v3/sauc/${endpoint}`])
})

test('both Doubao choices reflect the saved key without exposing it', () => {
  for (const key of ['', 'secret-key']) {
    const service = new PassportRecognition(() => resolveTtsSettings({ doubaoApiKey: key }))
    const choices = service.choices().filter(choice => choice.id.startsWith('doubao'))
    assert.deepEqual(choices, [{ id: 'doubao', configured: !!key }, { id: 'doubao-nostream', configured: !!key }])
    for (const { id } of choices) {
      if (key) service.recognizer(id).check()
      else assert.throws(() => service.recognizer(id).check(), /passport-asr-key-required/)
    }
  }
})

test('segmentation streams the pre-roll once, retains all speech and does not submit short noise', () => {
  const chunks = [], discarded = []
  const options = { silenceMs: 200, minSpeechMs: 100, maxRecordingSeconds: 2, speechThreshold: 0.01 }
  const capture = new PcmUtterances(options, (pcm, first) => chunks.push({ pcm: Buffer.from(pcm), first }), code => discarded.push(code))
  capture.append(Buffer.alloc(6400))
  const tone = Buffer.alloc(6400); for (let i = 0; i < tone.length; i += 2) tone.writeInt16LE(5000, i)
  capture.append(tone)
  const wave = capture.append(Buffer.alloc(6400))
  assert.deepEqual(Buffer.concat(chunks.map(chunk => chunk.pcm)), wave.subarray(44))
  assert.equal(chunks.filter(chunk => chunk.first).length, 1)
  chunks.length = 0
  capture.append(tone.subarray(0, 640)); capture.append(Buffer.alloc(6400))
  assert.equal(chunks.length, 0)
  assert.deepEqual(discarded, ['passport-speech-too-short'])
})


test('ASR protocol errors distinguish invalid audio from permissions and never return upstream prose', async () => {
  const { doubaoRecognitionError } = await loadClientModule('src/passport/asr-error.ts')
  assert.equal(doubaoRecognitionError(45000151).message, 'passport-asr-invalid-response')
  assert.equal(doubaoRecognitionError(45000001).message, 'passport-asr-invalid-response')
  assert.equal(doubaoRecognitionError(45000002).message, 'passport-no-speech')
  assert.equal(doubaoRecognitionError(55001010).message, 'passport-asr-timeout')
  assert.equal(doubaoRecognitionError(55000000, 'quota exceeded secret-key').message, 'passport-asr-quota-exceeded')
})
