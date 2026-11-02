import assert from 'node:assert/strict'
import test from 'node:test'
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { isSilk } from 'silk-wasm'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

function wav() {
  const bytes = Buffer.alloc(44 + 4800)
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(24000, 24); bytes.writeUInt32LE(48000, 28)
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40)
  return bytes
}

test('Xiaomi complete and streamed speech keep the Host dispatcher and avoid global model-request rewriting', async () => {
  const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
  const originalDispatcher = getGlobalDispatcher()
  const dispatcher = new MockAgent()
  dispatcher.disableNetConnect()
  const settings = resolveTtsSettings({ apiKey: 'sk-xiaomi-transport-test', baseURL: 'https://xiaomi-transport.test/v1' })
  const pool = dispatcher.get('https://xiaomi-transport.test')
  const requests = [], intercepted = []
  const pcm = Buffer.alloc(4800)
  for (const streaming of [false, true]) {
    pool.intercept({
      path: '/v1/chat/completions', method: 'POST',
      headers: { authorization: `Bearer ${settings.apiKey}` },
    }).reply(options => {
      const body = JSON.parse(options.body)
      requests.push(body)
      assert.equal(body.stream, streaming)
      return {
        statusCode: 200,
        responseOptions: { headers: { 'content-type': streaming ? 'text/event-stream' : 'application/json' } },
        data: streaming
          ? `data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm.toString('base64') } } }] })}\n\ndata: [DONE]\n\n`
          : JSON.stringify({ choices: [{ message: { audio: { data: wav().toString('base64') } } }] }),
      }
    })
  }
  // Model plugins may install a fetch accessor before speech starts. It must not see TTS traffic.
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    get: () => async (url, init) => {
      intercepted.push({ url, init })
      throw new Error('model request interceptor must not handle speech')
    },
  })
  setGlobalDispatcher(dispatcher)
  let service
  try {
    const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')
    const { streamXiaomi } = await loadClientModule('src/host/xiaomi.ts')
    service = new HostSpeechService(() => settings)
    const audio = await service.synthesize({ text: '在呢，主人～我在听。', format: 'silk' })
    assert.equal(audio.provider, 'xiaomi')
    assert.equal(isSilk(audio.data), true, 'QQ must receive playable SILK despite the global model hook')
    const response = await streamXiaomi(settings, '实时朗读。', new AbortController().signal)
    assert.equal(response.status, 200)
    const frames = (await response.text()).split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6))
    assert.deepEqual(Buffer.from(JSON.parse(frames[0]).choices[0].delta.audio.data, 'base64'), pcm)
    assert.equal(frames.at(-1), '[DONE]')
    for (const request of requests) {
      assert.equal(request.model, settings.model)
      assert.equal(request.audio.voice, settings.voice)
      assert.equal(request.messages.at(-1).role, 'assistant', 'Xiaomi requires spoken text in an assistant message')
    }
    assert.deepEqual(requests.map(request => request.audio.format), ['wav', 'pcm16'])
    assert.equal(intercepted.length, 0)
    dispatcher.assertNoPendingInterceptors()
  } finally {
    await service?.dispose()
    setGlobalDispatcher(originalDispatcher)
    if (originalFetch) Object.defineProperty(globalThis, 'fetch', originalFetch)
    else delete globalThis.fetch
    await dispatcher.close()
  }
})
