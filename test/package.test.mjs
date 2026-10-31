import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const readmeZh = await readFile(new URL('../README.md', import.meta.url), 'utf8')
const sharedModule = await import('../lib/shared.js')
const {
  appendTtsSmartTruncationOutro,
  applyTtsPlaybackScope,
  applyTtsReadScope,
  batchTtsStreamText,
  countTtsSpeechCharacters,
  DEFAULT_TTS_SEGMENT_CHARACTERS,
  firstTtsSegment,
  firstTtsSegments,
  MAX_TTS_SEGMENT_CHARACTERS,
  MIN_TTS_STREAM_CHARACTERS,
  prepareTtsText,
  resolveTtsBaseURL,
  resolveTtsReadScope,
  resolveTtsSettings,
  splitTtsSegments,
  TTS_SMART_TRUNCATION_OUTROS,
  TOKEN_PLAN_TTS_BASE_URL,
  TTS_VERSION,
  TtsFirstSegmentLimiter,
} = sharedModule

const SUPPORTED_DSH_PACKAGE_PREFIX = '@deepseek-ai/dsh-'
const DEVELOPMENT_DSH_VERSION = packageJson.devDependencies['@deepseek-ai/dsh-api-session-controller']

async function assertLocalDocumentTargets(source, label) {
  const targets = [...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)|(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1] ?? match[2])
    .filter((target) => !/^(?:[a-z]+:|#)/iu.test(target))
    .map((target) => decodeURIComponent(target.split('#', 1)[0]))
  for (const target of targets) {
    await assert.doesNotReject(readFile(new URL(`../${target}`, import.meta.url)), `${label}: missing local target ${target}`)
  }
}

function assertWebp(data, label) {
  assert.equal(data.toString('ascii', 0, 4), 'RIFF', `${label} should be a RIFF file`)
  assert.equal(data.toString('ascii', 8, 12), 'WEBP', `${label} should be a WEBP file`)
}

test('package metadata exposes the DSH bundle and supported Web client entries', () => {
  assert.equal(packageJson.name, 'dsh-xiaomi-tts')
  assert.equal(TTS_VERSION, packageJson.version)
  assert.ok(packageJson.files.includes('NOTICE'))
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh.client.platform, 'web')
  assert.ok(packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.ok(packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-chat'))

  for (const [name, range] of Object.entries(packageJson.peerDependencies)) {
    if (name.startsWith(SUPPORTED_DSH_PACKAGE_PREFIX)) assert.equal(range, packageJson.engines.dsh, `${name} should follow the supported DSH range`)
    assert.equal(packageJson.peerDependenciesMeta[name]?.optional, true, `${name} must be optional`)
  }
  for (const [name, range] of Object.entries(packageJson.devDependencies)) {
    if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(range, DEVELOPMENT_DSH_VERSION, name)
  }
  assert.ok(packageJson.exports['./client']?.default)
  assert.ok(packageJson.exports['./client-api']?.types)
  assert.ok(packageJson.exports['./client-api']?.default)
})

test('documentation links resolve and documented pnpm commands exist', async () => {
  for (const name of ['README.md', 'handbook.md', 'intro.md']) {
    const source = name === 'README.md' ? readmeZh : await readFile(new URL(`../${name}`, import.meta.url), 'utf8')
    await assertLocalDocumentTargets(source, name)
    for (const [, command] of source.matchAll(/\bpnpm\s+(?:run\s+)?([\w:-]+)/g)) {
      assert.ok(Object.hasOwn(packageJson.scripts, command) || ['install', 'pack'].includes(command), `${name}: unknown pnpm command ${command}`)
    }
  }
})

test('Voice Design presets provide usable descriptions without changing custom settings', () => {
  assert.ok(sharedModule.TTS_MODELS.includes('mimo-v2.5-tts-voicedesign'))
  assert.ok(sharedModule.TTS_VOICE_DESIGN_PRESETS.length > 0)
  for (const preset of sharedModule.TTS_VOICE_DESIGN_PRESETS) {
    assert.ok(preset.prompt.trim().length > 0, `${preset.id} needs a synthesis description`)
    const settings = resolveTtsSettings({ model: 'mimo-v2.5-tts-voicedesign', voiceDesignPrompt: preset.prompt })
    assert.equal(settings.voiceDesignPrompt, preset.prompt)
    assert.equal(settings.voiceDesignCustomPrompt, sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt)
  }
})

test('shared route and settings contracts are internally consistent', () => {
  const routes = [
    sharedModule.TTS_ROUTE,
    sharedModule.TTS_STREAM_ROUTE,
    sharedModule.TTS_API_KEY_STATUS_ROUTE,
    sharedModule.TTS_VOICE_DESIGN_ASSET_ROUTE,
    sharedModule.TTS_VOICE_ASSET_ROUTE,
    sharedModule.TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
    sharedModule.TTS_API_KEY_WHALE_ASSET_ROUTE,
    sharedModule.TTS_TOGGLE_AUDIO_ASSET_ROUTE,
  ]
  assert.ok(routes.every((route) => route.startsWith('/plugins/xiaomi-mimo-tts/')))
  assert.ok(sharedModule.TTS_MODELS.includes('mimo-v2.5-tts'))
  assert.ok(sharedModule.TTS_MODELS.includes('mimo-v2.5-tts-voicedesign'))
  assert.ok(sharedModule.TTS_LOCAL_SPEECH_MODES.includes('disabled'))
  assert.ok(sharedModule.TTS_FORMATS.includes('pcm'))
  assert.ok(sharedModule.TTS_FORMATS.includes('mp3'))
  assert.ok(sharedModule.TTS_FORMATS.includes('wav'))
  assert.ok(Object.values(sharedModule.TTS_TOGGLE_SOUND_FILES).every((files) => files.length > 0 && files.every((file) => file.endsWith('.mp3'))))
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.enabled, true)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.autoPlay, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.soundEnabled, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.taskSounds, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.clickSounds, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.model, 'mimo-v2.5-tts')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.localSpeechMode, 'auto')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.format, 'pcm')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.readScope, 'smart')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt, sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignPrompt)
  assert.ok(sharedModule.TTS_VOICE_PRESETS.every((item) => item.id && item.value))
  assert.equal(new Set(sharedModule.TTS_VOICE_PRESETS.map((item) => item.id)).size, sharedModule.TTS_VOICE_PRESETS.length)
  assert.equal(new Set(sharedModule.TTS_VOICE_DESIGN_PRESETS.map((item) => item.id)).size, sharedModule.TTS_VOICE_DESIGN_PRESETS.length)
})

