import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
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
