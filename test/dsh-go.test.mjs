import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { Config } from '../lib/index.js'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { registerDshGo, nativeReadingText, captionChunks } = await loadClientModule('src/host/dsh-go.ts')

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

/** A mono 16-bit 24 kHz WAV whose data length encodes [durationMs]. */
function wav(durationMs = 100) {
  const dataBytes = Math.round(durationMs * 48) * 2
  const bytes = Buffer.alloc(44 + dataBytes)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(36 + dataBytes, 4)
  bytes.write('WAVE', 8, 'ascii')
  bytes.write('fmt ', 12, 'ascii')
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(24000, 24)
  bytes.writeUInt32LE(48000, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36, 'ascii')
  bytes.writeUInt32LE(dataBytes, 40)
  return bytes
}

function fakeDshGo() {
  const handlers = new Map()
  const mediaHandlers = new Map()
  const microDefinitions = new Map()
  const capabilities = new Set()
  return {
    handlers,
    mediaHandlers,
    microDefinitions,
    capabilities,
    on(id, handler) { handlers.set(id, handler); return () => handlers.delete(id) },
    media(id, handler) { mediaHandlers.set(id, handler); return () => mediaHandlers.delete(id) },
    micro(id, definition) { microDefinitions.set(id, definition); return () => microDefinitions.delete(id) },
    onCapability(handler) { capabilities.add(handler); return () => capabilities.delete(handler) },
  }
}

function fakeSpeech({ synthesize, ready = true } = {}) {
  const calls = []
  return {
    calls,
    capabilities: () => ({
      provider: 'xiaomi',
      formats: ['mp3', 'wav'],
      providers: [{
        id: 'xiaomi',
        configured: ready,
        ready,
        selectedModel: 'mimo-v2.5-tts',
        selectedVoice: '冰糖',
        maxTextLength: 12000,
        models: [],
      }],
    }),
    synthesize: synthesize ?? (async ({ text, format }) => {
      calls.push({ text, format })
      return { data: wav(100), text, provider: 'xiaomi', format: 'wav', contentType: 'audio/wav', durationMs: 100 }
    }),
  }
}

function settings(overrides = {}) {
  return resolveTtsSettings({
    apiKey: 'sk-native-test',
    enabled: true,
    provider: 'xiaomi',
    readScope: 'full',
    showReadingCaptions: true,
    voiceRate: 1,
    ...overrides,
  })
}

async function setup({ current = () => settings(), synthesize, ready = true } = {}) {
  const dshGo = fakeDshGo()
  const speech = fakeSpeech({ synthesize, ready })
  const dispose = registerDshGo({ dshGo, speech, current })
  return { dshGo, speech, dispose }
}

test('the manifest offers native read-aloud only where audio exists', () => {
  const manifest = packageJson.dshGo
  assert.equal(manifest.v, 1)
  assert.ok(manifest.capabilities.includes('audio'))
  assert.equal(manifest.capabilities.includes('voice'), false, 'reading must not open the microphone')
  assert.equal(manifest.icon, 'play')
  const read = manifest.contributes['message.actions'].find(action => action.id === 'read')
  assert.ok(read, 'the reply menu needs a read action')
  assert.equal(read.icon, 'play')
  assert.deepEqual(read.requires, ['audio'], 'no audio capability, no button')
  assert.ok(manifest.wants.includes('message'), 'the action reads the long-pressed reply')
  assert.equal(manifest.contributes.media.length, 1)
  assert.equal(manifest.contributes.micro.length, 1)
  assert.equal(manifest.contributes.overlays[0].channel, 'caption')
  for (const resource of [manifest.contributes.media, manifest.contributes.micro, manifest.contributes.overlays]) {
    assert.ok(resource.length <= 2)
  }
})