test('selects the Token Plan endpoint from tp-prefixed API keys', () => {
  assert.equal(resolveTtsBaseURL('tp-example', 'https://api.xiaomimimo.com/v1'), TOKEN_PLAN_TTS_BASE_URL)
  assert.equal(resolveTtsBaseURL('  tp-example  ', 'https://api.xiaomimimo.com/v1'), TOKEN_PLAN_TTS_BASE_URL)
  assert.equal(resolveTtsBaseURL('sk-example', 'https://api.xiaomimimo.com/v1'), 'https://api.xiaomimimo.com/v1')
  assert.equal(resolveTtsBaseURL('custom-example', 'https://custom.example/v1'), 'https://custom.example/v1')
})

test('accepts only canonical padded Base64 and calculates its decoded size', () => {
  assert.equal(sharedModule.strictBase64DecodedLength('SUQz'), 3)
  assert.equal(sharedModule.strictBase64DecodedLength('UklGRg=='), 4)
  assert.equal(sharedModule.strictBase64DecodedLength('YQ=='), 1)
  assert.equal(sharedModule.strictBase64DecodedLength('YWI='), 2)
  for (const value of ['', 'abc', 'ab=c', 'YW Jj', 'YWJj\n']) assert.equal(sharedModule.strictBase64DecodedLength(value), null)
})

test('ships one valid WebP icon for every Voice Design preset', async () => {
  const iconFiles = sharedModule.TTS_VOICE_DESIGN_PRESETS.map((item) => `${item.id}.webp`)
  for (const file of iconFiles) assertWebp(await readFile(new URL(`../assets/voice-presets/${file}`, import.meta.url)), file)
})

