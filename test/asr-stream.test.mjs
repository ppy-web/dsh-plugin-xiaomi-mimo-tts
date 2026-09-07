import assert from 'node:assert/strict'
import test from 'node:test'

import { streamAsrTranscription } from '../lib/asr-stream.js'
import { encodeWavPcm16Mono } from '../lib/asr-core.js'
import { ASR_STREAM_ROUTE, ASR_SAMPLE_RATE } from '../lib/shared.js'

const encoder = new TextEncoder()

function chunkedResponse(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk)
      controller.close()
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function contentEvent(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
}

test('transcription transport posts the WAV and streams accumulated deltas', async () => {
  const originalFetch = globalThis.fetch
  let request
  globalThis.fetch = async (input, init) => {
    request = { input, init }
    return chunkedResponse([contentEvent('你好'), contentEvent('世界'), 'data: [DONE]\n\n'])
  }
  try {
    const seen = []
    const wav = encodeWavPcm16Mono(Int16Array.from([0, 1, -1]), ASR_SAMPLE_RATE)
    const text = await streamAsrTranscription(wav, new AbortController().signal, (full) => seen.push(full))
    assert.equal(request.input, ASR_STREAM_ROUTE)
    assert.equal(request.init.method, 'POST')
    assert.equal(request.init.headers['content-type'], 'audio/wav')
    assert.equal(request.init.body.type, 'audio/wav')
    assert.equal(text, '你好世界')
    assert.deepEqual(seen, ['你好', '你好世界'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('transcription transport surfaces HTTP, upstream, and empty failures', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'api-key-not-configured' }), { status: 409 })
    await assert.rejects(
      streamAsrTranscription(encodeWavPcm16Mono(new Int16Array(4)), new AbortController().signal, () => {}),
      /api-key-not-configured/,
    )

    globalThis.fetch = async () => chunkedResponse([`data: ${JSON.stringify({ error: { message: 'model-overloaded' } })}\n\n`])
    await assert.rejects(
      streamAsrTranscription(encodeWavPcm16Mono(new Int16Array(4)), new AbortController().signal, () => {}),
      /model-overloaded/,
    )

    globalThis.fetch = async () => chunkedResponse(['data: [DONE]\n\n'])
    const text = await streamAsrTranscription(encodeWavPcm16Mono(new Int16Array(4)), new AbortController().signal, () => {})
    assert.equal(text, '', 'empty response yields empty text for the caller to surface')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('transcription transport skips fetch when already aborted and stops on late abort', async () => {
  const originalFetch = globalThis.fetch
  try {
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    let fetchCount = 0
    globalThis.fetch = async () => {
      fetchCount += 1
      return chunkedResponse([])
    }
    const text = await streamAsrTranscription(encodeWavPcm16Mono(new Int16Array(4)), alreadyAborted.signal, () => {})
    assert.equal(fetchCount, 0)
    assert.equal(text, '')

    const controller = new AbortController()
    globalThis.fetch = async () => chunkedResponse([contentEvent('第一'), contentEvent('第二')])
    const seen = []
    await streamAsrTranscription(encodeWavPcm16Mono(new Int16Array(4)), controller.signal, (full) => {
      seen.push(full)
      if (full === '第一') controller.abort()
    })
    assert.deepEqual(seen, ['第一'])
  } finally {
    globalThis.fetch = originalFetch
  }
})
