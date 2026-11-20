import assert from 'node:assert/strict'
import test from 'node:test'
import { createRecipe, renderRecipe } from '../src/client/sound-effects/runtime.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'

const { createSoundEffectsController } = await loadClientModule('src/client/sound-effects/index.ts')

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
