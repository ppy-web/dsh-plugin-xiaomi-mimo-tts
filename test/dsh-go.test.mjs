import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { apply, spokenText } from '../lib/dsh-go.js'
import { resolveTtsSettings } from '../lib/shared.js'

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

const settingsWithKey = resolveTtsSettings({ apiKey: 'sk-test-key', enabled: true, provider: 'xiaomi' })

function createHost(overrides = {}) {
  const state = { handlers: {}, strips: {}, panels: {}, media: {}, micro: {}, capability: undefined, synth: [], mutations: [] }
  let settings = { ...settingsWithKey, ...(overrides.settings ?? {}) }
  const listeners = new Set()
  const ctx = {
    logger: { info() {}, warn() {}, error() {} },
    dshGo: {
      on(id, handler) { state.handlers[id] = handler },
      media(id, handler) { state.media[id] = handler },
      micro(id, spec) { state.micro[id] = spec },
      panel(id, definition) { state.panels[id] = definition },
      strip(id, handler) { state.strips[id] = handler },
      onCapability(handler) { state.capability = handler },
      refresh() {},
    },
    speechSynthesis: {
      async synthesize(request) {
        state.synth.push(request)
        return { data: Buffer.from('RIFF0000WAVE'), contentType: 'audio/wav', durationMs: 1000, text: request.text, provider: 'xiaomi', format: request.format ?? 'wav' }
      },
    },
    xiaomiTtsSettings: {
      current: () => settings,
      updates: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    },
    settings: {
      async mutate(ns, ops) { state.mutations.push({ ns, ops }) },
    },
    inject(_services, callback) { callback(ctx) },
  }
  apply(ctx)
  return {
    state,
    setSettings(next) { settings = { ...settings, ...next }; for (const listener of listeners) listener() },
  }
}

test('dshGo manifest stays inside the native limits and wires one panel id', () => {
  const manifest = packageJson.dshGo
  assert.equal(manifest.v, 1)
  assert.ok(typeof manifest.title.zh === 'string' && [...manifest.title.zh].length <= 24)
  assert.ok([...manifest.title.en].length <= 24)
  assert.ok(manifest.capabilities.includes('audio'))
  assert.ok(manifest.capabilities.includes('voice'))
  assert.ok(JSON.stringify(manifest).length <= 16 * 1024)

  const actions = manifest.contributes['message.actions']
  assert.equal(actions.length, 1)
  assert.equal(actions[0].id, 'read')
  assert.ok([...actions[0].label.en].length <= 12)
  assert.deepEqual(actions[0].requires, ['audio'])

  const panel = manifest.contributes.panels.find((item) => item.id === 'settings')
  assert.ok(panel)
  assert.ok([...panel.title.zh].length <= 16)
  const strip = manifest.contributes['composer.strip'][0]
  assert.equal(strip.panel, 'settings', 'the strip must open the settings panel')
})

test('spokenText keeps prose and drops code blocks', () => {
  const text = spokenText('```js\nconst secret = 1\n```\n你好，世界。', resolveTtsSettings({ readScope: 'full' }))
  assert.match(text, /你好/)
  assert.doesNotMatch(text, /const secret/)
})

test('read action returns one audio/voice/overlay session and a media key', () => {
  const host = createHost()
  const effects = host.state.handlers.read({ sessionId: 's1', message: '你好。世界。' })
  assert.equal(Array.isArray(effects), true)
  assert.deepEqual(effects.map((effect) => effect.type), ['audio', 'voice', 'overlay'])
  assert.equal(effects[0].src, 'media:speech')
  assert.ok(typeof effects[0].key === 'string' && effects[0].key.length > 8)
  assert.equal(effects[2].id, 'subtitle')
})

test('read action answers with a toast when the reply has nothing to say', () => {
  const host = createHost()
  const effects = host.state.handlers.read({ sessionId: 's1', message: '```js\nconst x = 1\n```' })
  assert.ok(effects.toast)
})

test('read action respects the enabled switch', () => {
  const host = createHost({ settings: { enabled: false } })
  const effects = host.state.handlers.read({ sessionId: 's1', message: '你好。' })
  assert.match(effects.toast, /关闭/)
})

test('media synthesizes once, returns bytes, and marks the caption timeline', async () => {
  const host = createHost()
  const effects = host.state.handlers.read({ sessionId: 's1', message: '你好。世界。' })
  const clip = await host.state.media.speech({ sessionId: 's1' }, { key: effects[0].key })
  assert.equal(clip.contentType, 'audio/wav')
  assert.ok(Buffer.isBuffer(clip.body))
  assert.equal(host.state.synth.length, 1)
  assert.equal(host.state.synth[0].format, 'wav')
  assert.match(host.state.synth[0].text, /你好/)
})

