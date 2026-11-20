import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createElement } from 'react'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { renderCompleted } from './helpers/render-completed.mjs'

const require = createRequire(import.meta.url)

test('production Web bundle loads through the host module loader', async () => {
  const { plugin, loaded } = await loadBundle()
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(Array.isArray(plugin.inject))
  for (const service of ['slots', 'locale', 'configForms']) assert.ok(plugin.inject.includes(service))
  assert.deepEqual(loaded, [])
})

async function loadBundle(failChunk = false) {
  const factories = new Map(), loaded = []
  const packageId = 'dsh-xiaomi-tts'
  const context = {
    window: { __ModuleLoader__: { load({ id, chunk, factory }) {
      assert.equal(id, packageId)
      const specifier = chunk === undefined ? id : `${id}/${chunk}`
      assert.ok(!factories.has(specifier), `duplicate factory: ${specifier}`)
      factories.set(specifier, factory)
    } } },
    document: { baseURI: 'http://localhost/' },
    crypto: globalThis.crypto, URL, TextEncoder, TextDecoder, queueMicrotask, setTimeout, clearTimeout, performance, structuredClone, AbortController, AbortSignal,
  }
  const modules = new Map([
    ['react', require('react')], ['react/jsx-runtime', require('react/jsx-runtime')], ['react-dom', require('react-dom')],
    ['react-dom/client', require('react-dom/client')], ['@deepseek-ai/cordis', { Service: class {} }],
    ['@deepseek-ai/dsh-client-ui-primitives', new Proxy({}, { get: (_target, name) => {
      if (name === 'Menu') return ({ anchor }) => anchor
      if (name === 'Button') return ({ children, type, 'aria-label': label }) => createElement('button', { type, 'aria-label': label }, children)
      return ({ children }) => children ?? null
    } })],
  ])
  const moduleRequire = specifier => {
    if (!modules.has(specifier)) {
      const factory = factories.get(specifier)
      assert.ok(factory, `unsupported host dependency: ${specifier}`)
      modules.set(specifier, factory(moduleRequire))
    }
    return modules.get(specifier)
  }
  async function run(filename) {
    const script = await readFile(new URL(`../lib/${filename}`, import.meta.url), 'utf8')
    runInNewContext(script, context, { filename, timeout: 5000 })
  }
  const pending = new Map()
  moduleRequire.async = specifier => {
    assert.match(specifier, /^\.\/client\.[\w.-]+\.js$/u)
    if (pending.has(specifier)) return pending.get(specifier)
    loaded.push(specifier)
    const filename = specifier.slice(2)
    const load = failChunk ? Promise.reject(new Error('chunk unavailable'))
      : run(filename).then(() => moduleRequire(`${packageId}/${filename}`))
    pending.set(specifier, load)
    return load
  }
  if (failChunk === 'missing-loader') delete moduleRequire.async
  await run('client.js')
  return { loaded, plugin: moduleRequire(packageId) }
}

async function registerSettings(failChunk) {
  const { loaded, plugin } = await loadBundle(failChunk)
  const slots = []
  const snapshot = { status: 'ready', writable: true, value: {}, revision: 1 }
  const scope = { getSnapshot: () => snapshot, subscribe: () => () => {} }
  const changes = { getSnapshot: () => false, subscribe: () => () => {} }
  const settings = new Set(['settings.section', 'plugins.bundle.config', 'plugins.row.config', 'sidebar.panellist'])
  const ctx = {
    locale: { bind: () => key => key }, configForms: { get: () => scope }, pluginChanges: { bundle: () => changes },
    slots: { inject: (_name, register) => register(), register: (options, component) => { slots.push({ options, component }); return () => {} } },
    effect: (fn, label) => { if (settings.has(label?.slice('xiaomi-mimo-tts: '.length))) return fn(); return () => {} },
    logger: { error: message => { throw new Error(message) } }, pluginNavigation: { openBundle() {} }, layout: { selectPanel() {} },
  }
  plugin.apply(ctx)
  function slot(name, key) {
    const entry = slots.find(slot => slot.options.name === name && (key === undefined || slot.options.key === key))
    assert.ok(entry, `missing Host slot ${key ?? name}`)
    return entry
  }
  return { loaded, slot, section: slot('settings.section') }
}

test('client loads the avatar chunk only when voice settings render', async () => {
  const { loaded, section } = await registerSettings()
  assert.deepEqual(loaded, [])
  const html = await renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.deepEqual(loaded, ['./client.generated-voice-avatar.js'])
  assert.match(html, /data:image\/svg\+xml/u)
})

test('voice settings remain usable if the avatar chunk cannot load', async () => {
  const { loaded, section } = await registerSettings(true)
  const html = await renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.deepEqual(loaded, ['./client.generated-voice-avatar.js'])
  assert.ok(html.includes('settings.voiceReadingVoice'))
  assert.ok(html.includes('xmimo-tts-voice-avatar-fallback'))
})

test('voice settings fall back safely when the Host has no chunk loader', async () => {
  const { loaded, section } = await registerSettings('missing-loader')
  const html = await renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.deepEqual(loaded, [])
  assert.ok(html.includes('settings.voiceReadingVoice'))
  assert.ok(html.includes('xmimo-tts-voice-avatar-fallback'))
})

test('DSH keeps settings chunks deferred until their full pages are rendered', async () => {
  const { loaded, slot } = await registerSettings()
  const bundle = slot('plugins.bundle.config')
  const passport = slot('plugins.row.config', 'dsh-xiaomi-tts#speech-delivery-passport')
  const render = (entry, view) => renderCompleted(createElement(entry.component, { ...entry.options.inject(), history: undefined, view }))
  await render(bundle, 'summary')
  await render(passport, 'summary')
  assert.deepEqual(loaded, [])

  const workbench = slot('main')
  assert.match(await render(workbench, 'page'), /<h1>/u)
  assert.ok(loaded.includes('./client.voice-settings-page.js'))
  assert.ok(!loaded.includes('./client.audio-history-page.js'))
  assert.ok(!loaded.includes('./client.passport-settings.js'))
  assert.match(await render(passport, 'page'), /type="password"/u)
  assert.ok(loaded.includes('./client.passport-settings.js'))
})

test('a settings transport failure renders a page-level alert', async () => {
  const { loaded, slot } = await registerSettings(true)
  const passport = slot('plugins.row.config', 'dsh-xiaomi-tts#speech-delivery-passport')
  const html = await renderCompleted(createElement(passport.component, { ...passport.options.inject(), view: 'page' }))
  assert.deepEqual(loaded, ['./client.passport-settings.js'])
  assert.match(html, /role="alert"/u)
})
