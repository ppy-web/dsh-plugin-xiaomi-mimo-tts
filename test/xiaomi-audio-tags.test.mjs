import assert from 'node:assert/strict'
import test from 'node:test'
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { prepareXiaomiTtsText, prepareProviderTtsText, stripXiaomiAudioTags, resolveTtsSettings, splitTtsSegments, applyTtsPlaybackScope, TtsFirstSegmentLimiter, DEFAULT_TTS_SEGMENT_CHARACTERS, TTS_SMART_TRUNCATION_OUTROS } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { pcmEvent, withBrowserPlayback } from './helpers/browser-playback.mjs'

const { HostSpeechService } = await loadClientModule('src/host/speech-service.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { RealtimeSpeechSession } = await loadClientModule('src/client/playback/realtime-speech-session.ts')
const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')

test('MiMo preserves custom, combined and bilingual controls while filtering non-speech content', () => {
  const raw = '(温柔|俏皮) **你好**[轻笑]（紧张，深呼吸）Hello (soft; tired)!\n[文档](https://example.com)\n```\n(不要合成代码)\n```'
  const text = prepareXiaomiTtsText(raw)
  for (const tag of ['(温柔|俏皮)', '[轻笑]', '（紧张，深呼吸）', '(soft; tired)']) assert.ok(text.includes(tag))
  assert.ok(text.includes('你好'))
  assert.ok(text.includes('文档'))
  assert.ok(!text.includes('不要合成代码') && !text.includes('https://'))
  assert.equal(prepareXiaomiTtsText(text), text, 'client and Host normalization must compose')
  const forged = prepareXiaomiTtsText('\uE0010\uE002[轻笑]你好')
  assert.equal(forged.match(/\[轻笑\]/gu)?.length, 1, 'user input cannot duplicate tags by forging private markers')
  assert.ok(!/[\uE000-\uE002]/u.test(forged))
})

test('MiMo scope and semantic segments retain complete controls including punctuation within them', () => {
  const opening = '(soft; tired)' + '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '。'
  const text = opening + '（声音变轻，略微哽咽）' + '乙'.repeat(250) + '。'
  const prepare = value => prepareProviderTtsText(value, { provider: 'xiaomi', model: 'mimo-v2.5-tts' })
  const segments = splitTtsSegments(text, undefined, undefined, prepare)
  assert.equal(segments.join(''), prepareXiaomiTtsText(text))
  assert.ok(segments[0].includes('(soft; tired)'))
  assert.equal(applyTtsPlaybackScope(text, 'smart', true, () => 0, prepare), `${prepareXiaomiTtsText(opening)}${TTS_SMART_TRUNCATION_OUTROS[0]}`)
  const growing = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS) + '（深呼吸）'
  assert.equal(new TtsFirstSegmentLimiter(1, prepare).limit(growing), growing)
  assert.equal(stripXiaomiAudioTags('(温柔)[轻笑]（深呼吸）你好'), '   你好')
  assert.equal(prepareProviderTtsText('(温柔)[轻笑]你好', { provider: 'xiaomi', model: 'mimo-v2.5-tts-voicedesign' }), '你好')
})

test('MiMo QQ delivery keeps tags in assistant messages and never cuts a tag at the request limit', async () => {
  const original = getGlobalDispatcher(), mock = new MockAgent()
  mock.disableNetConnect()
  const requests = [], delivered = []
  mock.get('https://xiaomi-tags.test').intercept({ path: '/v1/chat/completions', method: 'POST' }).reply(options => {
    requests.push(JSON.parse(options.body))
    return { statusCode: 200, data: JSON.stringify({ choices: [{ message: { audio: { data: Buffer.from('ID3audio').toString('base64') } } }] }) }
  }).persist()
  const settings = resolveTtsSettings({ apiKey: 'sk-fixture-key', baseURL: 'https://xiaomi-tags.test/v1', instruction: '自然温柔', maxTextLength: 200 })
  const service = new HostSpeechService(() => settings)
  service.registerDelivery({ id: 'qqbot', format: 'mp3', async send(audio) { delivered.push(audio); return { adapter: 'qqbot' } } })
  setGlobalDispatcher(mock)
  try {
    const text = '(温柔)' + '甲'.repeat(193) + '（声音变轻，略微哽咽）' + '乙'.repeat(210) + '[轻笑]再见。'
    await service.deliver({ text, splitLongText: true }, 'qqbot', { agent: {}, signal: new AbortController().signal })
    assert.equal(requests.map(request => request.messages.at(-1).content).join(''), prepareXiaomiTtsText(text))
    assert.ok(requests.every(request => request.messages.at(-1).role === 'assistant' && request.messages.at(-1).content.length <= 200))
    assert.ok(requests.some(request => request.messages.at(-1).content.includes('（声音变轻，略微哽咽）')))
    assert.ok(requests.every(request => request.messages[0].role === 'user' && request.messages[0].content === '自然温柔'))
    assert.equal(delivered.length, requests.length)
    assert.ok(delivered.every(audio => audio.data.toString().startsWith('ID3')))
    const before = requests.length
    await assert.rejects(service.deliver({ text: '(' + '轻'.repeat(201) + ')正文', splitLongText: true }, 'qqbot', { agent: {}, signal: new AbortController().signal }), error => error.code === 'text-too-long')
    assert.equal(requests.length, before, 'reject oversized controls before delivering any partial audio')
    assert.equal(service.supportsAudioTags(), true)
    settings.model = 'mimo-v2.5-tts-voicedesign'
    assert.equal(service.supportsAudioTags(), false)
  } finally { await service.dispose(); setGlobalDispatcher(original); await mock.close() }
})

test('MiMo incremental streaming waits for a complete tag and keeps it through final playback', async () => {
  await withBrowserPlayback(async state => {
    const settings = resolveTtsSettings({ readScope: 'full', localSpeechMode: 'disabled' })
    const live = new LiveSpeechController(), local = new LocalSpeechController()
    const speech = new RealtimeSpeechSession(live, local)
    live.configure(settings); speech.activate('session')
    speech.configure({ localSpeechMode: 'disabled', apiKeySupported: true, readScope: 'full' })
    const opening = '甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS - 5)
    try {
      speech.observe('session', 1, 0, opening + '（声音变轻，')
      await settle()
      assert.ok(state.requests.every(request => !request.text.includes('声音变轻')))
      const text = opening + '（声音变轻，略微哽咽）继续说。'
      speech.observe('session', 1, 0, text)
      speech.finish('session', { turn: 1, step: 0, messageId: 'message', text, interrupted: false })
      for (let i = 0; i < 8; i++) await settle()
      assert.equal(state.requests.map(request => request.text).join(''), prepareXiaomiTtsText(text))
      assert.ok(state.requests.some(request => request.text.includes('（声音变轻，略微哽咽）')))
    } finally { speech.deactivate('session'); await live.dispose(); local.dispose() }
  }, { fetch: () => new Response(pcmEvent()), endPcm: true })
})

test('MiMo failed preview falls back to browser speech without pronouncing custom controls', async () => {
  await withBrowserPlayback(async state => {
    const player = new PreviewPlayer(() => {})
    try {
      const playing = player.play('(温柔)[轻笑]（声音变轻，略微哽咽）你好', resolveTtsSettings({ localSpeechMode: 'auto' }))
      for (let i = 0; i < 6; i++) await settle()
      assert.equal(state.utterances.length, 1)
      assert.equal(state.utterances[0].text.trim(), '你好')
      state.utterances[0].onend()
      await playing
    } finally { await player.dispose() }
  }, { fetch: () => new Response('failed', { status: 503 }) })
})
