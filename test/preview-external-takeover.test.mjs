import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { PreviewSettingsScope } = await loadClientModule('tools/preview/mock-settings.ts')
const { PreviewExternalTakeover } = await loadClientModule('tools/preview/mock-engine.ts')
const { engineStateStore } = await loadClientModule('src/client/engine-state.ts')

test('preview takeover can be switched on and off without losing either configuration', async () => {
  const scope = new PreviewSettingsScope()
  await scope.set('provider', 'doubao')
  await scope.set('voiceVolume', 0.6)
  const takeover = new PreviewExternalTakeover(scope, null)
  const changes = []
  const off = takeover.subscribe(() => changes.push(takeover.getSnapshot()))
  try {
    assert.equal(takeover.getSnapshot(), false)
    assert.equal(engineStateStore.getSnapshot().engine.provider, 'doubao')

    takeover.set(true)
    const external = engineStateStore.getSnapshot().engine
    assert.equal(external.provider, 'external:demo-tone')
    assert.equal(external.configurable, true)
    assert.equal(scope.getSnapshot().value.provider, 'doubao')
    assert.equal(scope.getSnapshot().value.voiceVolume, 0.6)

    const selection = { ...external.selection, voice: 'male_0004_a' }
    engineStateStore.accept({ ...external, revision: external.revision + 1, selection })
    takeover.set(false)
    assert.equal(engineStateStore.getSnapshot().engine.provider, 'doubao')
    assert.equal(scope.getSnapshot().value.voiceVolume, 0.6)
    takeover.set(true)
    assert.deepEqual(engineStateStore.getSnapshot().engine.selection, selection)
    assert.deepEqual(changes, [true, false, true])

    await scope.set('acceptExternalProviders', false)
    assert.equal(engineStateStore.getSnapshot().engine.provider, 'doubao')
    assert.equal(takeover.getSnapshot(), true)
    await scope.set('acceptExternalProviders', true)
    assert.equal(engineStateStore.getSnapshot().engine.provider, 'external:demo-tone')
    assert.deepEqual(engineStateStore.getSnapshot().engine.selection, selection)
  } finally {
    off()
    takeover.dispose()
  }
})

for (const [mode, streaming, ready, configurable] of [
  ['wav', false, true, false],
  ['pcm', true, true, false],
  ['unready', false, false, false],
  ['adapter', false, true, true],
]) test(`preview query fixture ${mode} remains available through the takeover switch`, () => {
  const scope = new PreviewSettingsScope()
  const takeover = new PreviewExternalTakeover(scope, mode)
  try {
    assert.equal(takeover.getSnapshot(), true)
    const initial = engineStateStore.getSnapshot().engine
    assert.equal(initial.provider, 'external:demo-tone')
    assert.equal(initial.streaming, streaming)
    assert.equal(initial.ready, ready)
    assert.equal(initial.configurable === true, configurable)
    takeover.set(false)
    assert.equal(engineStateStore.getSnapshot().engine.provider, 'xiaomi')
    takeover.set(true)
    const restored = engineStateStore.getSnapshot().engine
    assert.equal(restored.streaming, streaming)
    assert.equal(restored.ready, ready)
    assert.equal(restored.configurable === true, configurable)
  } finally {
    takeover.dispose()
  }
})
