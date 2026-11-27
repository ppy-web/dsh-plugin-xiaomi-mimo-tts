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

async function loadBundle(failChunk = false, encode = encodeURIComponent) {
  const factories = new Map(), loaded = [], warnings = []
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
    encodeURIComponent: encode, console: { info() {}, warn: (...args) => warnings.push(args) },
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
    const filename = specifier.slice(2)
    const id = `${packageId}/${filename}`
    if (modules.has(id)) return Promise.resolve(modules.get(id))
    if (pending.has(specifier)) return pending.get(specifier)
    loaded.push(specifier)
    const load = Promise.resolve().then(() => {
      const failure = typeof failChunk === 'function' ? failChunk(specifier) : failChunk
      if (failure) throw failure instanceof Error ? failure : new Error('chunk unavailable')
      return run(filename)
    }).then(() => moduleRequire(id)).finally(() => pending.delete(specifier))
    pending.set(specifier, load)
    return load
  }
  if (failChunk === 'missing-loader') delete moduleRequire.async
  await run('client.js')
  return { loaded, warnings, plugin: moduleRequire(packageId) }
}

async function registerSettings(failChunk, encode, initialSettings = {}) {
  const { loaded, warnings, plugin } = await loadBundle(failChunk, encode)
  const slots = []
  const snapshot = { status: 'ready', writable: true, value: initialSettings, revision: 1 }
  const scope = { getSnapshot: () => snapshot, subscribe: () => () => {} }
  const changes = { getSnapshot: () => false, subscribe: () => () => {} }
  const settings = new Set(['settings.section', 'plugins.bundle.config', 'plugins.row.config', 'sidebar.panellist', 'feature guide', 'shell.overlay', 'plugins.bundle.activation'])
  const ctx = {
    locale: { bind: () => key => key, getSnapshot: () => ({ revision: 0 }), subscribe: () => () => {} },
    configForms: { get: () => scope }, pluginChanges: { bundle: () => changes },
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
  return { loaded, warnings, slot, section: slot('settings.section') }
}

test('the production bundle presents new-version guidance outside the Plugins page and dismisses it once', async () => {
  const { slot } = await registerSettings()
  const overlay = slot('shell.overlay')
  const props = overlay.options.inject()
  const render = () => renderCompleted(createElement(overlay.component, props))
  assert.match(await render(), /aria-label="onboarding.dismiss"/u)
  props.guide.dismiss()
  assert.equal(await render(), '')
  slot('plugins.bundle.activation').options.inject().guide.requestActivation()
  assert.equal(await render(), '')
})

test('the production bundle respects the saved never-remind preference on startup', async () => {
  const { loaded, slot } = await registerSettings(false, undefined, { showFeatureGuide: false })
  const overlay = slot('shell.overlay')
  assert.equal(await renderCompleted(createElement(overlay.component, overlay.options.inject())), '')
  assert.deepEqual(loaded, [])
})

test('voice settings render generated avatars from the main bundle', async () => {
  const { loaded, section } = await registerSettings()
  const html = await renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.deepEqual(loaded, [])
  assert.match(html, /data:image\/svg\+xml/u)
})

test('a temporary avatar generation failure does not poison the saved voice cache', async () => {
  const failure = new Error('temporary SVG encoding failure')
  let unavailable = true
  const { warnings, section } = await registerSettings(false, value => {
    if (unavailable && value.startsWith('<svg')) throw failure
    return encodeURIComponent(value)
  })
  const render = () => renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.ok((await render()).includes('xmimo-tts-voice-avatar-fallback'))
  assert.equal(warnings.length, 1)
  assert.equal(warnings[0][1], failure)
  unavailable = false
  assert.match(await render(), /data:image\/svg\+xml/u)
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
