import assert from 'node:assert/strict'
import test from 'node:test'
import { PassThrough } from 'node:stream'

import { asrRequestBody, handleTranscribeStream, validateAsrWav } from '../lib/asr-host.js'
import { ASR_MODEL } from '../lib/shared.js'

const encoder = new TextEncoder()

function wavBytes(frames = 160) {
  const pcm = Int16Array.from({ length: frames }, (_, index) => (index % 7) - 3)
  const wav = new Uint8Array(44 + pcm.length * 2)
  const view = new DataView(wav.buffer)
  Buffer.from(wav.buffer).write('RIFF', 0, 'ascii')
  view.setUint32(4, wav.byteLength - 8, true)
  Buffer.from(wav.buffer).write('WAVE', 8, 'ascii')
  Buffer.from(wav.buffer).write('fmt ', 12, 'ascii')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  Buffer.from(wav.buffer).write('data', 36, 'ascii')
  view.setUint32(40, pcm.length * 2, true)
  wav.set(new Uint8Array(pcm.buffer, 0, pcm.length * 2), 44)
  return wav
}

function sseEvent(text) {
  return encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
}

function makeRequestResponse({ method = 'POST', headers = { 'content-type': 'audio/wav', 'sec-fetch-site': 'same-origin' }, body = wavBytes() } = {}) {
  const req = new PassThrough()
  req.method = method
  req.headers = headers
  req.url = '/plugins/xiaomi-mimo-tts/transcribe-stream'
  const res = new PassThrough()
  res.statusCode = 200
  res.headers = {}
  res.setHeader = (name, value) => { res.headers[String(name).toLowerCase()] = value }
  res.getHeader = (name) => res.headers[String(name).toLowerCase()]
  res.destroyed = false
  if (body !== null) req.end(body)
  else req.end()
  return { req, res }
}

function collectResponse(res) {
  return new Promise((resolve) => {
    const chunks = []
    res.on('data', (chunk) => chunks.push(chunk))
    res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

const baseDeps = {
  apiKey: 'sk-test',
  baseURL: 'https://upstream.test/v1',
  requestTimeoutMs: 5000,
}

test('upstream body is one mimo-v2.5-asr request with a Data URL and auto language', () => {
  const body = asrRequestBody('QUJD')
  assert.equal(body.model, ASR_MODEL)
  assert.equal(body.stream, true)
  assert.deepEqual(body.asr_options, { language: 'auto' })
  assert.equal(body.messages.length, 1)
  const content = body.messages[0].content
  assert.equal(content.length, 1)
  assert.equal(content[0].type, 'input_audio')
  assert.equal(content[0].input_audio.data, 'data:audio/wav;base64,QUJD')
})

test('rejects non-POST, cross-site, wrong content-type, and oversized uploads', async () => {
  let upstreamCalls = 0
  const deps = { ...baseDeps, fetchImpl: async () => { upstreamCalls += 1; throw new Error('must-not-fetch') } }

  const get = makeRequestResponse({ method: 'GET' })
  await handleTranscribeStream(get.req, get.res, deps)
  assert.equal(get.res.statusCode, 405)
  assert.equal(get.res.headers.allow, 'POST')

  const crossSite = makeRequestResponse({ headers: { 'content-type': 'audio/wav', 'sec-fetch-site': 'cross-site' } })
  await handleTranscribeStream(crossSite.req, crossSite.res, deps)
  assert.equal(crossSite.res.statusCode, 403)

  const wrongType = makeRequestResponse({ headers: { 'content-type': 'application/json' } })
  await handleTranscribeStream(wrongType.req, wrongType.res, deps)
  assert.equal(wrongType.res.statusCode, 415)

  const huge = new Uint8Array(5 * 1024 * 1024 + 1)
  const oversized = makeRequestResponse({ body: huge })
  await handleTranscribeStream(oversized.req, oversized.res, deps)
  assert.equal(oversized.res.statusCode, 413)
  assert.equal(upstreamCalls, 0)
})

test('validates the WAV container before any upstream call', async () => {
  let upstreamCalls = 0
  const deps = { ...baseDeps, fetchImpl: async () => { upstreamCalls += 1; throw new Error('must-not-fetch') } }

  const garbage = makeRequestResponse({ body: encoder.encode('not a wav file at all......') })
  await handleTranscribeStream(garbage.req, garbage.res, deps)
  assert.equal(garbage.res.statusCode, 400)
  assert.match(await collectResponse(garbage.res), /invalid-wav/)

  const stereo = wavBytes()
  new DataView(stereo.buffer).setUint16(22, 2, true)
  const stereoUpload = makeRequestResponse({ body: stereo })
  await handleTranscribeStream(stereoUpload.req, stereoUpload.res, deps)
  assert.equal(stereoUpload.res.statusCode, 400)
  assert.match(await collectResponse(stereoUpload.res), /wav-channels-unsupported/)

  const tooLong = new Uint8Array(44 + (16000 * 120 + 1) * 2)
  const view = new DataView(tooLong.buffer)
  Buffer.from(tooLong.buffer).write('RIFF', 0, 'ascii')
  view.setUint32(4, tooLong.byteLength - 8, true)
  Buffer.from(tooLong.buffer).write('WAVE', 8, 'ascii')
  Buffer.from(tooLong.buffer).write('fmt ', 12, 'ascii')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16000, true)
  view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  Buffer.from(tooLong.buffer).write('data', 36, 'ascii')
  view.setUint32(40, (16000 * 120 + 1) * 2, true)
  const longUpload = makeRequestResponse({ body: tooLong })
  await handleTranscribeStream(longUpload.req, longUpload.res, deps)
  assert.equal(longUpload.res.statusCode, 400)
  assert.match(await collectResponse(longUpload.res), /wav-too-long/)

  assert.equal(upstreamCalls, 0)
})

test('requires a configured API key after WAV validation', async () => {
  let upstreamCalls = 0
  const deps = { ...baseDeps, apiKey: '', fetchImpl: async () => { upstreamCalls += 1; throw new Error('must-not-fetch') } }
  const { req, res } = makeRequestResponse()
  await handleTranscribeStream(req, res, deps)
  assert.equal(res.statusCode, 409)
  assert.match(await collectResponse(res), /api-key-not-configured/)
  assert.equal(upstreamCalls, 0)
})

test('one recording produces exactly one upstream request and proxies SSE deltas', async () => {
  const requests = []
  const { req, res } = makeRequestResponse()
  const deps = {
    ...baseDeps,
    fetchImpl: async (input, init) => {
      requests.push({ input, init })
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(sseEvent('你好'))
          controller.enqueue(sseEvent('，世界'))
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    },
  }
  await handleTranscribeStream(req, res, deps)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].input, 'https://upstream.test/v1/chat/completions')
  const parsed = JSON.parse(requests[0].init.body)
  assert.equal(parsed.model, ASR_MODEL)
  assert.ok(parsed.messages[0].content[0].input_audio.data.startsWith('data:audio/wav;base64,'))
  assert.equal(res.statusCode, 200)
  const responseText = await collectResponse(res)
  assert.match(responseText, /你好/)
  assert.match(responseText, /，世界/)
  assert.match(responseText, /\[DONE\]/)
})

