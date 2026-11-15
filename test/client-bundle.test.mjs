import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { PassThrough } from 'node:stream'
import { createElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const require = createRequire(import.meta.url)

test('production Web bundle loads through the host module loader', async () => {
  const registrations = []
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  runInNewContext(source, {
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
    TextEncoder,
    TextDecoder,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    performance,
  }, { filename: 'client.js', timeout: 5000 })

  assert.equal(registrations.length, 1)
  const [registration] = registrations
  assert.equal(registration.id, 'dsh-xiaomi-tts')
  const modules = new Map([
    ['react', require('react')],
    ['react/jsx-runtime', require('react/jsx-runtime')],
    ['react-dom', require('react-dom')],
    ['react-dom/client', require('react-dom/client')],
    ['@deepseek-ai/cordis', require('@deepseek-ai/cordis')],
    ['@deepseek-ai/dsh-client-ui-primitives', new Proxy({}, { get: () => () => null })],
  ])
  const plugin = registration.factory(specifier => {
    assert.ok(modules.has(specifier), `unsupported host dependency: ${specifier}`)
    return modules.get(specifier)
  })
  assert.equal(typeof plugin.apply, 'function')
  assert.ok(Array.isArray(plugin.inject))
  for (const service of ['slots', 'locale', 'configForms']) assert.ok(plugin.inject.includes(service))
})

async function renderCompleted(element) {
  return new Promise((resolve, reject) => {
    const output = new PassThrough()
    let html = ''
    output.setEncoding('utf8')
    output.on('data', chunk => { html += chunk })
    output.on('end', () => resolve(html))
    output.on('error', reject)
    const stream = renderToPipeableStream(element, { onAllReady() { stream.pipe(output) }, onError: reject })
  })
}

async function withVoiceReadingBundle(failChunk = false) {
  const registrations = [], loaded = [], slots = []
  const context = {
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
    document: { baseURI: 'http://localhost/' },
    crypto: globalThis.crypto, URL, TextEncoder, TextDecoder, queueMicrotask, setTimeout, clearTimeout, performance, structuredClone, AbortController, AbortSignal,
  }
  const modules = new Map([
    ['react', require('react')], ['react/jsx-runtime', require('react/jsx-runtime')], ['react-dom', require('react-dom')],
    ['react-dom/client', require('react-dom/client')], ['@deepseek-ai/cordis', { Service: class {} }],
    ['@deepseek-ai/dsh-client-ui-primitives', new Proxy({}, { get: (_target, name) => name === 'Menu'
      ? ({ anchor }) => anchor : ({ children }) => children ?? null })],
  ])
  const moduleRequire = specifier => {
    assert.ok(modules.has(specifier), `unsupported host dependency: ${specifier}`)
    return modules.get(specifier)
  }
  moduleRequire.async = async specifier => {
    loaded.push(specifier)
    if (failChunk) throw new Error('chunk unavailable')
    assert.equal(specifier, './client.generated-voice-avatar.js')
    const script = await readFile(new URL(`../lib/${specifier.slice(2)}`, import.meta.url), 'utf8')
    runInNewContext(script, context, { filename: specifier, timeout: 5000 })
    const registration = registrations.at(-1)
    assert.equal(registration.id, 'dsh-xiaomi-tts')
    assert.equal(registration.chunk, specifier.slice(2))
    return registration.factory(moduleRequire)
  }
  if (failChunk === 'missing-loader') delete moduleRequire.async
  const source = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  runInNewContext(source, context, { filename: 'client.js', timeout: 5000 })
  const plugin = registrations[0].factory(moduleRequire)
  const scope = { getSnapshot: () => ({ status: 'ready', writable: true, value: {}, revision: 1 }), subscribe: () => () => {} }
  const changes = { getSnapshot: () => false, subscribe: () => () => {} }
  const ctx = {
    locale: { bind: () => key => key }, configForms: { get: () => scope }, pluginChanges: { bundle: () => changes },
    slots: { inject: (_name, register) => register(), register: (options, component) => { slots.push({ options, component }); return () => {} } },
    effect: (fn, label) => { if (label === 'xiaomi-mimo-tts: settings.section') return fn(); return () => {} },
    logger: { error: message => { throw new Error(message) } }, pluginNavigation: { openBundle() {} }, layout: { selectPanel() {} },
  }
  plugin.apply(ctx)
  const section = slots.find(slot => slot.options.name === 'settings.section')
  assert.ok(section, 'the Host settings contribution is registered')
  return { loaded, section }
}

test('client loads the avatar chunk only when voice settings render', async () => {
  const { loaded, section } = await withVoiceReadingBundle()
  assert.deepEqual(loaded, [])
  const html = await renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.deepEqual(loaded, ['./client.generated-voice-avatar.js'])
  assert.match(html, /data:image\/svg\+xml/u)
})

test('voice settings remain usable if the avatar chunk cannot load', async () => {
  const { loaded, section } = await withVoiceReadingBundle(true)
  const html = await renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.deepEqual(loaded, ['./client.generated-voice-avatar.js'])
  assert.ok(html.includes('settings.voiceReadingVoice'))
  assert.ok(html.includes('xmimo-tts-voice-avatar-fallback'))
})

test('voice settings fall back safely when the Host has no chunk loader', async () => {
  const { loaded, section } = await withVoiceReadingBundle('missing-loader')
  const html = await renderCompleted(createElement(section.component, { ...section.options.inject(), close() {} }))
  assert.deepEqual(loaded, [])
  assert.ok(html.includes('settings.voiceReadingVoice'))
  assert.ok(html.includes('xmimo-tts-voice-avatar-fallback'))
})
