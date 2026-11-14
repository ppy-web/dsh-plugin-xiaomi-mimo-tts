import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fromMarkdown } from 'mdast-util-from-markdown'

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

function documentedPnpmCommands(markdown) {
  const commands = []
  const visit = node => {
    if (node.type === 'code' || node.type === 'inlineCode') {
      for (const [, command] of node.value.matchAll(/\bpnpm\s+(?:run\s+)?([a-zA-Z][\w:-]*)/g)) commands.push(command)
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(fromMarkdown(markdown))
  return commands
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
  for (const name of ['README.md', 'handbook.md', 'intro.md', 'open-api.md']) {
    const source = name === 'README.md' ? readmeZh : await readFile(new URL(`../${name}`, import.meta.url), 'utf8')
    await assertLocalDocumentTargets(source, name)
    for (const command of documentedPnpmCommands(source)) {
      assert.ok(Object.hasOwn(packageJson.scripts, command) || ['install', 'pack'].includes(command), `${name}: unknown pnpm command ${command}`)
    }
  }
})

test('documented command discovery distinguishes package-manager versions and prose from executable examples', () => {
  const markdown = 'Use pnpm 11.28.5. The phrase pnpm troubleshooting is prose.\n\n'
    + '`pnpm typecheck:host` and `pnpm 11.28.5`.\n\n```sh\npnpm install --frozen-lockfile\npnpm run dev:build\npnpm missing-script\n```'
  assert.deepEqual(documentedPnpmCommands(markdown), ['typecheck:host', 'install', 'dev:build', 'missing-script'])
})

test('shared route and settings contracts are internally consistent', () => {
  const routes = [
    sharedModule.TTS_ROUTE,
    sharedModule.TTS_STREAM_ROUTE,
    sharedModule.TTS_API_KEY_STATUS_ROUTE,
    sharedModule.TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
    sharedModule.TTS_API_KEY_WHALE_ASSET_ROUTE,
    sharedModule.TTS_TOGGLE_AUDIO_ASSET_ROUTE,
  ]
  assert.ok(routes.every((route) => route.startsWith('/plugins/xiaomi-mimo-tts/')))
  assert.ok(Object.values(sharedModule.TTS_TOGGLE_SOUND_FILES).every((files) => files.length > 0 && files.every((file) => file.endsWith('.mp3'))))
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.enabled, true)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.autoPlay, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.soundEnabled, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.taskSounds, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.clickSounds, false)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.localSpeechMode, 'auto')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.readScope, 'smart')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt, sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignPrompt)
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

