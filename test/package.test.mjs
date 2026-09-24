import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const readmeZh = await readFile(new URL('../README.md', import.meta.url), 'utf8')
const readmeEn = await readFile(new URL('../README.en.md', import.meta.url), 'utf8')
const sharedModule = await import('../lib/shared.js')
const {
  appendTtsSmartTruncationOutro,
  applyTtsPlaybackScope,
  applyTtsReadScope,
  batchTtsStreamText,
  countTtsSpeechCharacters,
  DEFAULT_TTS_SEGMENT_CHARACTERS,
  firstTtsSegment,
  isNewerTtsVersion,
  MAX_TTS_SEGMENT_CHARACTERS,
  MIN_TTS_SEGMENT_CHARACTERS,
  MIN_TTS_STREAM_CHARACTERS,
  prepareTtsText,
  resolveTtsBaseURL,
  resolveTtsReadScope,
  resolveTtsSettings,
  splitTtsSegments,
  TTS_READ_SCOPES,
  TTS_SMART_TRUNCATION_OUTROS,
  TOKEN_PLAN_TTS_BASE_URL,
  TTS_UPDATE_ROUTE,
  TTS_VERSION,
  TtsFirstSegmentLimiter,
} = sharedModule

const SUPPORTED_DSH_PACKAGE_PREFIX = '@deepseek-ai/dsh-'

async function assertLocalReadmeTargets(source, label) {
  const targets = [...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)|(?:src|href)="([^"]+)"/g)]
    .map((match) => match[1] ?? match[2])
    .filter((target) => !/^(?:[a-z]+:|#)/iu.test(target))
    .map((target) => decodeURIComponent(target.split('#', 1)[0]))
  assert.ok(targets.length > 0, `${label} should contain local links or assets`)
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
  assert.equal(packageJson.scripts.prepare, 'node scripts/prepare-package.mjs')
  assert.equal(packageJson.scripts.prepack, 'pnpm run build && node scripts/pack-package.mjs')
  assert.equal(packageJson.scripts.postpack, 'node scripts/restore-package-scripts.mjs')
  assert.equal(packageJson.scripts['release:check'], 'pnpm run test')
  assert.equal(packageJson.scripts['profile:check'], 'node scripts/dsh-profile-verify.mjs')
  assert.ok(packageJson.files.includes('scripts/prepare-package.mjs'))
  assert.ok(packageJson.files.includes('NOTICE'))
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh.client.platform, 'web')
  assert.ok(packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-settings'))
  assert.ok(packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-chat'))
  assert.ok(!packageJson.dsh.client.inject.includes('@deepseek-ai/dsh-client-runtime'))
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-client-runtime'], undefined)
  assert.equal(packageJson.devDependencies['@deepseek-ai/dsh-client-runtime'], undefined)

  for (const [name, range] of Object.entries(packageJson.peerDependencies)) {
    if (name.startsWith(SUPPORTED_DSH_PACKAGE_PREFIX)) assert.ok(range, `${name} should declare a peer range`)
    assert.equal(packageJson.peerDependenciesMeta[name]?.optional, true, `${name} must be optional`)
  }
  assert.equal(TTS_UPDATE_ROUTE, '/plugins/xiaomi-mimo-tts/update')
  assert.ok(packageJson.exports['./client']?.default)
  assert.ok(packageJson.exports['./client-api']?.types)
  assert.ok(packageJson.exports['./client-api']?.default)
})

test('README files keep required structure and local targets valid', async () => {
  await Promise.all([
    assertLocalReadmeTargets(readmeZh, 'README.md'),
    assertLocalReadmeTargets(readmeEn, 'README.en.md'),
  ])
  for (const [readme, label, privacyHeading, developmentHeading] of [
    [readmeZh, 'README.md', '隐私与网络访问', '开发'],
    [readmeEn, 'README.en.md', 'Privacy and network access', 'Development'],
  ]) {
    assert.match(readme, /https:\/\/ppy-web\.github\.io\/dsh-plugin-xiaomi-mimo-tts/u)
    assert.match(readme, /src\/client\/settings\/card\.tsx/u)
    assert.match(readme, /pnpm dev:build/u)
    assert.match(readme, /Web Speech API/u)
    assert.match(readme, new RegExp(`(?:^|\\r?\\n)##\\s+[^\\r\\n]*${privacyHeading}`, 'u'), `${label} should retain privacy guidance`)
    assert.match(readme, new RegExp(`(?:^|\\r?\\n)##\\s+[^\\r\\n]*${developmentHeading}`, 'u'), `${label} should retain development guidance`)
    assert.doesNotMatch(readme, /src\/client\/settings-card\.tsx/u)
  }
  assert.match(readmeZh, /自动播报[^\r\n。；]*关闭/u)
  assert.match(readmeEn, /automatic playback[^\r\n.;]*disabled/iu)
})

test('Voice Design remains manual and has no AI-only dependency contract', () => {
  assert.equal(sharedModule.VOICE_DESIGN_AI_RPC_CHANNEL, undefined)
  assert.equal(sharedModule.VOICE_DESIGN_AI_RPC_ENDPOINT, undefined)
  assert.equal(sharedModule.TTS_VOICE_DESIGN_AI_STATUS_ROUTE, undefined)
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-client-connection'], undefined)
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-agent-default-model'], undefined)
  assert.equal(packageJson.peerDependencies['@deepseek-ai/dsh-llm'], undefined)
  assert.ok(sharedModule.TTS_MODELS.includes('mimo-v2.5-tts-voicedesign'))
  assert.ok(sharedModule.TTS_VOICE_DESIGN_PRESETS.length > 0)
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
    sharedModule.TTS_MIXER_WHALE_ASSET_ROUTE,
    sharedModule.TTS_PREVIEW_WHALE_ASSET_ROUTE,
    sharedModule.TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE,
    sharedModule.TTS_SOUND_EFFECT_CUES_ASSET_ROUTE,
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
  const iconFiles = (await readdir(new URL('../assets/voice-presets/', import.meta.url))).sort()
  assert.deepEqual(iconFiles, sharedModule.TTS_VOICE_DESIGN_PRESETS.map((item) => `${item.id}.webp`).sort())
  for (const file of iconFiles) assertWebp(await readFile(new URL(`../assets/voice-presets/${file}`, import.meta.url)), file)
})

test('ships one valid WebP avatar for every built-in voice', async () => {
  const avatarFiles = (await readdir(new URL('../assets/voice-avatars/', import.meta.url))).sort()
  assert.deepEqual(avatarFiles, sharedModule.TTS_VOICE_PRESETS.map((item) => `${item.id}.webp`).sort())
  for (const file of avatarFiles) assertWebp(await readFile(new URL(`../assets/voice-avatars/${file}`, import.meta.url)), file)
})

test('ships the UI image and audio assets referenced by shared contracts', async () => {
  assertWebp(await readFile(new URL('../assets/ui/toggle-characters.webp', import.meta.url)), 'toggle characters')
  for (const file of ['api-key-whale.webp', 'mixer-whale.webp', 'preview-whale.webp', 'sound-effects-whale.webp', 'sound-effect-cues.webp']) {
    assertWebp(await readFile(new URL(`../assets/ui/${file}`, import.meta.url)), file)
  }
  const audioFiles = (await readdir(new URL('../assets/audio/', import.meta.url))).sort()
  const expected = [...new Set([...Object.values(sharedModule.TTS_TOGGLE_SOUND_FILES).flat(), ...sharedModule.TTS_VOLUME_PREVIEW_FILES])].sort()
  assert.deepEqual(audioFiles, expected)
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
    '你好..世界! 下一句.',
  )
})