test('ships one valid WebP avatar for every built-in voice', async () => {
  const avatarFiles = sharedModule.TTS_VOICE_PRESETS.map((item) => `${item.id}.webp`)
  for (const file of avatarFiles) assertWebp(await readFile(new URL(`../assets/voice-avatars/${file}`, import.meta.url)), file)
})

test('ships the UI image and audio assets referenced by shared contracts', async () => {
  assertWebp(await readFile(new URL('../assets/ui/toggle-characters.webp', import.meta.url)), 'toggle characters')
  assertWebp(await readFile(new URL('../assets/ui/api-key-whale.webp', import.meta.url)), 'API key whale')
  assertWebp(await readFile(new URL('../assets/plugin-icons/avatar.webp', import.meta.url)), 'shared plugin and history icon')
  for (const route of Object.values(sharedModule.TTS_PROVIDER_CHARACTER_ASSET_ROUTES)) {
    const file = route.slice(route.lastIndexOf('/') + 1)
    assertWebp(await readFile(new URL(`../assets/ui/${file}`, import.meta.url)), file)
  }
  const audioFiles = [...new Set([...Object.values(sharedModule.TTS_TOGGLE_SOUND_FILES).flat(), ...sharedModule.TTS_VOLUME_PREVIEW_FILES])]
  for (const file of audioFiles) {
    const data = await readFile(new URL(`../assets/audio/${file}`, import.meta.url))
    assert.ok(data.byteLength > 0, file)
    assert.equal(data[0], 0xff, file)
    assert.equal(data[1] & 0xe0, 0xe0, file)
  }
})

test('resolved settings enforce safe playback defaults', () => {
  assert.equal(resolveTtsSettings({ enabled: false, autoPlay: true }).autoPlay, false)
  assert.equal(resolveTtsSettings({ enabled: true, autoPlay: true }).autoPlay, true)
  assert.equal(resolveTtsSettings({ model: 'browser-local-fallback' }).model, 'mimo-v2.5-tts')
  const voiceDesign = resolveTtsSettings({ model: 'mimo-v2.5-tts-voicedesign', voiceDesignPrompt: '青年女性，清亮自然，语速适中。' })
  assert.equal(voiceDesign.model, 'mimo-v2.5-tts-voicedesign')
  assert.equal(voiceDesign.voiceDesignPrompt, '青年女性，清亮自然，语速适中。')
  assert.equal(voiceDesign.voiceDesignCustomPrompt, '青年女性，清亮自然，语速适中。')
})

test('prepares speech text by keeping prose and normalizing whitespace and punctuation', () => {
  assert.equal(
    prepareTtsText('  你好，\n\n世界！\\n下一句。  '),
    '你好.世界! 下一句.',
  )
})

test('splits VoiceDesign text at natural boundaries within the request limit', () => {
  const text = Array.from({ length: 8 }, (_, index) => `第${index + 1}句内容足够长，用于验证分片朗读的语义边界。`).join('')
  const segments = splitTtsSegments(text, 60, 80)
  assert.ok(segments.length > 1)
  assert.equal(segments.join(''), prepareTtsText(text))
  assert.ok(segments.every((segment) => countTtsSpeechCharacters(segment) <= 80))
})

test('resolves read scope and migrates the legacy first-segment setting', () => {
  assert.equal(resolveTtsSettings({}).voiceDesignPlaybackMode, 'complete')
  assert.equal(resolveTtsSettings({}).readScope, 'smart')
  assert.equal(resolveTtsSettings({ readScope: 'full' }).readScope, 'full')
  assert.equal(resolveTtsSettings({ voiceDesignPlaybackMode: 'first-segment' }).readScope, 'first-segment')
  assert.equal(resolveTtsReadScope('smart', true), 'first-segment')
  assert.equal(resolveTtsReadScope('smart', false), 'full')
  assert.equal(resolveTtsReadScope('first-segment', false), 'first-segment')
  assert.ok(countTtsSpeechCharacters(applyTtsReadScope('你好。' + '很长的内容。'.repeat(50), 'first-segment')) <= MAX_TTS_SEGMENT_CHARACTERS)
  const smartText = '第一段内容足够长。第二段内容也足够长。后续内容不应进入自动播报。'
  assert.equal(applyTtsPlaybackScope(smartText, 'smart', true), firstTtsSegments(smartText, 2))
})

