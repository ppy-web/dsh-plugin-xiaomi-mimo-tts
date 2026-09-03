import assert from 'node:assert/strict'
import test from 'node:test'

import { streamPcmAudio } from '../lib/pcm-stream.js'

const encoder = new TextEncoder()

function sseAudio(data) {
  return `data: ${JSON.stringify({ choices: [{ delta: { audio: { data } } }] })}\n\n`
}

function chunkedResponse(chunks) {
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

test('PCM transport posts the preset model and preserves split SSE records', async () => {
  const originalFetch = globalThis.fetch
  let request
  const event = sseAudio('AQID')
  globalThis.fetch = async (input, init) => {
    request = { input, init }
    return chunkedResponse([event.slice(0, 17), event.slice(17), 'data: [DONE]\n\n'])
  }
  try {
    const chunks = []
    await streamPcmAudio('欢迎回来', new AbortController().signal, (pcm) => { chunks.push(pcm) })
    assert.equal(request.input, '/plugins/xiaomi-mimo-tts/synthesize-stream')
    assert.deepEqual(JSON.parse(request.init.body), { text: '欢迎回来', model: 'mimo-v2.5-tts' })
    assert.deepEqual(chunks, ['AQID'])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('PCM transport reports HTTP, upstream, and empty-audio failures', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => new Response(null, { status: 503 })
    await assert.rejects(streamPcmAudio('测试', new AbortController().signal, () => {}), /stream-request-503/)

    globalThis.fetch = async () => chunkedResponse([`data: ${JSON.stringify({ error: { message: 'upstream-failed' } })}\n\n`])
    await assert.rejects(streamPcmAudio('测试', new AbortController().signal, () => {}), /upstream-failed/)

    globalThis.fetch = async () => chunkedResponse(['data: [DONE]\n\n'])
    await assert.rejects(streamPcmAudio('测试', new AbortController().signal, () => {}), /stream-audio-empty/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('PCM transport does not fetch an already-aborted request or consume late chunks', async () => {
  const originalFetch = globalThis.fetch
  let fetchCount = 0
  try {
    const alreadyAborted = new AbortController()
    alreadyAborted.abort()
    globalThis.fetch = async () => {
      fetchCount += 1
      return chunkedResponse([])
    }
    await streamPcmAudio('测试', alreadyAborted.signal, () => {})
    assert.equal(fetchCount, 0)

    const controller = new AbortController()
    globalThis.fetch = async () => chunkedResponse([sseAudio('FIRST'), sseAudio('LATE')])
    const chunks = []
    await streamPcmAudio('测试', controller.signal, (pcm) => {
      chunks.push(pcm)
      controller.abort()
    })
    assert.deepEqual(chunks, ['FIRST'])
  } finally {
    globalThis.fetch = originalFetch
  }
})