test('upstream HTTP errors map to the upstream status with a message', async () => {
  const { req, res } = makeRequestResponse()
  const deps = {
    ...baseDeps,
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'insufficient quota' } }), { status: 429 }),
  }
  await handleTranscribeStream(req, res, deps)
  assert.equal(res.statusCode, 429)
  assert.match(await collectResponse(res), /insufficient quota/)
})

test('client disconnect aborts the single upstream request', async () => {
  const settled = deferred()
  const requests = []
  const { req, res } = makeRequestResponse()
  const deps = {
    ...baseDeps,
    fetchImpl: async (input, init) => {
      requests.push(init)
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(sseEvent('部分'))
          init.signal.addEventListener('abort', () => {
            settled.resolve()
            controller.error(new Error('The operation was aborted'))
          })
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
    },
  }
  const handled = handleTranscribeStream(req, res, deps)
  await collectResponse(res)
  // The browser went away mid-stream.
  req.emit('aborted')
  req.destroy()
  await settled.promise
  await handled
  assert.equal(requests.length, 1)
  assert.equal(requests[0].signal.aborted, true)
})

test('upstream stall resolves through the configured timeout as 504', async () => {
  const { req, res } = makeRequestResponse()
  const deps = {
    ...baseDeps,
    requestTimeoutMs: 50,
    fetchImpl: async (input, init) => new Response(new ReadableStream({
      start(controller) {
        init.signal.addEventListener('abort', () => controller.error(new Error('The operation was aborted')))
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  }
  await handleTranscribeStream(req, res, deps)
  assert.equal(res.statusCode, 504)
  assert.match(await collectResponse(res), /xiaomi-timeout/)
})

test('validateAsrWav accepts a valid buffer with exact frame math', () => {
  const validation = validateAsrWav(wavBytes(320))
  assert.equal(validation.frames, 320)
})