test('keeps Smart closing cues nonempty and unique', () => {
  assert.ok(Array.isArray(TTS_SMART_TRUNCATION_OUTROS))
  assert.ok(TTS_SMART_TRUNCATION_OUTROS.length > 0)
  assert.ok(TTS_SMART_TRUNCATION_OUTROS.every((cue) => typeof cue === 'string' && cue.trim().length > 0))
  assert.equal(new Set(TTS_SMART_TRUNCATION_OUTROS).size, TTS_SMART_TRUNCATION_OUTROS.length)
})

test('adds a Smart closing cue only when unread speech is at least as long as the spoken segment', () => {
  const spoken = '甲'.repeat(10)
  assert.equal(appendTtsSmartTruncationOutro(spoken, spoken, () => 0), spoken)
  assert.equal(appendTtsSmartTruncationOutro(`${spoken}${'乙'.repeat(9)}`, spoken, () => 0), spoken)
  assert.equal(
    appendTtsSmartTruncationOutro(`${spoken}${'乙'.repeat(10)}`, spoken, () => 0),
    `${spoken}。${TTS_SMART_TRUNCATION_OUTROS[0]}`,
  )
  assert.equal(
    appendTtsSmartTruncationOutro(`${spoken},${'乙'.repeat(11)}`, `${spoken},`, () => 0.999),
    `${spoken},${TTS_SMART_TRUNCATION_OUTROS.at(-1)}`,
  )
})

test('limits randomized closing cues to Smart automatic playback', () => {
  const text = prepareTtsText(`${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。${'乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。${'丙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。${'丁'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`)
  const first = firstTtsSegment(text)
  assert.equal(applyTtsPlaybackScope(text, 'smart', true, () => 0), `${firstTtsSegments(text, 2)}${TTS_SMART_TRUNCATION_OUTROS[0]}`)
  assert.equal(applyTtsPlaybackScope(text, 'smart', false, () => 0), text)
  assert.equal(applyTtsPlaybackScope(text, 'full', true, () => 0), text)
  assert.equal(applyTtsPlaybackScope(text, 'first-segment', true, () => 0), first)
  assert.equal(applyTtsPlaybackScope(text, 'first-segment', false, () => 0), first)
  assert.equal(applyTtsPlaybackScope('简短回复。', 'smart', true, () => 0), prepareTtsText('简短回复。'))
})

test('limits realtime first-segment text monotonically and stops after the boundary', () => {
  const limiter = new TtsFirstSegmentLimiter()
  const text = '第一句内容足够长，用于验证实时首段边界。'.repeat(12) + '第二句不应进入播放队列。'
  const first = limiter.limit(text.slice(0, 90))
  const locked = limiter.limit(text, true)
  assert.ok(first.length > 0)
  assert.ok(locked.startsWith(first))
  assert.equal(limiter.limit(text + '第三句。'), locked)
})

test('selects only the first VoiceDesign segment for first-segment playback', () => {
  const text = Array.from({ length: 16 }, (_, index) => `第${index + 1}句内容足够长，用于验证首段朗读。`).join('')
  const segments = splitTtsSegments(text)
  assert.ok(segments.length > 1)
  assert.equal(firstTtsSegment(text), segments[0])
  assert.ok(firstTtsSegment(text).length < prepareTtsText(text).length)
})

test('keeps Markdown link labels while removing links, URLs, paths, and code blocks', () => {
  assert.equal(
    prepareTtsText([
      '请查看 [官方文档](https://example.com/docs?q=1)。',
      '备用地址 www.example.com 和 example.org/path。',
      String.raw`文件 C:\Users\Alice\notes.txt、/usr/local/bin/app 和 src/index.ts。`,
      '```ts\nconst answer = 42\n```',
      '继续说明。',
    ].join('\n')),
    '请查看 官方文档.备用地址 和.文件 和.继续说明.',
  )
})

test('removes leading periods and collapses adjacent periods after filtering', () => {
  assert.equal(prepareTtsText('\n。你好\n\n世界。。'), '你好.世界.')
  assert.equal(prepareTtsText('你好,.\n世界'), '你好.世界')
})

