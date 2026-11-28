import assert from 'node:assert/strict'
import test from 'node:test'
import { createRecipe, renderRecipe } from '../src/client/sound-effects/runtime.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'

const { createSoundEffectsController, installClickSounds } = await loadClientModule('src/client/sound-effects/index.ts')
const { classifyClick } = await loadClientModule('src/client/sound-effects/click-classifier.ts')
const { isStudioProgressVisible, collectNewlyCompletedStudioTaskIds } = await loadClientModule('src/client/settings/card.tsx')

const settings = { enabled: true, clickSounds: true, taskSounds: false, volume: 0.65, pack: 'glass' }

test('voice volume preview plays the selected sound pack at the new level', async () => {
  await withBrowserPlayback(async state => {
    window.AudioContext = AudioContext
    const sampleRate = AudioContext.prototype.sampleRate = 24_000
    const sounds = createSoundEffectsController()
    sounds.update(settings)
    try {
      sounds.previewVolume()
      const [context] = state.contexts
      const [normalPreview, output] = context.gains
      const normalLevel = normalPreview.gain.value
      assert.ok(normalLevel > 0)

      sounds.previewVolume(0.5)
      const halfVolume = context.sources.at(-1)
      assert.equal(halfVolume.buffer.duration, renderRecipe(createRecipe(settings.pack, 'check'), sampleRate).duration)
      assert.equal(context.gains.at(-1).gain.value, normalLevel * 0.5)

      sounds.previewVolume(0)
      assert.equal(halfVolume.finished, true)
      assert.equal(context.gains.at(-1).gain.value, 0)
      assert.equal(output.gain.value, settings.volume)
    } finally { await sounds.dispose() }
  })
})

test('volume preview respects audio focus and stops when sound effects are muted', async () => {
  await withBrowserPlayback(async state => {
    window.AudioContext = AudioContext
    AudioContext.prototype.sampleRate = 24_000
    let canPlay = false
    const sounds = createSoundEffectsController(() => canPlay)
    sounds.update(settings)
    try {
      sounds.previewVolume(0.8)
      assert.equal(state.contexts.flatMap(context => context.sources).length, 0)

      canPlay = true
      sounds.previewVolume(0.8)
      const [context] = state.contexts
      const [preview] = context.sources
      sounds.update({ ...settings, enabled: false })
      assert.equal(preview.finished, true)

      sounds.previewVolume(0.8)
      assert.deepEqual(context.sources, [preview])
    } finally { await sounds.dispose() }
  })
})