test('splits VoiceDesign text at natural boundaries within the request limit', () => {
  const text = Array.from({ length: 8 }, (_, index) => `第${index + 1}句内容足够长，用于验证分片朗读的语义边界。`).join('')
  const segments = splitTtsSegments(text, 60, 80)
  assert.ok(segments.length > 1)
  assert.equal(segments.join(''), prepareTtsText(text))
  assert.ok(segments.every((segment) => countTtsSpeechCharacters(segment) <= 80))
})

test('keeps default VoiceDesign segments conservative', () => {
  assert.equal(DEFAULT_TTS_SEGMENT_CHARACTERS, 160)
  assert.equal(MAX_TTS_SEGMENT_CHARACTERS, 240)
  assert.equal(MIN_TTS_SEGMENT_CHARACTERS, 50)
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
  const text = prepareTtsText(`${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。${'乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`)
  const first = firstTtsSegment(text)
  assert.equal(applyTtsPlaybackScope(text, 'smart', true, () => 0), `${first}${TTS_SMART_TRUNCATION_OUTROS[0]}`)
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
    '请查看 官方文档..备用地址 和.文件 和...继续说明.',
  )
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

test('normalizes Chinese parentheses and keeps ASCII colons', () => {
  assert.equal(prepareTtsText('【提示】（请注意）“测试”：你好，世界！《完》'), '提示,请注意,测试你好,世界!完')
  assert.equal(prepareTtsText('现在是08:31，请准时开始。'), '现在是08:31,请准时开始.')
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
