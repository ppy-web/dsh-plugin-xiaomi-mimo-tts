import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { playMossAudio } = await loadClientModule('src/client/playback/moss-playback.ts')

class FakeAudio {
  static last = null
  constructor(url) {
    this.url = url
    this.volume = 1
    this.playbackRate = 1
    this.paused = true
    this.played = 0
    this.onplaying = null
    this.onended = null
    this.onerror = null
    FakeAudio.last = this
  }
  play() {
    this.paused = false
    this.played += 1
    this.onplaying?.()
    return Promise.resolve()
  }
  pause() { this.paused = true }
}

function withBrowserStubs(run, { playRejects = false } = {}) {
  const original = {
    Audio: globalThis.Audio,
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    createObjectURL: URL.createObjectURL,
    revokeObjectURL: URL.revokeObjectURL,
  }
  const revoked = []
  class StubAudio extends FakeAudio {
    constructor(url) {
      super(url)
      if (playRejects) this.play = () => { this.paused = false; return Promise.reject(new Error('blocked')) }
    }
  }
  globalThis.Audio = StubAudio
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } })
  URL.createObjectURL = () => 'blob:moss-test'
  URL.revokeObjectURL = url => { revoked.push(url) }
  return Promise.resolve(run({ revoked })).finally(() => {
    globalThis.Audio = original.Audio
    if (original.window) Object.defineProperty(globalThis, 'window', original.window)
    else delete globalThis.window
    URL.createObjectURL = original.createObjectURL
    URL.revokeObjectURL = original.revokeObjectURL
  })
}

test('MOSS playback applies volume and rate, pauses, resumes and stops', async () => {
  await withBrowserStubs(async ({ revoked }) => {
    let started = 0
    const handle = playMossAudio(new Blob(['wav']), { volume: 0.4, rate: 1.2, onStart: () => { started += 1 } })
    await Promise.resolve()
    const audio = FakeAudio.last
    assert.equal(audio.volume, 0.4)
    assert.equal(audio.playbackRate, 1.2)
    assert.equal(audio.url, 'blob:moss-test')
    assert.equal(started, 1)
    handle.pause()
    assert.equal(audio.paused, true)
    await handle.resume()
    assert.equal(audio.paused, false)
    handle.stop()
    await handle.done
    assert.deepEqual(revoked, ['blob:moss-test'])
  })
})

test('MOSS playback finishes when the audio ends or is stopped', async () => {
  await withBrowserStubs(async ({ revoked }) => {
    const ended = playMossAudio(new Blob(['wav']), { volume: 1, rate: 1 })
    await Promise.resolve()
    FakeAudio.last.onended()
    await ended.done
    assert.deepEqual(revoked, ['blob:moss-test'])
  })
})

test('MOSS playback reports blocked autoplay and timeouts to the caller', async () => {
  await withBrowserStubs(async () => {
    const blocked = playMossAudio(new Blob(['wav']), { volume: 1, rate: 1 })
    await assert.rejects(blocked.done, /autoplay-blocked/u)
  }, { playRejects: true })
  await withBrowserStubs(async () => {
    const timed = playMossAudio(new Blob(['wav']), { volume: 1, rate: 1, timeoutMs: 5 })
    await assert.rejects(timed.done, /local-speech-timeout/u)
  })
})
