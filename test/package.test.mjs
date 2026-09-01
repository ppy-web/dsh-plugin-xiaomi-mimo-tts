import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const host = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const clientSourceFiles = (await readdir(new URL('../src/client/', import.meta.url)))
  .filter((name) => /\.(?:ts|tsx)$/.test(name))
  .sort()
const clientSource = (await Promise.all(clientSourceFiles.map((name) => readFile(new URL(`../src/client/${name}`, import.meta.url), 'utf8')))).join('\n')
const sharedModule = await import('../lib/shared.js')
const { batchTtsStreamText, countTtsSpeechCharacters, isNewerTtsVersion, MIN_TTS_STREAM_CHARACTERS, prepareTtsText, resolveTtsBaseURL, resolveTtsSettings, TOKEN_PLAN_TTS_BASE_URL, TTS_UPDATE_ROUTE, TTS_VERSION } = sharedModule


test('package declares DSH bundle and Web client entries', () => {
  assert.equal(packageJson.name, 'dsh-xiaomi-tts')
  assert.equal(TTS_VERSION, packageJson.version)
  assert.equal(packageJson.scripts.prepare, 'pnpm run build')
  assert.equal(packageJson.scripts.prepack, 'pnpm run build')
  assert.equal(packageJson.scripts.prepublishOnly, undefined)
  assert.equal(packageJson.scripts['release:check'], 'pnpm run test')
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh.client.platform, 'web')
  assert.equal(TTS_UPDATE_ROUTE, '/plugins/xiaomi-mimo-tts/update')
  assert.equal(packageJson.exports['./client'].default, './lib/client.js')
  assert.match(patch, /id: xiaomi-mimo-tts/)
  assert.match(patch, /name: 'dsh-xiaomi-tts'/)
})

test('only offers strictly newer stable or prerelease versions', () => {
  assert.equal(isNewerTtsVersion('2.3.2', '2.3.1'), true)
  assert.equal(isNewerTtsVersion('2.3.1', '2.3.1'), false)
  assert.equal(isNewerTtsVersion('2.3.0', '2.3.1'), false)
  assert.equal(isNewerTtsVersion('2.4.0-beta.1', '2.4.0-beta.0'), true)
  assert.equal(isNewerTtsVersion('2.4.0-beta.1', '2.4.0-beta'), true)
  assert.equal(isNewerTtsVersion('2.4.0-beta', '2.4.0-beta.1'), false)
  assert.equal(isNewerTtsVersion('2.4.0', '2.4.0-beta.9'), true)
  assert.equal(isNewerTtsVersion('latest', '2.3.1'), false)
})

