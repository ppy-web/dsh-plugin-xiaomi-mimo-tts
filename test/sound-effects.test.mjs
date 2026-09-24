import assert from 'node:assert/strict'
import test from 'node:test'

const shared = await import('../lib/shared.js')
const soundRuntime = await import('../src/client/sound-effects/runtime.js')

test('sound effects expose selectable packs and safe defaults', () => {
  assert.ok(Array.isArray(shared.SOUND_PACKS))
  assert.ok(shared.SOUND_PACKS.length > 0)
  assert.equal(new Set(shared.SOUND_PACKS).size, shared.SOUND_PACKS.length)
  assert.ok(shared.SOUND_PACKS.includes('zen'))
  assert.deepEqual(shared.SOUND_EFFECTS_MODES, ['all', 'off', 'click', 'task'])
  assert.equal(shared.resolveSoundEffectsMode(true, true, true), 'all')
  assert.equal(shared.resolveSoundEffectsMode(false, false, false), 'off')
  assert.equal(shared.resolveSoundEffectsMode(true, false, true), 'click')
  assert.equal(shared.resolveSoundEffectsMode(true, true, false), 'task')
  assert.equal(shared.nextSoundEffectsMode('all'), 'off')
  assert.equal(shared.nextSoundEffectsMode('off'), 'click')
  assert.equal(shared.nextSoundEffectsMode('click'), 'task')
  assert.equal(shared.nextSoundEffectsMode('task'), 'all')
  assert.deepEqual(shared.getSoundEffectsModeFlags('all'), { enabled: true, taskSounds: true, clickSounds: true })
  assert.deepEqual(shared.getSoundEffectsModeFlags('off'), { enabled: false, taskSounds: false, clickSounds: false })
  assert.deepEqual(shared.getSoundEffectsModeFlags('click'), { enabled: true, taskSounds: false, clickSounds: true })
  assert.deepEqual(shared.getSoundEffectsModeFlags('task'), { enabled: true, taskSounds: true, clickSounds: false })
  assert.equal(shared.DEFAULT_TTS_SETTINGS.soundEnabled, false)
  assert.equal(shared.DEFAULT_TTS_SETTINGS.taskSounds, false)
  assert.equal(shared.DEFAULT_TTS_SETTINGS.clickSounds, false)
  assert.equal(shared.DEFAULT_TTS_SETTINGS.soundVolume, 0.35)
  assert.ok(shared.SOUND_PACKS.includes(shared.DEFAULT_TTS_SETTINGS.soundPack))
})

test('sound runtime exposes the shared packs and valid plugin cues', () => {
  assert.deepEqual(soundRuntime.packNames, shared.SOUND_PACKS)
  assert.ok(Array.isArray(soundRuntime.cueNames))
  assert.ok(soundRuntime.cueNames.length > 0)
  assert.equal(new Set(soundRuntime.cueNames).size, soundRuntime.cueNames.length)
  for (const cue of ['press', 'select', 'toggle-on', 'toggle-off', 'start', 'complete', 'error']) {
    assert.ok(soundRuntime.cueNames.includes(cue), cue)
  }
})
