import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const host = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
const client = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')

test('package declares DSH bundle and Web client entries', () => {
  assert.equal(packageJson.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(packageJson.dsh.client.platform, 'web')
  assert.equal(packageJson.exports['./client'].default, './lib/client.js')
  assert.match(patch, /id: xiaomi-mimo-tts/)
  assert.match(patch, /name: 'dsh-plugin-xiaomi-mimo-tts'/)
})

test('host output contains protected TTS route and secret settings schema', () => {
  assert.match(host, /xiaomi-mimo-tts\/synthesize/)
  assert.match(host, /role\(["']secret["']\)/)
  assert.match(host, /mimo-v2\.5-tts/)
  assert.match(host, /chat\/completions/)
})

test('client output registers the message action and plugin settings card', () => {
  assert.match(client, /conversation\.chat\.assistant-actions/)
  assert.match(client, /settings\.plugin\.item/)
  assert.match(client, /window\.__ModuleLoader__\.load/)
})
