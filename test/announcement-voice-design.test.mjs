import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { TTS_ROUTE, TTS_STREAM_ROUTE, prepareProviderTtsText, resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback, pcmEvent } from './helpers/browser-playback.mjs'

const { XiaomiMimoTtsPcmService } = await loadClientModule('src/client/playback/pcm-play-service.ts')
const { AnnouncementPlayback } = await loadClientModule('src/client/announcements/playback.ts')
const { SpeechActivity } = await loadClientModule('src/client/announcements/speech-activity.ts')
const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')

function designSettings(overrides = {}) {
  return resolveTtsSettings({
    enabled: true, provider: 'xiaomi', model: 'mimo-v2.5-tts-voicedesign',
    voice: 'Mia', voiceDesignPrompt: '清亮的声音', instruction: '温柔地说',
    voiceVolume: 0.7, voiceRate: 1.3, announcementSources: ['dsh-pet', 'dsh-whale-musume'],
    ...overrides,
  })
}

async function withService(run, options = {}) {
  await withBrowserPlayback(async state => {
    const context = new Context()
    context.logger.warn = () => {}
    let settings = designSettings(options.settings)
    const saved = []
    const history = { stopReplay() {}, add: async entry => { saved.push(entry) } }
    const service = new XiaomiMimoTtsPcmService(context, { getSnapshot: () => ({ status: 'ready', value: settings }) }, () => {}, history)
    const announcements = new AnnouncementPlayback(service, new SpeechActivity())
    try { await run({ state, service, announcements, saved, setSettings: value => { settings = designSettings(value) } }) }
    finally { await service.dispose(); await context.fiber.dispose() }
  }, { fetch: request => request.url === TTS_STREAM_ROUTE ? new Response(pcmEvent()) : new Response('wav audio'), ...options.browser })
}

for (const source of ['dsh-pet', 'dsh-whale-musume']) {
  test(`${source} plays the selected Xiaomi VoiceDesign voice`, async () => {
    await withService(async ({ state, service, announcements, saved }) => {
      const text = '欢迎回来。'
      if (source === 'dsh-pet') announcements.play({ source, id: 'message', text })
      else service.play(text)
      assert.equal(service.isBusy(), true)
      await settle()

      assert.equal(state.requests.length, 1)
      const request = state.requests[0]
      assert.equal(request.url, TTS_ROUTE)
      assert.equal(request.provider, 'xiaomi')
      assert.equal(request.model, 'mimo-v2.5-tts-voicedesign')
      assert.equal(request.voiceDesignPrompt, '清亮的声音')
      assert.equal(request.speechInstruction, '温柔地说')
      assert.equal(request.text, prepareProviderTtsText(text, designSettings()))
      assert.equal(state.media.length, 1)
      assert.equal(state.media[0].volume, 0.7)
      assert.equal(state.media[0].playbackRate, 1.3)
      assert.equal(state.media[0].paused, false)
      assert.equal(service.isBusy(), true, 'the playback slot remains reserved until the audio ends')
      assert.equal(saved[0].text, request.text)
      assert.equal(saved[0].format, 'wav')
      assert.equal(saved[0].voiceRateApplied, false)

      state.media[0].dispatchEvent(new Event('ended'))
      await settle()
      assert.equal(service.isBusy(), false)
      assert.equal(state.media[0].paused, true)
      assert.equal(state.media[0].src, '')
      assert.equal(state.media[0].listeners.size, 0)
      assert.deepEqual(state.revoked, state.created)
    })
  })
}