test('removes emoji, icons, invisible characters, and empty filtered content', () => {
  assert.equal(prepareTtsText('你好 👋‍🌍 ★\u200B，继续。'), '你好,继续.')
  assert.equal(prepareTtsText('https://example.com/path'), '')
  assert.equal(prepareTtsText(String.raw`C:\temp\audio.wav`), '')
  assert.equal(prepareTtsText('```\nignored\n```'), '')
})

test('removes multi-segment paths but keeps single-segment path-like words', () => {
  assert.equal(prepareTtsText(String.raw`复制到 D:\backup\notes.txt 完成`), '复制到 完成')
  assert.equal(prepareTtsText('路径 /usr/local/bin/app 已就绪'), '路径 已就绪')
  assert.equal(prepareTtsText('单段 /usr 和 /home 应保留'), '单段 /usr 和 /home 应保留')
})

test('normalizes Chinese parentheses and colons while keeping ASCII colons', () => {
  assert.equal(prepareTtsText('【提示】（请注意）“测试”：你好，世界！《完》'), '提示,请注意,测试:你好,世界!完')
  assert.equal(prepareTtsText('现在是08:31，请准时开始。'), '现在是08:31,请准时开始.')
  assert.equal(prepareTtsText('他说：“你好”，她答：‘好的’。附注(可略)。'), '他说:你好,她答:好的.附注可略.')
})

test('preserves the colon before emphasized quoted speech through repeated filtering', () => {
  const text = prepareTtsText('但有件事得认：**"发我看看"我做不到**。')
  assert.equal(text, '但有件事得认:发我看看我做不到.')
  assert.equal(prepareTtsText(text), text)
  assert.equal(prepareTtsText('提示： 请先打开相册。'), '提示: 请先打开相册.')
})

test('preserves pauses signaled by em and en dashes', () => {
  assert.equal(prepareTtsText('前一句——后一句'), '前一句,后一句')
  assert.equal(prepareTtsText('前一句 —— 后一句'), '前一句, 后一句')
  assert.equal(prepareTtsText('前一句–后一句－再一句'), '前一句,后一句,再一句')
})

test('turns sentence-level wave dashes and ellipses into periods', () => {
  assert.equal(prepareTtsText('前一句～后一句'), '前一句.后一句')
  assert.equal(prepareTtsText('前一句……后一句⋯再一句'), '前一句.后一句.再一句')
})

test('turns physical line breaks into sentence-ending periods', () => {
  assert.equal(prepareTtsText('第一行\n第二行'), '第一行.第二行')
})

test('splits accumulated assistant text only at completed sentence boundaries', () => {
  const r1 = sharedModule.splitCompletedTtsSentences('第一句。第二句！还没结束')
  assert.deepEqual({ sentences: r1.sentences, remainder: r1.remainder }, { sentences: ['第一句。', '第二句！'], remainder: '还没结束' })
  assert.equal(r1.inCode, false)
  assert.equal(r1.consumed, '第一句。第二句！'.length)

  const r2 = sharedModule.splitCompletedTtsSentences('他说：“好了。”\n下一行；')
  assert.deepEqual({ sentences: r2.sentences, remainder: r2.remainder }, { sentences: ['他说：“好了。”\n', '下一行；'], remainder: '' })
  assert.equal(r2.inCode, false)
  assert.equal(r2.consumed, '他说：“好了。”\n下一行；'.length)
})

