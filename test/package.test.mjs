import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const host = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
const shared = await readFile(new URL('../lib/shared.js', import.meta.url), 'utf8')
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const { resolveTtsSettings } = await import('../lib/shared.js')

test('package declares DSH bundle and Web client entries', () => {
  assert.equal(packageJson.name, 'dsh-xiaomi-tts')
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh.client.platform, 'web')
  assert.equal(packageJson.exports['./client'].default, './lib/client.js')
  assert.match(patch, /id: xiaomi-mimo-tts/)
  assert.match(patch, /name: 'dsh-xiaomi-tts'/)
})

test('host and shared artifacts contain protected TTS route and secret settings schema', () => {
  assert.match(shared, /xiaomi-mimo-tts\/synthesize/)
  assert.match(shared, /enabled: true/)
  assert.match(shared, /autoPlay: true/)
  assert.match(host, /TTS_ROUTE/)
  assert.match(host, /role\(['"]secret['"]\)/)
  assert.match(host, /mimo-v2\.5-tts/)
  assert.match(host, /chat\/completions/)
})

test('resolved settings disable automatic playback when the plugin is disabled', () => {
  assert.equal(resolveTtsSettings({ enabled: false, autoPlay: true }).autoPlay, false)
  assert.equal(resolveTtsSettings({ enabled: true, autoPlay: true }).autoPlay, true)
})

test('client output registers the message action and plugin settings card', () => {
  assert.match(client, /conversation\.chat\.assistant-actions/)
  assert.match(client, /settingsSnapshot\.value\?\.enabled !== true/)
  assert.match(client, /checked: enabled && autoPlay/)
  assert.match(client, /xmimo-tts-api-key-hints/)
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