test('a pet announcement sends the selected design and instruction to the Xiaomi transport', async () => {
  const previousDispatcher = getGlobalDispatcher()
  const dispatcher = new MockAgent()
  dispatcher.disableNetConnect()
  const settings = designSettings({ apiKey: 'sk-test-key', baseURL: 'https://xiaomi.test/v1' })
  const host = new HostSpeechService(() => settings)
  const wav = Buffer.alloc(46)
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(24000, 24); wav.writeUInt32LE(48000, 28)
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2, 40)
  let upstream
  dispatcher.get('https://xiaomi.test').intercept({ path: '/v1/chat/completions', method: 'POST' }).reply(options => {
    upstream = JSON.parse(options.body)
    return { statusCode: 200, data: JSON.stringify({ choices: [{ message: { audio: { data: wav.toString('base64') } } }] }) }
  })
  setGlobalDispatcher(dispatcher)
  try {
    let completed
    const requested = new Promise(resolve => { completed = resolve })
    await withService(async ({ state, announcements, saved }) => {
      announcements.play({ source: 'dsh-pet', id: 'message', text: '欢迎回来。' })
      await requested
      await settle()
      assert.equal(upstream.model, 'mimo-v2.5-tts-voicedesign')
      assert.equal(upstream.stream, false)
      assert.equal(upstream.audio.format, 'wav')
      assert.equal(upstream.audio.voice, undefined)
      assert.deepEqual(upstream.messages, [
        { role: 'user', content: '清亮的声音\n温柔地说' },
        { role: 'assistant', content: '欢迎回来.' },
      ])
      assert.equal(state.media[0].paused, false)
      assert.equal(Buffer.from(await saved[0].blob.arrayBuffer()).subarray(0, 4).toString(), 'RIFF')
      state.media[0].dispatchEvent(new Event('ended'))
    }, { browser: { fetch: async request => {
      const audio = await host.synthesize(request)
      completed()
      return new Response(audio.data, { headers: { 'content-type': audio.contentType } })
    } } })
    dispatcher.assertNoPendingInterceptors()
  } finally {
    await host.dispose()
    setGlobalDispatcher(previousDispatcher)
    await dispatcher.close()
  }
})

test('switching back to a Xiaomi preset uses its selected voice and streaming playback', async () => {
  await withService(async ({ state, service, setSettings }) => {
    service.play('音色设计。')
    await settle()
    state.media[0].dispatchEvent(new Event('ended'))
    await settle()
    setSettings({ model: 'mimo-v2.5-tts', voice: 'Mia' })
    service.play('预置音色。')
    await settle()
    assert.equal(state.requests.length, 2)
    assert.equal(state.requests[1].url, TTS_STREAM_ROUTE)
    assert.equal(state.requests[1].model, 'mimo-v2.5-tts')
    assert.equal(state.requests[1].voice, 'Mia')
  })
})

test('VoiceDesign announcements keep the slot busy across segments, update volume and cancel cleanly', async () => {
  await withService(async ({ state, service, announcements, saved }) => {
    const text = `${'甲'.repeat(180)}。${'乙'.repeat(180)}。`
    const lifetime = new AbortController()
    announcements.play({ source: 'dsh-pet', id: 'first', text, signal: lifetime.signal })
    await settle()
    assert.equal(state.media.length, 1)
    announcements.play({ source: 'dsh-pet', id: 'skipped', text: '不应插播。' })
    assert.equal(state.requests.length, 1)
    service.setVolume(0.25)
    assert.equal(state.media[0].volume, 0.25)
    state.media[0].dispatchEvent(new Event('ended'))
    await settle()
    assert.equal(state.requests.length, 2)
    assert.equal(state.media.length, 2)
    assert.equal(state.media[1].volume, 0.25)
    assert.equal(service.isBusy(), true)
    assert.equal(state.requests.map(request => request.text).join(''), prepareProviderTtsText(text, designSettings()))
    assert.ok(state.requests.every(request => request.model === 'mimo-v2.5-tts-voicedesign'))
    assert.equal(saved.length, 2)
    lifetime.abort()
    await settle()
    assert.equal(service.isBusy(), false)
    assert.ok(state.requests.every(request => request.signal.aborted))
    assert.ok(state.media.every(audio => audio.paused && audio.src === '' && audio.listeners.size === 0))
    assert.deepEqual(state.revoked, state.created)
  })
})