test('ships the UI image and audio assets referenced by shared contracts', async () => {
  const imageRoutes = [...Object.values(sharedModule.TTS_PROVIDER_CHARACTER_ASSET_ROUTES), ...Object.values(sharedModule.TTS_PROVIDER_LOGO_ASSET_ROUTES)]
  assert.equal(new Set(imageRoutes).size, imageRoutes.length)
  assertWebp(await readFile(new URL('../assets/ui/toggle-characters.webp', import.meta.url)), 'toggle characters')
  assertWebp(await readFile(new URL('../assets/ui/api-key-whale.webp', import.meta.url)), 'API key whale')
  assertWebp(await readFile(new URL('../assets/plugin-icons/avatar.webp', import.meta.url)), 'shared plugin and history icon')
  for (const route of [...Object.values(sharedModule.TTS_PROVIDER_CHARACTER_ASSET_ROUTES), sharedModule.TTS_QQ_GROUP_ASSET_ROUTE]) {
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
  assert.equal(resolveTtsSettings({ readScope: 'first-segment' }).readScope, 'concise')
  assert.equal(resolveTtsSettings({ voiceDesignPlaybackMode: 'first-segment' }).readScope, 'concise')
  assert.equal(resolveTtsSettings({ readScope: 'full', voiceDesignPlaybackMode: 'first-segment' }).readScope, 'full')
  assert.equal(resolveTtsReadScope('smart', true), 'first-segment')
  assert.equal(resolveTtsReadScope('smart', false), 'full')
  assert.equal(resolveTtsReadScope('concise', false), 'concise')
  assert.ok(countTtsSpeechCharacters(applyTtsReadScope('你好。' + '很长的内容。'.repeat(50), 'first-segment')) <= MAX_TTS_SEGMENT_CHARACTERS)
})

test('adds a Smart closing cue only when unread speech is at least as long as the spoken segment', () => {
  assert.ok(TTS_SMART_TRUNCATION_OUTROS.length > 0)
  assert.ok(TTS_SMART_TRUNCATION_OUTROS.every(cue => typeof cue === 'string' && cue.trim()))
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

test('reads one segment and a conditional closing cue in Smart automatic playback', () => {
  const text = prepareTtsText(`${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。${'乙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。${'丙'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。${'丁'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`)
  const first = prepareTtsText(`${'甲'.repeat(DEFAULT_TTS_SEGMENT_CHARACTERS)}。`)
  assert.equal(applyTtsPlaybackScope(text, 'smart', true, () => 0), `${first}${TTS_SMART_TRUNCATION_OUTROS[0]}`)
  assert.equal(applyTtsPlaybackScope(`${first}${'乙'.repeat(120)}.`, 'smart', true, () => 0), first)
  assert.equal(applyTtsPlaybackScope(text, 'smart', false, () => 0), text)
  assert.equal(applyTtsPlaybackScope(text, 'full', true, () => 0), text)
  assert.equal(applyTtsPlaybackScope('简短回复。', 'smart', true, () => 0), prepareTtsText('简短回复。'))
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

test('normalizes speech punctuation and filters non-speech content', () => {
  for (const [input, expected] of [
    ['  你好，\n\n世界！\\n下一句。  ', '你好.世界! 下一句.'],
    ['\n。你好\n\n世界。。', '你好.世界.'],
    ['你好,.\n世界', '你好.世界'],
    ['你好 👋‍🌍 ★\u200B，继续。', '你好,继续.'],
    ['https://example.com/path', ''],
    ['C:\\temp\\audio.wav', ''],
    ['```\nignored\n```', ''],
    ['复制到 D:\\backup\\notes.txt 完成', '复制到 完成'],
    ['路径 /usr/local/bin/app 已就绪', '路径 已就绪'],
    ['单段 /usr 和 /home 应保留', '单段 /usr 和 /home 应保留'],
    ['【提示】（请注意）“测试”：你好，世界！《完》', '提示,请注意,测试:你好,世界!完'],
    ['现在是08:31，请准时开始。', '现在是08:31,请准时开始.'],
    ['他说：“你好”，她答：‘好的’。附注(可略)。', '他说:你好,她答:好的.附注可略.'],
    ['提示： 请先打开相册。', '提示: 请先打开相册.'],
    ['前一句——后一句', '前一句,后一句'],
    ['前一句 —— 后一句', '前一句, 后一句'],
    ['前一句–后一句－再一句', '前一句,后一句,再一句'],
    ['前一句～后一句', '前一句.后一句'],
    ['前一句……后一句⋯再一句', '前一句.后一句.再一句'],
    ['第一行\n第二行', '第一行.第二行'],
  ]) assert.equal(prepareTtsText(input), expected, input)
  const quoted = prepareTtsText('但有件事得认：**"发我看看"我做不到**。')
  assert.equal(quoted, '但有件事得认:发我看看我做不到.')
  assert.equal(prepareTtsText(quoted), quoted)
})

test('splits accumulated assistant text at completed sentence boundaries, retaining closing quotes', () => {
  const r1 = sharedModule.splitCompletedTtsSentences('第一句。第二句！还没结束')
  assert.deepEqual({ sentences: r1.sentences, remainder: r1.remainder }, { sentences: ['第一句。', '第二句！'], remainder: '还没结束' })
  assert.equal(r1.inCode, false)
  assert.equal(r1.consumed, '第一句。第二句！'.length)

  const r2 = sharedModule.splitCompletedTtsSentences('他说：“好了。”\n下一行；')
  assert.deepEqual({ sentences: r2.sentences, remainder: r2.remainder }, { sentences: ['他说：“好了。”\n', '下一行；'], remainder: '' })
  assert.equal(r2.inCode, false)
  assert.equal(r2.consumed, '他说：“好了。”\n下一行；'.length)
  for (const [opening, closing] of [['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"]]) {
    const first = `他说：【${opening}好了。${closing}】\n`
    const remainder = '下一句尚未结束'
    const result = sharedModule.splitCompletedTtsSentences(first + remainder)
    assert.deepEqual(result.sentences, [first])
    assert.equal(result.remainder, remainder)
    assert.equal(result.consumed, first.length)
  }
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
  const pending = `${'甲'.repeat(19)}， 。 `
  assert.deepEqual(batchTtsStreamText('', pending, false), { pending, request: null })
  assert.deepEqual(batchTtsStreamText(pending, '乙。', false), { pending: '', request: `${pending}乙。` })
  assert.deepEqual(batchTtsStreamText('', '尾句。', false), { pending: '尾句。', request: null })
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
