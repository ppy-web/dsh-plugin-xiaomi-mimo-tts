import assert from 'node:assert/strict'
import test from 'node:test'
import { TTS_TOGGLE_SOUND_FILES, TTS_VOLUME_PREVIEW_FILES } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'

const { ToggleSoundPlayer } = await loadClientModule('src/client/sound-effects/toggle-sound-player.ts')

test('toggle feedback selects a bundled sound for every state and releases replaced playback', async t => {
  await withBrowserPlayback(async state => {
    let scheduled
    t.mock.method(window, 'setTimeout', callback => { scheduled = callback; return 1 })
    t.mock.method(window, 'clearTimeout', () => { scheduled = undefined })
    t.mock.method(Math, 'random', () => 0)
    const player = new ToggleSoundPlayer()
    try {
      for (const [kind, files] of Object.entries(TTS_TOGGLE_SOUND_FILES)) {
        const selected = []
        for (let attempt = 0; attempt < 2; attempt++) {
          const previous = state.media.at(-1)
          player.schedule(kind)
          if (previous) {
            assert.equal(previous.paused, true)
            assert.equal(previous.src, '')
          }
          scheduled()
          const audio = state.media.at(-1)
          const file = audio.src.split('/').at(-1)
          assert.ok(files.includes(file), `${kind}: ${file}`)
          assert.equal(audio.paused, false)
          selected.push(file)
        }
        if (files.length > 1) assert.notEqual(selected[0], selected[1])
      }
      player.schedule('on')
      player.setEnabled(false)
      assert.equal(scheduled, undefined)
      assert.equal(state.media.at(-1).paused, true)
      assert.equal(state.media.at(-1).src, '')
    } finally { player.dispose() }
  })
})

test('volume preview uses bundled audio, avoids overlap and releases audio on disable', async () => {
  await withBrowserPlayback(async state => {
    const player = new ToggleSoundPlayer()
    try {
      player.previewVolume(0.4)
      const first = state.media.at(-1)
      const firstSource = first.src
      assert.ok(TTS_VOLUME_PREVIEW_FILES.includes(firstSource.split('/').at(-1)))
      assert.equal(first.volume, 0.4)
      player.previewVolume(0.7)
      assert.equal(state.media.at(-1), first)
      assert.equal(first.volume, 0.7)
      first.onended()
      assert.equal(first.paused, true)
      assert.equal(first.src, '')
      player.previewVolume(0.5)
      const next = state.media.at(-1)
      assert.ok(TTS_VOLUME_PREVIEW_FILES.includes(next.src.split('/').at(-1)))
      if (TTS_VOLUME_PREVIEW_FILES.length > 1) assert.notEqual(next.src, firstSource)
      player.setEnabled(false)
      assert.equal(next.paused, true)
      assert.equal(next.src, '')
    } finally { player.dispose() }
  })
})