test('media refuses to spend a request without an API key', async () => {
  const host = createHost({ settings: { apiKey: '' } })
  const effects = host.state.handlers.read({ sessionId: 's1', message: '你好。' })
  await assert.rejects(host.state.media.speech({ sessionId: 's1' }, { key: effects[0].key }), /API Key/)
  assert.equal(host.state.synth.length, 0)
})

test('caption follows the sound and stops when the person speaks', async () => {
  const host = createHost()
  const effects = host.state.handlers.read({ sessionId: 's1', message: '第一句话。第二句话。' })
  await host.state.media.speech({ sessionId: 's1' }, { key: effects[0].key })

  const seen = []
  host.state.micro.caption.data({ sessionId: 's1' }, (value) => seen.push(value))
  await new Promise((resolve) => setTimeout(resolve, 350))
  assert.ok(seen.length > 0, 'caption should tick while the sound plays')
  assert.ok(seen.every((item) => typeof item.text === 'string' && item.progress >= 0 && item.progress <= 1))

  host.state.capability({ sessionId: 's1' }, { event: 'voice.speechStart' })
  const before = seen.length
  await new Promise((resolve) => setTimeout(resolve, 250))
  assert.equal(seen.length, before, 'caption must stop after the reading ends')
})

test('settings save writes only the fields the person changed', async () => {
  const host = createHost()
  const panel = host.state.panels.settings
  const fullCaps = { locale: 'zh-CN', components: ['form', 'textField', 'toggle', 'segmented', 'select', 'slider', 'callout', 'stack', 'divider', 'text'] }
  const view = panel.view({}, fullCaps)
  assert.equal(view.v, 2)
  assert.ok(JSON.stringify(view).length <= 32 * 1024)

  const fallback = panel.view({}, { locale: 'zh-CN', components: ['stack', 'callout'] })
  assert.equal(fallback.v, undefined, 'an older app gets a flat v1 fallback')
  assert.match(fallback.children[0].text, /网页版/)

  const result = await panel.actions.save({}, {
    value: {
      values: {
        'data.form.enabled': true,
        'data.form.provider': 'doubao',
        'data.form.voice': 'zh_female_cancan_uranus_bigtts',
        'data.form.apiKey': 'doubao-key',
        'data.form.volume': 0.8,
        'data.form.rate': 1.2,
        'data.form.readScope': 'full',
      },
    },
  })
  assert.equal(result.toast, '已保存')
  assert.equal(host.state.mutations.length, 1)
  const { ns, ops } = host.state.mutations[0]
  assert.equal(ns, 'xiaomi-mimo-tts')
  const paths = ops.map((op) => op.path.join('.'))
  assert.deepEqual(paths.sort(), ['doubaoApiKey', 'doubaoEnabled', 'doubaoVoice', 'enabled', 'provider', 'readScope', 'voiceRate', 'voiceVolume'].sort())
})

test('switching provider without typing a voice picks that provider default', async () => {
  const host = createHost({ settings: { breezeVoice: '' } })
  const result = await host.state.panels.settings.actions.save({}, {
    value: { values: { 'data.form.provider': 'breeze' } },
  })
  assert.equal(result.toast, '已保存')
  const ops = host.state.mutations[0].ops
  const paths = ops.map((op) => op.path.join('.'))
  assert.ok(paths.includes('breezeEnabled'))
  const voice = ops.find((op) => op.path.join('.') === 'breezeVoice')
  assert.ok(voice)
  assert.match(voice.value, /^voc_/)
})

test('settings save rejects a key the provider cannot use', async () => {
  const host = createHost()
  const result = await host.state.panels.settings.actions.save({}, {
    value: { values: { 'data.form.apiKey': 'bad key with spaces', 'data.form.provider': 'xiaomi' } },
  })
  assert.match(result.toast, /API Key/)
  assert.equal(host.state.mutations.length, 0)
})

test('settings panel data never echoes the saved key', () => {
  const host = createHost()
  const data = []
  host.state.panels.settings.data({}, (value) => data.push(value), { locale: 'zh-CN' })
  assert.equal(data.length, 1)
  assert.equal(data[0].form.apiKey, '')
  assert.equal(data[0].status.ready, true)
  assert.doesNotMatch(JSON.stringify(data[0]), /sk-test-key/)
})

test('strip reports readiness in one short line', () => {
  const host = createHost()
  const values = []
  host.state.strips.status({}, (value) => values.push(value), { locale: 'zh-CN' })
  assert.equal(values.length, 1)
  assert.ok([...values[0].text].length <= 24)
  assert.equal(values[0].tone, 'good')
})