test('keeps closing quotes and brackets with their completed sentence', () => {
  for (const [opening, closing] of [['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"]]) {
    const first = `他说：【${opening}好了。${closing}】\n`
    const remainder = '下一句尚未结束'
    const result = sharedModule.splitCompletedTtsSentences(first + remainder)
    assert.deepEqual(result.sentences, [first])
    assert.equal(result.remainder, remainder)
    assert.equal(result.consumed, first.length)
  }
})

test('skips complete fenced code blocks and holds unclosed ones', () => {
  // Complete fenced block: code is dropped entirely.
  const r1 = sharedModule.splitCompletedTtsSentences('你好。\n```python\nprint("hi")\n```\n继续。')
  assert.deepEqual(r1.sentences, ['你好。\n', '继续。'])
  assert.equal(r1.remainder, '')
  assert.equal(r1.inCode, false)
  assert.equal(r1.consumed, '你好。\n```python\nprint("hi")\n```\n继续。'.length)

  // Unclosed fence: held as remainder, inCode=true, consumed stops before the fence.
  const r2 = sharedModule.splitCompletedTtsSentences('你好。\n```python\nprint("hi")')
  assert.deepEqual(r2.sentences, ['你好。\n'])
  assert.equal(r2.remainder, '```python\nprint("hi")')
  assert.equal(r2.inCode, true)
  assert.equal(r2.consumed, '你好。\n'.length)

  // Tilde fences work too.
  const r3 = sharedModule.splitCompletedTtsSentences('开头。\n~~~bash\necho x\n~~~\n结尾。')
  assert.deepEqual(r3.sentences, ['开头。\n', '结尾。'])
  assert.equal(r3.inCode, false)

  // No fences at all — unchanged behaviour.
  const r4 = sharedModule.splitCompletedTtsSentences('仅文本。没有代码。')
  assert.deepEqual(r4.sentences, ['仅文本。', '没有代码。'])
  assert.equal(r4.inCode, false)
})

test('batches short stream sentences until at least twenty spoken characters or final flush', () => {
  assert.equal(MIN_TTS_STREAM_CHARACTERS, 20)
  assert.equal(countTtsSpeechCharacters('第一句，包含标点。'), 7)
  assert.deepEqual(batchTtsStreamText('', '第一句很短。', false), { pending: '第一句很短。', request: null })
  assert.deepEqual(batchTtsStreamText('第一句很短。', '第二句继续补充一些内容，使总字数达到二十个字。', false), {
    pending: '',
    request: '第一句很短。第二句继续补充一些内容，使总字数达到二十个字。',
  })
  assert.deepEqual(batchTtsStreamText('不足二十字。', '', true), { pending: '', request: '不足二十字。' })
})

test('starts browser speech at twenty text characters without counting punctuation or spaces', () => {
  const pending = `${'甲'.repeat(19)}， 。 `
  assert.deepEqual(batchTtsStreamText('', pending, false), { pending, request: null })
  assert.deepEqual(batchTtsStreamText(pending, '乙。', false), { pending: '', request: `${pending}乙。` })
  assert.deepEqual(batchTtsStreamText('', '尾句。', false), { pending: '尾句。', request: null })
})

test('parses PCM SSE records without consuming a partial network record', () => {
  assert.deepEqual(
    sharedModule.parseSseRecords('data: {"choices":[1]}\n\ndata: partial'),
    { events: ['{"choices":[1]}'], remainder: 'data: partial' },
  )
})

test('cancelling the realtime sentence queue aborts the in-flight request and drops queued sentences', async () => {
  const started = []
  let signal
  let finish
  const queue = new sharedModule.AbortableSentenceQueue((sentence, nextSignal) => {
    started.push(sentence)
    signal = nextSignal
    return new Promise((resolve) => { finish = resolve })
  })
  queue.enqueue('第一句。')
  await new Promise((resolve) => setTimeout(resolve, 0))
  queue.enqueue('第二句。')
  queue.cancel()
  assert.equal(signal.aborted, true)
  finish()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(started, ['第一句。'])
})

test('realtime sentence queue stays busy across sentences and stops after one request error', async () => {
  const busy = []
  const started = []
  const finishers = []
  const queue = new sharedModule.AbortableSentenceQueue((sentence) => {
    started.push(sentence)
    return new Promise((resolve) => finishers.push(resolve))
  }, { onBusyChange: (value) => busy.push(value) })
  queue.enqueue('第一句。')
  queue.enqueue('第二句。')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(busy, [true])
  finishers.shift()()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(started, ['第一句。', '第二句。'])
  finishers.shift()()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(busy, [true, false])

  const errors = []
  const failed = new sharedModule.AbortableSentenceQueue(async () => {
    throw new Error('stream failed')
  }, { onBusyChange: (value) => busy.push(value), onError: (error) => errors.push(error.message) })
  failed.enqueue('失败句。')
  failed.enqueue('不会继续。')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(errors, ['stream failed'])
  assert.equal(busy.at(-1), false)
})
