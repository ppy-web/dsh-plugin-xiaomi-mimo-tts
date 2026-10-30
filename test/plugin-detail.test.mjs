import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule, settle } from './helpers/client-modules.mjs'

const { ApiKeyStatusStore, apiKeyStatusStore, bindApiKeyStatus } = await loadClientModule('src/client/settings/api-key-status-store.ts')
const { PluginDetailActions, PluginDetailBadge } = await loadClientModule('src/client/settings/plugin-detail.tsx')
const { MANUAL_URL, SOURCE_URL } = await loadClientModule('src/client/settings/plugin-links.ts')

function source(initial) {
  let value = initial
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    set(next) { value = next; for (const listener of listeners) listener() },
    get count() { return listeners.size },
  }
}

function mockRequests(t) {
  const requests = []
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise((resolve, reject) => {
    requests.push({ provider: new URL(url, 'http://localhost').searchParams.get('provider'), signal: init.signal,
      resolve: (body, status = 200) => resolve(new Response(JSON.stringify(body), { status })), reject })
  }))
  return requests
}

test('speech surfaces share a provider request, keep providers independent and abort after the final unsubscribe', async t => {
  const requests = mockRequests(t)
  const store = new ApiKeyStatusStore()
  const offCard = store.subscribe('xiaomi', () => {})
  const offBadge = store.subscribe('xiaomi', () => {})
  const offWarning = store.subscribe('doubao', () => {})
  assert.deepEqual(requests.map(r => r.provider), ['xiaomi', 'doubao'])
  offCard()
  assert.equal(requests[0].signal.aborted, false)
  requests[1].resolve({ configured: false, supported: false })
  await settle()
  assert.equal(store.getSnapshot('doubao'), 'missing')
  assert.equal(store.getSnapshot('xiaomi'), 'loading')
  offBadge()
  assert.equal(requests[0].signal.aborted, true)
  requests[0].resolve({ configured: true, supported: true })
  await settle()
  assert.equal(store.getSnapshot('xiaomi'), 'loading', 'an unsubscribed response must not become cached state')
  offWarning()
})

test('credential refresh cancels stale responses even when fetch ignores abort', async t => {
  const requests = mockRequests(t)
  const store = new ApiKeyStatusStore()
  const observed = []
  const off = store.subscribe('xiaomi', () => observed.push(store.getSnapshot('xiaomi')))
  store.invalidate()
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(requests.length, 2)
  requests[1].resolve({ configured: true, supported: true })
  await settle()
  requests[0].resolve({ configured: false, supported: false })
  await settle()
  assert.equal(store.getSnapshot('xiaomi'), 'recognized')
  assert.deepEqual(observed, ['loading', 'recognized'])
  off()
})

test('an unready host does not query credentials until configuration is available', t => {
  const requests = mockRequests(t)
  const scope = source({ status: 'loading', revision: null })
  const changes = source(false)
  const store = new ApiKeyStatusStore()
  const dispose = bindApiKeyStatus(scope, changes, store)
  const off = store.subscribe('xiaomi', () => {})
  assert.equal(requests.length, 0)
  scope.set({ status: 'ready', revision: 1 })
  assert.equal(requests.length, 1)
  dispose()
  assert.equal(requests[0].signal.aborted, true)
  off()
})

test('host revision, bundle activity and reconnect refresh subscribers and disposal releases all sources', async t => {
  const requests = mockRequests(t)
  const scope = source({ status: 'ready', revision: 1 })
  const changes = source(false)
  const store = new ApiKeyStatusStore()
  const dispose = bindApiKeyStatus(scope, changes, store)
  const off = store.subscribe('xiaomi', () => {})
  changes.set(true)
  assert.equal(requests[0].signal.aborted, true)
  store.invalidate()
  scope.set({ status: 'ready', revision: 2 })
  assert.equal(requests.length, 1, 'management changes must pause queries')
  changes.set(false)
  assert.equal(requests.length, 2)
  requests[1].resolve({ configured: true, supported: false })
  await settle()
  assert.equal(store.getSnapshot('xiaomi'), 'unrecognized')
  scope.set({ status: 'ready', revision: 3 })
  assert.equal(requests.length, 3)
  scope.set({ status: 'unavailable', revision: 3 })
  assert.equal(requests[2].signal.aborted, true)
  scope.set({ status: 'ready', revision: 3 })
  assert.equal(requests.length, 4, 'reconnect must refresh even at the same revision')
  changes.set(false)
  scope.set({ status: 'ready', revision: 3 })
  assert.equal(requests.length, 4, 'unrelated snapshots must not restart a request')
  dispose()
  assert.equal(requests[3].signal.aborted, true)
  assert.equal(scope.count, 0)
  assert.equal(changes.count, 0)
  requests[3].resolve({ configured: true, supported: true })
  await settle()
  assert.equal(store.getSnapshot('xiaomi'), 'loading')
  off()
})

