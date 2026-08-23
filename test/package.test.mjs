import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const host = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const sharedModule = await import('../lib/shared.js')
const { prepareTtsText, resolveTtsSettings } = sharedModule

test('package declares DSH bundle and Web client entries', () => {
  assert.equal(packageJson.name, 'dsh-xiaomi-tts')
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh.client.platform, 'web')
  assert.equal(packageJson.exports['./client'].default, './lib/client.js')
  assert.match(patch, /id: xiaomi-mimo-tts/)
  assert.match(patch, /name: 'dsh-xiaomi-tts'/)
})

test('host and shared artifacts contain protected TTS route and secret settings schema', () => {
  assert.equal(sharedModule.TTS_ROUTE, '/plugins/xiaomi-mimo-tts/synthesize')
  assert.deepEqual(sharedModule.TTS_MODELS, ['mimo-v2.5-tts', 'mimo-v2.5-tts-voicedesign'])
  assert.equal(sharedModule.TTS_VOICE_DESIGN_PRESETS.length, 12)
  assert.equal(sharedModule.TTS_VOICE_DESIGN_PRESETS[4].label, '温柔女友')
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.enabled, true)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.autoPlay, true)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.model, 'mimo-v2.5-tts')
  assert.match(sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignPrompt, /青年女性/)
  assert.equal(sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignCustomPrompt, sharedModule.DEFAULT_TTS_SETTINGS.voiceDesignPrompt)
  assert.match(host, /TTS_ROUTE/)
  assert.match(host, /prepareTtsText/)
  assert.match(host, /role\(['"]secret['"]\)/)
  assert.match(host, /mimo-v2\.5-tts/)
  assert.match(host, /mimo-v2\.5-tts-voicedesign/)
  assert.match(host, /voiceDesignPrompt/)
  assert.match(host, /audio: options\.model ===/)
  assert.match(host, /format: options\.format/)
  assert.match(host, /chat\/completions/)
  assert.doesNotMatch(host, /dsh-xiaomi-tts\/1\.1\.1/)
  assert.match(host, /createRequire/)
})

test('build emits only declarations under the private client directory', async () => {
  const clientArtifacts = (await readdir(new URL('../lib/client', import.meta.url))).sort()
  assert.deepEqual(clientArtifacts, ['index.d.ts', 'index.d.ts.map'])
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
  assert.match(client, /model === ["']mimo-v2\.5-tts["'] \? ["']xmimo-tts-select-column xmimo-tts-wide["']/)
  assert.match(client, /CUSTOM_VOICE_DESIGN_OPTION = ["']__custom__["']/)
  assert.match(client, /children: ["']自定义["']/)
  assert.match(client, /value: isPresetVoiceDesignPrompt\(voiceDesignPrompt\) \? voiceDesignPrompt : CUSTOM_VOICE_DESIGN_OPTION/)
  assert.match(client, /setVoiceDesignCustomPrompt\(next\)/)
  assert.match(client, /voiceDesignCustomPrompt/)
  assert.match(client, /xmimo-tts-select-column\{display:flex;min-width:0;flex-direction:row/)
  assert.match(client, /xmimo-tts-select-column>div\{flex:1\}/)
})

test('prepares speech text by keeping prose and normalizing whitespace and punctuation', () => {
  assert.equal(
    prepareTtsText('  你好，\n\n世界！\\n下一句。  '),
    '你好, 世界! 下一句.',
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
    '请查看 官方文档. 备用地址 和 文件 和. 继续说明.',
  )
})

test('removes emoji, icons, invisible characters, and empty filtered content', () => {
  assert.equal(prepareTtsText('你好 👋‍🌍 ★\u200B，继续。'), '你好,继续.')
  assert.equal(prepareTtsText('https://example.com/path'), '')
  assert.equal(prepareTtsText(String.raw`C:\temp\audio.wav`), '')
  assert.equal(prepareTtsText('```\nignored\n```'), '')
})

test('client output registers the message action and plugin settings card', () => {
  assert.match(client, /conversation\.chat\.assistant-actions/)
  assert.match(client, /prepareTtsText/)
  assert.match(client, /settingsSnapshot\.value\?\.enabled !== true/)
  assert.match(client, /checked: enabled && autoPlay/)
  assert.doesNotMatch(client, /Date\.now\(\) - this\.autoPlayArmedAt < 30000/)
  assert.match(client, /playback\.toggle\(messageId, text, true\)/)
  assert.match(client, /claimAutomaticPlayback\(sessionId, messageId\)/)
  assert.match(client, /xmimo-tts-api-key-hints/)
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
  assert.match(client, /settings\.reset/)
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
  assert.match(client, /running: snapshot\.running/)
  assert.match(client, /message\.latestMessageId !== messageId/)
  assert.match(client, /automaticallyPlayed\.has\(key\)/)
  assert.match(client, /claimAutomaticPlayback\(sessionId, messageId\)/)
})