test('native forms show only the settings a phone can use', () => {
  // Voice picks and reading controls the native page can actually draw.
  for (const key of ['provider', 'model', 'voice', 'instruction', 'doubaoVoice', 'deepseekVoice', 'breezeVoice', 'readScope', 'voiceRate']) {
    assert.notEqual(Config.dict[key]?.meta?.hidden, true, `${key} stays on the native page`)
  }
  for (const key of ['provider', 'voice', 'instruction', 'readScope']) {
    const description = Config.dict[key]?.meta?.description
    assert.equal(typeof description?.zh, 'string', `${key} needs a Chinese label`)
    assert.equal(typeof description?.en, 'string', `${key} needs an English label`)
  }
  // Web-only integrations, secrets and switches with no native effect stay off it.
  for (const key of ['openApiToken', 'apiKey', 'doubaoApiKey', 'deepseekApiKey', 'breezeApiKey', 'autoPlay', 'localSpeechMode', 'mossEnabled', 'soundEnabled', 'showInHostSettings', 'qqbotEnabled']) {
    assert.equal(Config.dict[key]?.meta?.hidden, true, `${key} is a web-only or private setting`)
  }
})

test('read plays the host-synthesized reply with a caption', async () => {
  const { dshGo, speech, dispose } = await setup()
  try {
    const effects = await dshGo.handlers.get('read')({ sessionId: 's1', message: '**你好**。\n```js\nsecret()\n```' }, { locale: 'zh-CN' })
    assert.deepEqual(effects.map(effect => effect.type), ['audio', 'overlay'])
    assert.equal(effects[0].src, 'media:speech')
    assert.match(effects[0].key, /^[A-Za-z0-9_-]{1,128}$/)

    const audio = await dshGo.mediaHandlers.get('speech')({ sessionId: 's1' }, { key: effects[0].key, signal: new AbortController().signal })
    assert.equal(audio.contentType, 'audio/wav')
    assert.equal(Buffer.from(audio.body).toString('ascii', 0, 4), 'RIFF')
    assert.equal(speech.calls.length, 1, 'a short reply is one provider request')
    assert.equal(speech.calls[0].text.includes('secret'), false, 'code fences never reach speech')
    assert.equal(speech.calls[0].format, 'wav')
  } finally {
    dispose()
  }
})

test('caps, captions and the read scope keep long replies readable', async () => {
  const long = `${'这是一段比较长的回复，用来验证移动端分段朗读。'.repeat(200)}`
  const { dshGo, speech, dispose } = await setup()
  try {
    const effects = await dshGo.handlers.get('read')({ sessionId: 's1', message: long }, { locale: 'zh-CN' })
    const audio = await dshGo.mediaHandlers.get('speech')({ sessionId: 's1' }, { key: effects[0].key, signal: new AbortController().signal })
    assert.ok(speech.calls.length > 1, 'long replies are synthesized in provider-sized pieces')
    assert.equal(Buffer.from(audio.body).readUInt32LE(24), 24000)
    assert.ok(Buffer.from(audio.body).length > 44)

    const emitted = []
    const stop = dshGo.microDefinitions.get('caption').data({ sessionId: 's1' }, data => emitted.push(data))
    assert.equal(typeof stop, 'function')
    assert.ok(emitted[0].text.length <= 240)
    assert.equal(emitted[0].progress, 0)
    stop()

    const concise = nativeReadingText(long, settings({ readScope: 'concise' }))
    assert.ok(concise.length < long.length)
    const chunks = captionChunks(long)
    assert.ok(chunks.every(chunk => chunk.text.length > 0 && chunk.text.length <= 240))
  } finally {
    dispose()
  }
})

test('an unconfigured voice points the user to the web settings', async () => {
  const { dshGo, dispose } = await setup({ ready: false })
  try {
    const effects = await dshGo.handlers.get('read')({ message: '你好' }, { locale: 'zh-CN' })
    assert.match(effects.toast, /网页版/)
  } finally {
    dispose()
  }
})

test('a disabled switch or empty reply answers with a toast instead of audio', async () => {
  const off = await setup({ current: () => settings({ enabled: false }) })
  try {
    const effects = await off.dshGo.handlers.get('read')({ message: '你好' }, { locale: 'zh-CN' })
    assert.equal(effects.toast, '语音播报已关闭')
  } finally {
    off.dispose()
  }

  const empty = await setup()
  try {
    const effects = await empty.dshGo.handlers.get('read')({ message: '   ' }, { locale: 'en-US' })
    assert.match(effects.toast, /Nothing to read/)
  } finally {
    empty.dispose()
  }
})