test('host and shared artifacts contain protected TTS route and secret settings schema', () => {
  assert.equal(sharedModule.TTS_ROUTE, '/plugins/xiaomi-mimo-tts/synthesize')
  assert.equal(sharedModule.TTS_STREAM_ROUTE, '/plugins/xiaomi-mimo-tts/synthesize-stream')
  assert.equal(sharedModule.TTS_UNINSTALL_ROUTE, '/plugins/xiaomi-mimo-tts/uninstall')
  assert.equal(sharedModule.TTS_API_KEY_STATUS_ROUTE, '/plugins/xiaomi-mimo-tts/api-key-status')
  assert.equal(sharedModule.TTS_VOICE_DESIGN_ASSET_ROUTE, '/plugins/xiaomi-mimo-tts/voice-presets')
  assert.equal(sharedModule.TTS_VOICE_ASSET_ROUTE, '/plugins/xiaomi-mimo-tts/voice-avatars')
  assert.deepEqual(sharedModule.TTS_MODELS, ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign'])
  assert.deepEqual(sharedModule.TTS_FORMATS, ['pcm', 'mp3', 'wav'])
  assert.deepEqual(sharedModule.TTS_VOICE_PRESETS.map((item) => item.value), ['冰糖', 'Mia', '茉莉', 'Chloe', '苏打', 'Milo', '白桦', 'Dean'])
  assert.equal(new Set(sharedModule.TTS_VOICE_PRESETS.map((item) => item.id)).size, sharedModule.TTS_VOICE_PRESETS.length)
  assert.equal(sharedModule.TTS_VOICE_DESIGN_PRESETS.length, 10)
  assert.equal(new Set(sharedModule.TTS_VOICE_DESIGN_PRESETS.map((item) => item.id)).size, sharedModule.TTS_VOICE_DESIGN_PRESETS.length)
  assert.equal(new Set(sharedModule.TTS_VOICE_DESIGN_PRESETS.map((item) => item.prompt)).size, sharedModule.TTS_VOICE_DESIGN_PRESETS.length)
  assert.ok(sharedModule.TTS_VOICE_DESIGN_PRESETS.every((item) => typeof item.label === 'string' && item.label.trim().length > 0 && typeof item.summary === 'string' && item.summary.trim().length > 0 && typeof item.prompt === 'string' && item.prompt.trim().length > 0))
  assert.deepEqual(sharedModule.TTS_VOICE_DESIGN_PRESETS.find((item) => item.id === 'energetic-girl'), {
    id: 'energetic-girl',
    label: '鲸鱼娘',
    summary: '爱吃白米饭',
    prompt: '年轻女性16-22岁，标准普通话，清透甜美的中高音，音色明亮而不尖锐，带一点轻盈柔软的空气感；吐字清楚、节奏灵动，语速中等偏快，语调自然上扬，情绪开朗亲切又略带俏皮，整体听感温柔、有陪伴感。',
  })
  assert.ok(sharedModule.TTS_VOICE_DESIGN_PRESETS.some((item) => item.id === 'liang-wenfeng'))
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.enabled, true)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.autoPlay, true)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.model, 'mimo-v2.5-tts')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.format, 'pcm')
  assert.match(sharedModule.DEFAULT_TTS_SETTINGS.presetStylePrompt, /清晰、自然、准确/)
  assert.match(sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignPrompt, /青年女性/)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt, sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignPrompt)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.maxMp3AudioBytes, 32 * 1024 * 1024)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.maxWavAudioBytes, 128 * 1024 * 1024)
  assert.equal(TOKEN_PLAN_TTS_BASE_URL, 'https://token-plan-cn.xiaomimimo.com/v1')
  assert.match(host, /TTS_ROUTE/)
  assert.match(host, /prepareTtsText/)
  assert.match(host, /role\(['"]secret['"]\)/)
  assert.match(host, /mimo-v2\.5-tts/)
  assert.match(host, /mimo-v2\.5-tts-voicedesign/)
  assert.match(host, /voiceDesignPrompt/)
  assert.match(host, /audio: options\.model ===/)
  assert.match(host, /completeAudioFormat\(options\)/)
  assert.match(host, /options\.format === ["']wav["'] \? ["']wav["'] : ["']mp3["']/)
  assert.match(host, /chat\/completions/)
  assert.match(host, /resolveTtsBaseURL\(options\.apiKey, options\.baseURL\)/)
  assert.match(host, /TTS_API_KEY_STATUS_ROUTE/)
  assert.doesNotMatch(host, /dsh-xiaomi-tts\/1\.1\.1/)
  assert.match(host, /createRequire/)
  assert.match(host, /TTS_STREAM_ROUTE/)
  assert.match(host, /TTS_UNINSTALL_ROUTE/)
  assert.match(host, /same-origin-required/)
  assert.match(host, /json\(res, result\.ok \? 200 : 500/)
  assert.match(host, /["']--lockfile-only["']/)
  const uninstallHost = host.slice(host.indexOf('function scheduleProfileLinkCleanup'), host.indexOf('/** Register the TTS settings'))
  assert.doesNotMatch(uninstallHost, /taskkill\.exe/)
  assert.match(host, /plugin["']?,\s*["']--profile["']?,\s*WEB_PROFILE_NAME,\s*["']remove["']?,\s*PACKAGE_NAME/s)
  assert.doesNotMatch(client, /dsh-market\/uninstall/)
  assert.match(client, /hostRoute\(TTS_UNINSTALL_ROUTE\)/)
  assert.match(host, /process\.kill\(parentPid,\s*0\)/)
  assert.match(host, /item\.isSymbolicLink\(\)/)
  assert.match(host, /rmSync\(linkPath,\s*\{\s*force:\s*true\s*\}\)/)
  assert.doesNotMatch(host, /updateWebProfile/)
  assert.match(client, /✨查看源码/)
  assert.match(client, /🎉新版已发布/)
  assert.match(client, /dsh-plugin-xiaomi-mimo-tts\/releases/)
  assert.match(host, /presetStylePrompt/)
  assert.match(host, /mimo-v2\.5-tts-voicedesign"\s*\?\s*options\.voiceDesignPrompt\.trim\(\)\s*:/)
  assert.match(host, /format:\s*["']pcm16["']/)
  assert.match(host, /stream:\s*true/)
  assert.match(host, /req\.once\(['"]aborted['"]/)
  assert.match(host, /maxMp3AudioBytes/)
  assert.match(host, /maxWavAudioBytes/)
  assert.match(host, /xiaomi-response-too-large/)
  assert.match(host, /invalid-audio-base64/)
  assert.match(host, /audio-too-large/)
  assert.match(host, /invalid-audio-format/)
  assert.match(host, /res\.once\(['"]close['"]/)
  assert.match(host, /!res\.writableEnded/)
  assert.match(host, /voice preset assets/)
  assert.match(host, /built-in voice assets/)
  assert.match(host, /image\/webp/)
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
  assert.equal(sharedModule.strictBase64DecodedLength(''), null)
  assert.equal(sharedModule.strictBase64DecodedLength('abc'), null)
  assert.equal(sharedModule.strictBase64DecodedLength('ab=c'), null)
  assert.equal(sharedModule.strictBase64DecodedLength('YW Jj'), null)
  assert.equal(sharedModule.strictBase64DecodedLength('YWJj\n'), null)
})

test('ships one optimized icon for every Voice Design preset', async () => {
  const iconFiles = (await readdir(new URL('../assets/voice-presets/', import.meta.url))).sort()
  assert.deepEqual(iconFiles, sharedModule.TTS_VOICE_DESIGN_PRESETS.map((item) => `${item.id}.webp`).sort())
  for (const file of iconFiles) {
    const data = await readFile(new URL(`../assets/voice-presets/${file}`, import.meta.url))
    assert.equal(data.toString('ascii', 0, 4), 'RIFF')
    assert.equal(data.toString('ascii', 8, 12), 'WEBP')
  }
})

test('ships one official avatar for every built-in voice', async () => {
  const avatarFiles = (await readdir(new URL('../assets/voice-avatars/', import.meta.url))).sort()
  assert.deepEqual(avatarFiles, sharedModule.TTS_VOICE_PRESETS.map((item) => `${item.id}.webp`).sort())
  for (const file of avatarFiles) {
    const data = await readFile(new URL(`../assets/voice-avatars/${file}`, import.meta.url))
    assert.equal(data.toString('ascii', 0, 4), 'RIFF')
    assert.equal(data.toString('ascii', 8, 12), 'WEBP')
  }
})

test('build emits declarations only for the private client modules', async () => {
  const clientArtifacts = (await readdir(new URL('../lib/client', import.meta.url))).sort()
  assert.ok(clientArtifacts.every((name) => name.endsWith('.d.ts') || name.endsWith('.d.ts.map')))
  assert.deepEqual(
    clientArtifacts.filter((name) => name.endsWith('.d.ts')),
    ['built-in-voice-picker.d.ts', 'conversation.d.ts', 'index.d.ts', 'live-speech-controller.d.ts', 'localization.d.ts', 'pcm-audio-queue.d.ts', 'playback-controller.d.ts', 'playback-types.d.ts', 'playback.d.ts', 'settings-card.d.ts', 'settings-scope.d.ts', 'styles.d.ts', 'voice-design-picker.d.ts'],
  )
})

test('keeps the client entry focused on DSH composition', async () => {
  const entry = await readFile(new URL('../src/client/index.tsx', import.meta.url), 'utf8')
  assert.ok(entry.split(/\r?\n/).length < 150)
  assert.match(entry, /from '\.\/playback\.js'/)
  assert.match(entry, /from '\.\/conversation\.js'/)
  assert.match(entry, /from '\.\/settings-card\.js'/)
  assert.doesNotMatch(entry, /class PcmAudioQueue/)
  assert.doesNotMatch(entry, /function SettingsCard/)
})

test('resolved settings disable automatic playback when the plugin is disabled', () => {
  assert.equal(resolveTtsSettings({ enabled: false, autoPlay: true }).autoPlay, false)
  assert.equal(resolveTtsSettings({ enabled: true, autoPlay: true }).autoPlay, true)
})

test('resolves the Voice Design settings without exposing a preset voice in the client form', () => {
  const resolved = resolveTtsSettings({
    model: 'mimo-v2.5-tts-voicedesign',
    voiceDesignPrompt: '青年女性，清亮自然，语速适中。',
  })
  assert.equal(resolved.model, 'mimo-v2.5-tts-voicedesign')
  assert.equal(resolved.voiceDesignPrompt, '青年女性，清亮自然，语速适中。')
  assert.equal(resolved.voiceDesignCustomPrompt, '青年女性，清亮自然，语速适中。')
  assert.match(client, /settings\.voiceDesignPrompt/)
  assert.match(client, /mimo-v2\.5-tts-voicedesign/)
  assert.match(client, /model === ["']mimo-v2\.5-tts-voicedesign["']/)
  assert.doesNotMatch(client, /settings\.instruction/)
  assert.doesNotMatch(client, /xmimo-tts-instruction/)
  assert.match(client, /xmimo-tts-model xmimo-tts-wide/)
  assert.match(clientSource, /model === 'mimo-v2\.5-tts' \? <>/)
  assert.match(client, /CUSTOM_VOICE_DESIGN_OPTION = ["']__custom__["']/)
  assert.match(clientSource, /function VoiceDesignPresetPicker/)
  assert.match(clientSource, /aria-haspopup="listbox"/)
  assert.match(clientSource, /role="option"/)
  assert.match(clientSource, /TTS_VOICE_DESIGN_ASSET_ROUTE/)
  assert.match(clientSource, /value=\{isPresetVoiceDesignPrompt\(voiceDesignPrompt\) \? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION\}/)
  assert.match(client, /setVoiceDesignCustomPrompt\(next\)/)
  assert.match(client, /voiceDesignCustomPrompt/)
  assert.match(clientSource, /settings\.formatPcmHint/)
  assert.match(clientSource, /useState\(initial\.format\)/)
  assert.match(clientSource, /<BuiltInVoicePicker value=\{voice\}/)
  assert.match(clientSource, /TTS_VOICE_ASSET_ROUTE/)
  assert.match(clientSource, /xmimo-tts-builtin-voice-menu/)
  assert.doesNotMatch(client, /xmimo-tts-select-column/)
  assert.match(client, /xmimo-tts-voice\{display:flex;min-width:0;flex-direction:column/)
  assert.match(client, /PCM（流式播放）/)
  assert.match(client, /MP3（完整音频）/)
  assert.match(client, /WAV（完整音频）/)
})

test('prepares speech text by keeping prose and normalizing whitespace and punctuation', () => {
  assert.equal(
    prepareTtsText('  你好，\n\n世界！\\n下一句。  '),
    '你好..世界! 下一句.',
  )
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

test('live speech only replaces playback when the session or turn changes', () => {
  const first = { sessionId: 'session-1', turn: 1, step: 1 }
  assert.equal(sharedModule.classifyLiveSpeechTransition(null, first), 'new-turn')
  assert.equal(sharedModule.classifyLiveSpeechTransition(first, { ...first }), 'same-step')
  assert.equal(sharedModule.classifyLiveSpeechTransition(first, { ...first, step: 4 }), 'same-turn')
  assert.equal(sharedModule.classifyLiveSpeechTransition(first, { ...first, turn: 2, step: 1 }), 'new-turn')
  assert.equal(sharedModule.classifyLiveSpeechTransition(first, { ...first, sessionId: 'session-2' }), 'new-turn')

  assert.match(clientSource, /transition === 'same-turn'\) this\.advanceSegment\(next\)/)
  assert.match(clientSource, /private advanceSegment\(next: LiveSpeechCursor\): void \{\s*this\.drain\(true\)\s*this\.beginSegment\(next, true\)\s*\}/)
  assert.match(clientSource, /const previous = finalLiveMessage\(session, active\.current\.turn, active\.current\.step\)/)
  assert.match(clientSource, /private messageId: string \| null = null/)
})

test('client output registers the message action and plugin settings card', () => {
  assert.match(client, /conversation\.chat\.assistant-actions/)
  assert.match(clientSource, /session\.partial/)
  assert.match(client, /TTS_STREAM_ROUTE/)
  assert.match(client, /new AudioContext\(\)/)
  assert.match(clientSource, /live\.cancelSession\(sessionId\)/)
  assert.doesNotMatch(clientSource, /!session\.running&&partial!==null\)\{live\.cancelSession\(sessionId\)/)
  assert.match(client, /prepareTtsText/)
  assert.match(client, /settingsSnapshot\.value\?\.enabled !== true/)
  assert.match(client, /checked: enabled && autoPlay/)
  assert.doesNotMatch(client, /Date\.now\(\) - this\.autoPlayArmedAt < 30000/)
  assert.match(clientSource, /playCompletedReply\(true\)/)
  assert.match(client, /claimAutomaticPlayback\(sessionId, messageId\)/)
  assert.doesNotMatch(client, /settings\.apiKeyHint/)
  assert.match(clientSource, /const apiKeyMessage = enteredApiKey\.length > 0/)
  assert.match(clientSource, /isSupportedTtsApiKey\(enteredApiKey\) \? t\('settings\.apiKeyStatus'\) : t\('settings\.apiKeyUnsupported'\)/)
  assert.match(clientSource, /settings\.apiKeyMissing/)
  assert.match(clientSource, /settings\.apiKeyUnsupported/)
  assert.match(clientSource, /settings\.apiKeyStatus/)
  assert.match(clientSource, /fetch\(TTS_API_KEY_STATUS_ROUTE/)
  assert.match(clientSource, /apiKeyStatus === 'missing' \|\| apiKeyStatus === 'unsupported'/)
  assert.match(client, /platform\.xiaomimimo\.com\/console\/api-keys/)
  assert.match(client, /noopener noreferrer/)
  assert.match(client, /new-password/)
  assert.match(client, /data-lpignore/)
  assert.match(client, /data-bwignore/)
  assert.match(client, /settings\.plugin\.item/)
  assert.match(client, /locale: NS/)
  assert.match(client, /aria-expanded": open/)
  assert.match(client, /settings\.expand/)
  assert.match(client, /settings\.unsaved/)
  assert.match(client, /settings\.discard/)
  assert.match(client, /settings\.uninstall/)
  assert.match(client, /xmimo-tts-uninstall/)
  assert.match(client, /xmimo-tts-uninstall-confirmation/)
  assert.doesNotMatch(client, /window\.confirm/)
  assert.match(client, /#F56C6C/)
  assert.match(client, /settings\.reset/)
  assert.match(client, /settings\.modelAutoPlayHintPreset/)
  assert.match(client, /settings\.modelAutoPlayHintVoiceDesign/)
  assert.match(client, /enabled\s*&&\s*autoPlay/)
  assert.match(client, /scope\.unset/)
  assert.match(client, /xmimo-tts-pending/)
  assert.match(client, /xmimo-tts-card-open\{background:[^}]*border-color/)
  assert.match(client, /xmimo-tts-card-header:focus-visible/)
  assert.match(client, /xmimo-tts-action\{width:28px;height:28px/)
  assert.match(client, /interactive-bg-hover/)
  assert.match(client, /padding:6px/)
  assert.match(client, /cursor:default;opacity:\.45/)
  assert.match(client, /scope\.getSnapshot\(\)/)
  assert.match(client, /window\.__ModuleLoader__\.load/)
})

test('automatic playback only consumes the latest message from a live run once', () => {
  assert.match(client, /conversation\.input\.dock/)
  assert.match(clientSource, /playback\.observeSession\(sessionId, session\.running && runArmed\.current, latestMessageId\)/)
  assert.match(client, /completedMessages\.get\(sessionId\) !== messageId/)
  assert.match(client, /running: snapshot\.running/)
  assert.match(client, /message\.latestMessageId !== messageId/)
  assert.match(client, /message\.running \|\|/)
  assert.match(client, /automaticallyPlayed\.has\(key\)/)
  assert.match(client, /claimAutomaticPlayback\(sessionId, messageId\)/)
})

test('completed preset replies stream only for PCM and complete formats keep pause and resume', () => {
  assert.match(client, /live\.setStateChangeListener/)
  assert.match(client, /updateLivePlayback/)
  assert.match(clientSource, /live\.stop\(sessionId\)/)
  assert.match(clientSource, /source === 'live'/)
  assert.match(clientSource, /disabled=\{status === 'loading' && !liveActive\}/)
  assert.match(clientSource, /resolvedSettings\.model === 'mimo-v2\.5-tts'/)
  assert.match(clientSource, /live\.playCompleted\(sessionId, messageId, text/)
  assert.match(clientSource, /playback\.toggle\(sessionId, messageId, text, automatic\)/)
  assert.match(clientSource, /if \(resolvedSettings\.model === 'mimo-v2\.5-tts' && resolvedSettings\.format === 'pcm'\)[\s\S]*live\.playCompleted[\s\S]*return\s*}\s*live\.cancelSession\(sessionId\)\s*void playback\.toggle/)
  assert.match(clientSource, /resolvedSettings\.format !== 'pcm'/)
  assert.match(clientSource, /if \(audio\.paused\)[\s\S]*await audio\.play\(\)[\s\S]*else \{\s*audio\.pause\(\)/)
  assert.match(clientSource, /private completed: CompletedStreamPlayback \| null = null/)
  assert.match(clientSource, /if \(completed !== null && !completed\.audioStarted\)/)
  assert.match(clientSource, /if \(!receivedPcm && this\.isCurrentStream/)
  assert.match(clientSource, /status === 'playing' && this\.completed !== null/)
})

test('switching sessions resets every playback path and ignores a run re-entered mid-stream', () => {
  assert.match(clientSource, /private activeSessionId: string \| null = null/)
  assert.match(clientSource, /activateSession\(sessionId: string\): void/)
  assert.match(clientSource, /deactivateSession\(sessionId: string\): void/)
  assert.match(clientSource, /this\.activeSessionId !== sessionId\) return/)
  assert.match(clientSource, /setStateChangeListener\(listener: \(sessionId: string, messageId: string, status: PlaybackStatus\)/)
  assert.match(clientSource, /updateLivePlayback\(sessionId: string, messageId: string, status: PlaybackStatus\)/)
  assert.match(clientSource, /const runArmed = useRef\(!session\.running\)/)
  assert.match(clientSource, /if \(!runArmed\.current\) return/)
  assert.match(clientSource, /live\.deactivateSession\(sessionId\)/)
  assert.match(clientSource, /playback\.deactivateSession\(sessionId\)/)
  assert.match(clientSource, /playback\.cancelPlayback\(sessionId\)/)
  assert.match(clientSource, /generation !== this\.generation \|\| this\.activeSessionId !== sessionId \|\| this\.current\?\.audio !== audio/)
  assert.match(clientSource, /source: null, status: 'idle'/)
})

test('a new live run cancels the previous PCM generation before its late chunks can be queued', () => {
  assert.match(client, /streamGeneration/)
  assert.match(client, /replaceQueue\(\)/)
  assert.match(client, /isCurrentStream\(generation, signal\)/)
  assert.match(client, /beganRun/)
  assert.match(client, /revision !== this\.revision/)
})

test('live playback has one stable status window and a terminal stop/error path', () => {
  assert.match(clientSource, /onPlaybackStart: \(\) => this\.setStatus\('playing'\)/)
  assert.match(clientSource, /private maybeFinishPlayback\(\): void/)
  assert.match(clientSource, /if \(!this\.requestBusy && !this\.audioBusy && \(this\.status === 'loading' \|\| this\.status === 'playing'\)\)/)
  assert.match(clientSource, /private blockedTurn: string \| null = null/)
  assert.match(clientSource, /this\.blockedTurn === turnKey/)
  assert.match(clientSource, /private handleStreamError\(error: unknown\): void/)
  assert.match(clientSource, /private releaseCurrentAudio\(audio: HTMLAudioElement\): void/)
  assert.match(clientSource, /this\.audio\.stop\(\)/)
})
