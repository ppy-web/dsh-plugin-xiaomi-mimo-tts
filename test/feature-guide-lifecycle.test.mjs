import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'
import { snapshotSource } from './helpers/snapshot-source.mjs'

const { FeatureGuideController } = await loadClientModule('src/client/settings/feature-guide.ts')

function browserFixture(t, storage, baseURI) {
  for (const [name, value] of Object.entries({ window: { localStorage: storage }, document: { baseURI } })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name)
    Object.defineProperty(globalThis, name, { configurable: true, value })
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous)
      else delete globalThis[name]
    })
  }
}

function fixture({ status = 'ready', enabled = true, changing = false, seen = null } = {}) {
  const scope = snapshotSource({ status, value: { showFeatureGuide: enabled } })
  const changes = snapshotSource(changing)
  let version = seen
  const history = { getVersion: () => version, setVersion: next => { version = next } }
  return { scope, changes, history, create: (next = '2.0.0') => new FeatureGuideController(scope, changes, next, history) }
}

test('first installation and a new version open without a Host activation event; dismissal survives reload', () => {
  const setup = fixture()
  const first = setup.create('1.0.0')
  const offFirst = first.start()
  assert.equal(first.getSnapshot(), true)
  assert.equal(setup.history.getVersion(), null, 'loading a guide alone must not acknowledge it')
  first.dismiss()
  assert.equal(first.getSnapshot(), false)
  offFirst()

  const reloaded = setup.create('1.0.0')
  const offReloaded = reloaded.start()
  assert.equal(reloaded.getSnapshot(), false)
  offReloaded()

  const updated = setup.create('2.0.0')
  const offUpdated = updated.start()
  assert.equal(updated.getSnapshot(), true)
  updated.dismiss()
  assert.equal(setup.history.getVersion(), '2.0.0')
  offUpdated()
})

test('automatic guidance waits for saved preferences and a completed plugin change', () => {
  const setup = fixture({ status: 'loading', changing: true })
  const guide = setup.create()
  const stop = guide.start()
  assert.equal(guide.getSnapshot(), false)
  setup.scope.set({ status: 'unavailable', value: undefined })
  assert.equal(guide.getSnapshot(), false)
  setup.scope.set({ status: 'ready', value: {} })
  assert.equal(guide.getSnapshot(), false)
  setup.changes.set(false)
  assert.equal(guide.getSnapshot(), true)
  stop()
})

test('never-remind suppresses startup and queued activation after preferences arrive', () => {
  const setup = fixture({ status: 'loading' })
  const guide = setup.create()
  const stop = guide.start()
  guide.requestActivation()
  setup.scope.set({ status: 'ready', value: { showFeatureGuide: false } })
  assert.equal(guide.getSnapshot(), false)
  assert.equal(setup.history.getVersion(), null)
  setup.scope.set({ status: 'ready', value: { showFeatureGuide: true } })
  assert.equal(guide.getSnapshot(), false, 'the settings switch owns its immediate manual preview')
  stop()
})

test('startup and Host activation share a single guide, including late activation after dismissal', () => {
  const setup = fixture()
  const guide = setup.create()
  const stop = guide.start()
  guide.requestActivation()
  assert.equal(guide.getSnapshot(), true)
  guide.dismiss()
  guide.requestActivation()
  setup.changes.set(true)
  setup.changes.set(false)
  setup.scope.set({ status: 'ready', value: { showFeatureGuide: true, enabled: false } })
  assert.equal(guide.getSnapshot(), false)
  stop()
})

test('an explicit enablement can show the previously acknowledged version', () => {
  const setup = fixture({ seen: '2.0.0' })
  const guide = setup.create()
  const stop = guide.start()
  assert.equal(guide.getSnapshot(), false)
  guide.requestActivation()
  assert.equal(guide.getSnapshot(), true)
  guide.dismiss()
  assert.equal(guide.getSnapshot(), false)
  stop()
})

test('temporary changes suspend the guide without acknowledging it; disabling the preference dismisses it', () => {
  const setup = fixture()
  const guide = setup.create()
  const stop = guide.start()
  setup.changes.set(true)
  assert.equal(guide.getSnapshot(), false)
  assert.equal(setup.history.getVersion(), null)
  setup.changes.set(false)
  assert.equal(guide.getSnapshot(), true)
  setup.scope.set({ status: 'ready', value: { showFeatureGuide: false } })
  assert.equal(guide.getSnapshot(), false)
  setup.scope.set({ status: 'ready', value: { showFeatureGuide: true } })
  assert.equal(guide.getSnapshot(), false)
  stop()
})

test('disposing a pending guide releases observers and prevents late opening or acknowledgment', () => {
  const setup = fixture({ status: 'loading' })
  const guide = setup.create()
  const stop = guide.start()
  stop()
  assert.equal(setup.scope.count, 0)
  assert.equal(setup.changes.count, 0)
  setup.scope.set({ status: 'ready', value: {} })
  guide.requestActivation()
  assert.equal(guide.getSnapshot(), false)
  assert.equal(setup.history.getVersion(), null)
})

test('blocked browser storage keeps a dismissal for subsequent loads in the same page', t => {
  browserFixture(t, {
    getItem() { throw new Error('storage blocked') },
    setItem() { throw new Error('storage blocked') },
  }, 'http://localhost/storage-blocked/')
  const { scope, changes } = fixture()
  const first = new FeatureGuideController(scope, changes)
  const offFirst = first.start()
  assert.equal(first.getSnapshot(), true)
  first.dismiss()
  offFirst()
  const next = new FeatureGuideController(scope, changes)
  const offNext = next.start()
  assert.equal(next.getSnapshot(), false)
  offNext()
})

test('a failed storage write still acknowledges the version when an older stored value is readable', t => {
  browserFixture(t, {
    getItem: () => 'older-version',
    setItem() { throw new Error('quota exceeded') },
  }, 'http://localhost/storage-full/')
  const { scope, changes } = fixture()
  const first = new FeatureGuideController(scope, changes)
  const offFirst = first.start()
  assert.equal(first.getSnapshot(), true)
  first.dismiss()
  offFirst()
  const next = new FeatureGuideController(scope, changes)
  const offNext = next.start()
  assert.equal(next.getSnapshot(), false)
  offNext()
})

test('browser acknowledgments persist across pages within a Host base and stay isolated from other bases', t => {
  const values = new Map()
  browserFixture(t, { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }, 'http://localhost/first/index.html')
  const { scope, changes } = fixture()
  const first = new FeatureGuideController(scope, changes)
  const offFirst = first.start()
  assert.equal(first.getSnapshot(), true)
  first.dismiss()
  offFirst()
  globalThis.document.baseURI = 'http://localhost/first/other-page'
  const reloaded = new FeatureGuideController(scope, changes)
  const offReloaded = reloaded.start()
  assert.equal(reloaded.getSnapshot(), false)
  offReloaded()
  globalThis.document.baseURI = 'http://localhost/second/'
  const anotherHost = new FeatureGuideController(scope, changes)
  const offAnotherHost = anotherHost.start()
  assert.equal(anotherHost.getSnapshot(), true)
  offAnotherHost()
})
