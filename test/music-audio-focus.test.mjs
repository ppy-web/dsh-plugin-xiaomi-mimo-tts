import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { resolveTtsSettings } from '../lib/shared.js'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'
import { loadClientModule, settle } from './helpers/client-modules.mjs'

const { PlaybackController } = await loadClientModule('src/client/playback/playback-controller.ts')
const { LiveSpeechController } = await loadClientModule('src/client/playback/live-speech-controller.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { XiaomiMimoTtsPcmService } = await loadClientModule('src/client/playback/pcm-play-service.ts')
const { PreviewPlayer } = await loadClientModule('src/client/playback/preview-player.ts')

const session = 'session'
const message = 'message'
const reply = '这是一段语音。'
const wav = () => new Response('wav bytes')

function installMusicPanel() {
  const active = new Set()
  const begins = []
  window.__dshMusicAudioFocus = {
    begin(reason) { active.add(reason); begins.push(reason) },
    end(reason) { active.delete(reason) },
  }
  return { active, begins }
}

test('conversation audio plays and finishes without the music panel', async () => {
  await withBrowserPlayback(async ({ media, requests }) => {
    const playback = new PlaybackController()
    playback.activateSession(session)
    try {
      await playback.toggle(session, message, reply, true)
      assert.equal(playback.getSnapshot().status, 'playing')
      assert.equal(media[0].paused, false)
      media[0].dispatchEvent(new Event('ended'))
      assert.equal(playback.getSnapshot().status, 'idle')
      assert.equal(requests.length, 1, 'music integration requires no HTTP request when absent')
    } finally { playback.dispose() }
  }, { fetch: wav })
})

test('music interface failures do not interrupt conversation audio', async () => {
  await withBrowserPlayback(async ({ media }) => {
    const playback = new PlaybackController()
    playback.activateSession(session)
    try {
      window.__dshMusicAudioFocus = {
        begin() { throw new Error('music player unavailable') },
        end() { throw new Error('music player unavailable') },
      }
      await playback.toggle(session, message, reply, false)
      assert.equal(playback.getSnapshot().status, 'playing')
      await playback.toggle(session, message, reply, false)
      assert.equal(playback.getSnapshot().status, 'paused')
      window.__dshMusicAudioFocus.begin = () => {}
      await playback.toggle(session, message, reply, false)
      media[0].dispatchEvent(new Event('ended'))
      assert.equal(playback.getSnapshot().status, 'idle')
    } finally { playback.dispose() }
  }, { fetch: wav })
})

test('segmented audio acquires after synthesis, holds during the reply and releases when stopped', async () => {
  await withBrowserPlayback(async ({ media }) => {
    const { active, begins } = installMusicPanel()
    const playback = new PlaybackController()
    playback.activateSession(session)
    const text = '甲'.repeat(200) + '。' + '乙'.repeat(200) + '。'
    try {
      const first = playback.segmented(session, message, text, false)
      assert.equal(active.size, 0)
      await settle()
      assert.equal(active.size, 1)
      playback.pauseSegmented(session, message)
      await first
      assert.equal(active.size, 0)

      const resumed = playback.segmented(session, message, text, false)
      await settle()
      assert.equal(active.size, 1)
      assert.notEqual(begins[0], begins[1])
      media[1].dispatchEvent(new Event('ended'))
      await settle()
      assert.deepEqual([...active], [begins[1]])
      assert.equal(begins.length, 2, 'a new segment must not restart ducking')
      media[2].dispatchEvent(new Event('error'))
      await resumed
      assert.equal(playback.getSnapshot().status, 'error')
      assert.equal(active.size, 0)
    } finally { playback.dispose() }
  }, { fetch: wav })
})

test('live PCM releases when paused and renews the active reason during long playback', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] })
  await withBrowserPlayback(async ({ contexts }) => {
    const { active, begins } = installMusicPanel()
    const live = new LiveSpeechController()
    live.activateSession(session)
    try {
      live.playCompleted(session, message, reply)
      await settle()
      assert.equal(active.size, 1)
      await live.pause(session)
      assert.equal(active.size, 0)
      await live.resume(session)
      assert.equal(active.size, 1)
      const [reason] = active
      t.mock.timers.tick(60_000)
      assert.ok(begins.slice(2).length > 0, 'renew before the music panel TTL expires')
      assert.deepEqual([...active], [reason])
      contexts[0].advanceTo(1)
      await settle()
      assert.equal(active.size, 0)
      const requestCount = begins.length
      t.mock.timers.tick(60_000)
      assert.equal(begins.length, requestCount, 'the finished playback must not renew the request')
    } finally { await live.dispose() }
  })
})

test('browser speech and a voice preview release their own music requests independently', async () => {
  await withBrowserPlayback(async ({ utterances, media }) => {
    const { active } = installMusicPanel()
    const local = new LocalSpeechController()
    const preview = new PreviewPlayer(() => {})
    local.activateSession(session)
    try {
      local.playCompleted(session, message, reply)
      await settle()
      assert.equal(active.size, 1)
      const pending = preview.play(reply, resolveTtsSettings({ model: 'mimo-v2.5-tts-voicedesign' }))
      await settle()
      assert.equal(active.size, 2)
      media[0].onended()
      await pending
      assert.equal(active.size, 1)
      utterances[0].onend()
      await settle()
      assert.equal(active.size, 0)
    } finally { local.dispose(); await preview.dispose() }
  }, { fetch: wav, startLocal: true })
})

test('event announcements keep music ducked until queued PCM drains or playback stops', async () => {
  await withBrowserPlayback(async ({ contexts }) => {
    const { active } = installMusicPanel()
    const ctx = new Context()
    const settings = resolveTtsSettings({ enabled: true })
    const service = new XiaomiMimoTtsPcmService(ctx, { getSnapshot: () => ({ status: 'ready', value: settings }) }, () => {})
    try {
      service.play(reply)
      await settle()
      assert.equal(active.size, 1)
      contexts[0].advanceTo(1)
      assert.equal(active.size, 0)
      service.play(reply)
      await settle()
      assert.equal(active.size, 1)
      service.stop()
      assert.equal(active.size, 0)
    } finally { await service.dispose(); await ctx.fiber.dispose() }
  })
})