test('a long VoiceDesign sentence is played completely within the configured request limit', async () => {
  await withService(async ({ state, service }) => {
    const text = `${'甲'.repeat(125)}。`
    service.play(text)
    for (let index = 0; service.isBusy() && index < 10; index += 1) {
      await settle()
      assert.ok(state.media[index], 'each synthesized segment must start playback')
      state.media[index].dispatchEvent(new Event('ended'))
      await settle()
    }
    assert.equal(service.isBusy(), false)
    assert.ok(state.requests.length > 1)
    assert.ok(state.requests.every(request => request.text.length <= 40 && request.model === 'mimo-v2.5-tts-voicedesign'))
    assert.equal(state.requests.map(request => request.text).join(''), prepareProviderTtsText(text, designSettings()))
  }, { settings: { maxTextLength: 40 } })
})

test('splitting at the request limit keeps sentence punctuation with speech', async () => {
  await withService(async ({ state, service }) => {
    const text = '甲乙丙丁戊己。'
    service.play(text)
    for (let index = 0; service.isBusy() && index < 10; index += 1) {
      await settle()
      assert.ok(state.media[index], 'a punctuation-only request must not interrupt the utterance')
      state.media[index].dispatchEvent(new Event('ended'))
      await settle()
    }
    assert.equal(state.requests.map(request => request.text).join(''), prepareProviderTtsText(text, designSettings()))
    assert.ok(state.requests.every(request => request.text.length <= 3))
  }, { settings: { maxTextLength: 3 }, browser: { fetch: request => prepareProviderTtsText(request.text, designSettings()) ? new Response('audio') : new Response('text required', { status: 400 }) } })
})

test('a replaced VoiceDesign request cannot play or stop the replacement when its response arrives late', async () => {
  let resolveFirst
  await withService(async ({ state, service, saved }) => {
    service.play('旧的台词。')
    service.play('新的台词。')
    await settle()
    assert.equal(state.requests.length, 2)
    assert.equal(state.requests[0].signal.aborted, true)
    assert.equal(state.media.length, 1)
    assert.equal(state.media[0].paused, false)
    resolveFirst(new Response('late audio'))
    await settle()
    assert.equal(state.media.length, 1)
    assert.equal(state.media[0].paused, false)
    assert.equal(service.isBusy(), true)
    assert.equal(saved.length, 1)
    service.stopExternal()
    await settle()
    assert.equal(service.isBusy(), false)
    assert.equal(state.media[0].paused, true)
    assert.equal(state.media[0].src, '')
    assert.deepEqual(state.revoked, state.created)
  }, { browser: { fetch: request => request.text.includes('旧') ? new Promise(resolve => { resolveFirst = resolve }) : new Response('new audio') } })
})

test('important VoiceDesign alerts keep priority until complete audio finishes', async () => {
  await withService(async ({ state, service }) => {
    let interrupted = 0
    service.tryPlay('重要提醒。', () => true, () => { interrupted += 1 })
    assert.equal(interrupted, 1)
    assert.equal(service.priorityActivity.getSnapshot(), true)
    await settle()
    service.play('不应抢占。')
    assert.equal(state.requests.length, 1)
    assert.equal(service.priorityActivity.getSnapshot(), true)
    state.media[0].dispatchEvent(new Event('ended'))
    await settle()
    assert.equal(service.isBusy(), false)
    assert.equal(service.priorityActivity.getSnapshot(), false)
  })
})

test('a failed VoiceDesign announcement releases priority without switching to a preset voice', async () => {
  await withService(async ({ state, service }) => {
    let interrupted = 0
    const stop = service.tryPlay('重要提醒。', () => true, () => { interrupted += 1 })
    assert.equal(typeof stop, 'function')
    assert.equal(interrupted, 1)
    assert.equal(service.priorityActivity.getSnapshot(), true)
    await settle()
    await settle()
    assert.equal(service.isBusy(), false)
    assert.equal(service.priorityActivity.getSnapshot(), false)
    assert.ok(state.requests.length > 0)
    assert.ok(state.requests.every(request => request.url === TTS_ROUTE && request.model === 'mimo-v2.5-tts-voicedesign'))
    assert.equal(state.media.length, 0)
  }, { browser: { fetch: () => new Response('unavailable', { status: 503 }) } })
})