test('cancelling the media request reaches the provider and fails the fetch', async () => {
  const { dshGo, dispose } = await setup({
    synthesize: async ({ signal }) => await new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('canceled')), { once: true })
    }),
  })
  try {
    const effects = await dshGo.handlers.get('read')({ sessionId: 's1', message: '你好' }, { locale: 'zh-CN' })
    const controller = new AbortController()
    const pending = dshGo.mediaHandlers.get('speech')({ sessionId: 's1' }, { key: effects[0].key, signal: controller.signal })
    controller.abort()
    await assert.rejects(pending, /canceled/)
  } finally {
    dispose()
  }
})

test('stopping the sound stops the caption and drops the stored reply', async () => {
  const { dshGo, dispose } = await setup()
  try {
    const effects = await dshGo.handlers.get('read')({ sessionId: 's1', message: '你好，世界。' }, { locale: 'zh-CN' })
    const emitted = []
    dshGo.microDefinitions.get('caption').data({ sessionId: 's1' }, data => emitted.push(data))
    assert.equal(emitted.length, 1)

    for (const handler of dshGo.capabilities) {
      await handler({ sessionId: 's1' }, { instance: effects[0].instance, event: 'audio.stopped', seq: 1, signal: new AbortController().signal })
    }
    await new Promise(resolve => setTimeout(resolve, 500))
    assert.equal(emitted.length, 1, 'no caption updates after the sound stops')

    await assert.rejects(
      dshGo.mediaHandlers.get('speech')({ sessionId: 's1' }, { key: effects[0].key, signal: new AbortController().signal }),
      /reading-not-found/,
    )
  } finally {
    dispose()
  }
})

test('disposing the contribution removes every handler', async () => {
  const { dshGo, dispose } = await setup()
  dispose()
  assert.deepEqual([...dshGo.handlers.keys()], [])
  assert.deepEqual([...dshGo.mediaHandlers.keys()], [])
  assert.deepEqual([...dshGo.microDefinitions.keys()], [])
  assert.deepEqual([...dshGo.capabilities], [])
})


test('native synthesis respects the configured text limit for long sentences', async () => {
  const { dshGo, speech, dispose } = await setup({ current: () => settings({ maxTextLength: 30 }) })
  try {
    const effects = await dshGo.handlers.get('read')({ sessionId: 's1', message: '这是一段没有标点的回复'.repeat(12) }, {})
    await dshGo.mediaHandlers.get('speech')({ sessionId: 's1' }, { key: effects[0].key, signal: new AbortController().signal })
    assert.ok(speech.calls.length > 1)
    assert.ok(speech.calls.every(call => call.text.length <= 30))
  } finally { dispose() }
})

test('a prior playback event cannot cancel a newer reading or expose it to another session', async () => {
  const { dshGo, dispose } = await setup()
  try {
    const old = await dshGo.handlers.get('read')({ sessionId: 's1', message: '旧消息' }, {})
    const next = await dshGo.handlers.get('read')({ sessionId: 's1', message: '新消息' }, {})
    for (const handler of dshGo.capabilities) handler({ sessionId: 's1' }, { instance: old[0].instance, event: 'audio.stopped', seq: 1, signal: new AbortController().signal })
    const event = { key: next[0].key, signal: new AbortController().signal }
    await assert.rejects(dshGo.mediaHandlers.get('speech')({ sessionId: 's2' }, event), /reading-not-found/)
    const audio = await dshGo.mediaHandlers.get('speech')({ sessionId: 's1' }, event)
    assert.equal(audio.contentType, 'audio/wav')
  } finally { dispose() }
})

test('captions do not advance while audio is still being generated', async () => {
  const { dshGo, dispose } = await setup()
  try {
    await dshGo.handlers.get('read')({ sessionId: 's1', message: '你好'.repeat(200) }, {})
    const emitted = []
    const stop = dshGo.microDefinitions.get('caption').data({ sessionId: 's1' }, data => emitted.push(data))
    await new Promise(resolve => setTimeout(resolve, 500))
    assert.equal(emitted.length, 1)
    stop()
  } finally { dispose() }
})