for (const [body, expected, httpStatus] of [
  [{ configured: false, supported: false }, 'missing', 200],
  [{ configured: true, supported: true }, 'recognized', 200],
  [{ configured: true, supported: false }, 'unrecognized', 200],
  [{}, 'unavailable', 200],
  [{ configured: 'yes', supported: true }, 'unavailable', 200],
  [null, 'unavailable', 200],
  [{ configured: true, supported: true }, 'unavailable', 503],
]) test(`key status response ${JSON.stringify(body)} (${httpStatus}) produces ${expected}`, async t => {
  const requests = mockRequests(t)
  const store = new ApiKeyStatusStore()
  const off = store.subscribe('xiaomi', () => {})
  requests[0].resolve(body, httpStatus)
  await settle()
  assert.equal(store.getSnapshot('xiaomi'), expected)
  off()
})

test('a failed check can be retried and no new request starts without a subscriber', async t => {
  const requests = mockRequests(t)
  const store = new ApiKeyStatusStore()
  const off = store.subscribe('xiaomi', () => {})
  requests[0].reject(new Error('network disconnected'))
  await settle()
  assert.equal(store.getSnapshot('xiaomi'), 'unavailable')
  store.invalidate()
  assert.equal(store.getSnapshot('xiaomi'), 'loading')
  requests[1].resolve({ configured: true, supported: true })
  await settle()
  assert.equal(store.getSnapshot('xiaomi'), 'recognized')
  off()
  store.invalidate()
  assert.equal(requests.length, 2)
})

const pkg = { name: 'dsh-xiaomi-tts', installed: true, enabled: true, availability: 'available', official: false, rows: [] }
const subject = { kind: 'bundle', pkg }

test('all detail contributions ignore other packages, component rows and official items before subscribing', t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('unrelated details must not query credentials'))
  const scope = { getSnapshot: () => assert.fail('unrelated details must not read TTS settings'), subscribe: () => assert.fail() }
  for (const other of [
    { kind: 'bundle', pkg: { ...pkg, name: 'unrelated' } },
    { kind: 'row', pkg, row: { rowId: 'whale-girl', moduleName: 'dsh-xiaomi-tts/whale-girl', enabled: true } },
    { kind: 'item', id: 'dsh-xiaomi-tts' },
  ]) for (const component of [PluginDetailActions, PluginDetailBadge]) {
    assert.equal(component({ subject: other, t: key => key, scope }), null)
  }
})

test('detail actions open the project and manual separately and remain available during plugin changes', t => {
  const html = renderToStaticMarkup(createElement(PluginDetailActions, { subject, t: key => key }))
  const url = new URL(MANUAL_URL)
  assert.equal(url.protocol, 'https:')
  assert.equal(url.hostname, 'ppy-web.github.io')
  assert.equal(url.pathname, '/dsh-plugin-xiaomi-mimo-tts/')
  assert.equal(url.hash, '#manual')
  assert.match(html, /<button/)
  assert.doesNotMatch(html, /disabled/)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const open = t.mock.fn()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { open } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete globalThis.window
  })
  const actions = PluginDetailActions({ subject, t: key => key }).props.children
  for (const action of actions) action.props.onClick()
  assert.deepEqual(open.mock.calls.map(call => call.arguments), [
    [SOURCE_URL, '_blank', 'noopener,noreferrer'],
    [MANUAL_URL, '_blank', 'noopener,noreferrer'],
  ])
})

test('detail badge reads the saved provider, offers retry on failure, and suspends during bundle changes', async t => {
  const requests = mockRequests(t)
  apiKeyStatusStore.setAvailable(true)
  const scope = source({ status: 'ready', revision: 1, value: { provider: 'doubao' }, writable: false })
  const changes = source(false)
  const off = apiKeyStatusStore.subscribe('doubao', () => {})
  try {
    requests[0].resolve({}, 503)
    await settle()
    const render = () => renderToStaticMarkup(createElement(PluginDetailBadge, { subject, scope, changes, t: key => key }))
    const failed = render()
    assert.match(failed, /settings.providerDoubao/)
    assert.match(failed, /detail.keyUnavailable/)
    assert.match(failed, /<button\b/)
    changes.set(true)
    assert.match(render(), /plugin.changing/)
    assert.doesNotMatch(render(), /<button/)
    changes.set(false)
    apiKeyStatusStore.invalidate()
    requests[1].resolve({ configured: true, supported: true })
    await settle()
    assert.match(render(), /detail.keyRecognized/)
    assert.doesNotMatch(render(), /detail.retry/)
    scope.set({ status: 'ready', revision: 2, value: { provider: 'xiaomi' }, writable: false })
    assert.match(render(), /settings.providerXiaomi/)
    assert.match(render(), /detail.keyLoading/)
  } finally { off(); apiKeyStatusStore.setAvailable(false) }
})