function withDomStubs(run) {
  const keys = ['Element', 'HTMLButtonElement', 'document']
  const originals = new Map(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  class FakeElement {
    constructor({ attrs = {}, radio = null, parent = null } = {}) {
      this.attrs = attrs
      this.radio = radio
      this.parent = parent
    }
    closest(selector) {
      const attr = selector.match(/^\[([^\]]+)\]$/)?.[1]
      if (!attr) return null
      let node = this
      while (node) {
        if (Object.prototype.hasOwnProperty.call(node.attrs, attr)) return node
        node = node.parent
      }
      return null
    }
    querySelector(selector) {
      return selector === 'input[type="radio"]' ? this.radio : null
    }
  }
  class FakeButton extends FakeElement {}
  const listeners = new Map()
  const doc = {
    addEventListener(type, listener) {
      let set = listeners.get(type)
      if (!set) { set = new Set(); listeners.set(type, set) }
      set.add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    dispatch(type, event) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
  }
  globalThis.Element = FakeElement
  globalThis.HTMLButtonElement = FakeButton
  globalThis.document = doc
  try {
    return run({ FakeElement, doc })
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

test('classifyClick triggers select for selectable radio cards and skips disabled ones', () => {
  withDomStubs(({ FakeElement }) => {
    const enabledOption = new FakeElement({ attrs: { 'data-xmimo-select-option': 'true' }, radio: { disabled: false } })
    const child = new FakeElement({ parent: enabledOption })
    assert.equal(classifyClick(child), 'select')

    const disabledOption = new FakeElement({ attrs: { 'data-xmimo-select-option': 'true' }, radio: { disabled: true } })
    const disabledChild = new FakeElement({ parent: disabledOption })
    assert.equal(classifyClick(disabledChild), null)
  })
})

test('installClickSounds plays hover once on mouse entry to module headers and ignores touch', () => {
  withDomStubs(({ FakeElement, doc }) => {
    const played = []
    const controller = { play: cue => played.push(cue) }
    const header = new FakeElement({ attrs: { 'data-xmimo-hover-sound': 'true' } })
    const title = new FakeElement({ parent: header })
    const badge = new FakeElement({ parent: header })
    const outside = new FakeElement()

    const uninstall = installClickSounds({}, controller, () => settings)
    try {
      const over = (target, relatedTarget, pointerType = 'mouse') => {
        doc.dispatch('pointerover', { target, relatedTarget, pointerType })
      }

      over(title, outside, 'mouse')
      over(badge, title, 'mouse')
      over(title, outside, 'touch')
      assert.deepEqual(played, ['hover'])

      over(title, outside, 'mouse')
      assert.deepEqual(played, ['hover', 'hover'])
    } finally {
      uninstall()
    }
  })
})

test('processing loop starts when active and stops on disable, taskSounds off, or dispose', async () => {
  await withBrowserPlayback(async state => {
    window.AudioContext = AudioContext
    AudioContext.prototype.sampleRate = 24_000
    const sounds = createSoundEffectsController()
    sounds.update({ ...settings, taskSounds: true })
    try {
      sounds.setLoop('processing', true)
      const [context] = state.contexts
      assert.equal(context.sources.length, 1)
      const firstLoop = context.sources[0]
      assert.equal(firstLoop.loop, true)
      assert.equal(firstLoop.finished, undefined)

      sounds.setLoop('processing', true)
      assert.equal(context.sources.length, 1)

      sounds.update({ ...settings, taskSounds: false })
      assert.equal(firstLoop.finished, true)

      sounds.update({ ...settings, taskSounds: true })
      assert.equal(context.sources.length, 2)
      const secondLoop = context.sources[1]
      assert.equal(secondLoop.finished, undefined)

      sounds.update({ ...settings, enabled: false, taskSounds: true })
      assert.equal(secondLoop.finished, true)

      sounds.update({ ...settings, enabled: true, taskSounds: true })
      assert.equal(context.sources.length, 3)
      const thirdLoop = context.sources[2]

      sounds.setLoop('processing', false)
      assert.equal(thirdLoop.finished, true)

      sounds.setLoop('processing', true)
      assert.equal(context.sources.length, 4)
      const fourthLoop = context.sources[3]
      await sounds.dispose()
      assert.equal(fourthLoop.finished, true)
    } finally {
      await sounds.dispose()
    }
  })
})

test('isStudioProgressVisible only allows processing sound when a recording progress bar is visible', () => {
  const base = {
    changing: false,
    studioTab: null,
    historyOpen: false,
    openPanel: 'studio',
    minimalMode: false,
    searchActive: false,
    searchShowsStudio: false,
  }
  assert.equal(isStudioProgressVisible(base), true)
  assert.equal(isStudioProgressVisible({ ...base, openPanel: 'mixer' }), false)
  assert.equal(isStudioProgressVisible({ ...base, openPanel: null }), false)
  assert.equal(isStudioProgressVisible({ ...base, minimalMode: true }), false)
  assert.equal(isStudioProgressVisible({ ...base, historyOpen: true }), false)
  assert.equal(isStudioProgressVisible({ ...base, changing: true }), false)

  assert.equal(isStudioProgressVisible({ ...base, openPanel: null, studioTab: 'tasks' }), true)
  assert.equal(isStudioProgressVisible({ ...base, studioTab: 'scripts' }), false)
  assert.equal(isStudioProgressVisible({ ...base, studioTab: 'roles' }), false)

  assert.equal(isStudioProgressVisible({ ...base, openPanel: null, minimalMode: true, searchActive: true, searchShowsStudio: true }), true)
  assert.equal(isStudioProgressVisible({ ...base, openPanel: 'studio', searchActive: true, searchShowsStudio: false }), false)
})

test('collectNewlyCompletedStudioTaskIds detects active tasks transitioning to completed', () => {
  const previous = new Map([
    ['t-running', 'running'],
    ['t-queued', 'queued'],
    ['t-done', 'completed'],
    ['t-paused', 'paused'],
  ])
  const tasks = [
    { id: 't-running', status: 'completed' },
    { id: 't-queued', status: 'completed' },
    { id: 't-done', status: 'completed' },
    { id: 't-paused', status: 'failed' },
    { id: 't-new-done', status: 'completed' },
  ]
  assert.deepEqual(collectNewlyCompletedStudioTaskIds(previous, tasks), ['t-running', 't-queued'])
})
