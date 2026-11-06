import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'
import { withDuplexBrowser } from './helpers/duplex-browser.mjs'

const { AnnouncementPlayback } = await loadClientModule('src/client/announcements/playback.ts')
const { SpeechActivity } = await loadClientModule('src/client/announcements/speech-activity.ts')
const { LocalSpeechController } = await loadClientModule('src/client/playback/local-speech-controller.ts')
const { XiaomiMimoTtsPcmService } = await loadClientModule('src/client/playback/pcm-play-service.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const { PluginAudioFocus } = await loadClientModule('src/client/plugin-activity.ts')

async function withService(run, browserOptions = {}, duplexOptions = {}) {
  await withBrowserPlayback(async state => withDuplexBrowser(async sockets => {
    const ctx = new Context()
    let allowed = true
    const settings = resolveTtsSettings({ enabled: true, provider: 'doubao' })
    const service = new XiaomiMimoTtsPcmService(ctx, { getSnapshot: () => ({ status: 'ready', value: settings }) }, () => {}, undefined, () => allowed)
    try { await run({ service, sockets, state, allow: value => { allowed = value } }) }
    finally { await service.dispose(); await ctx.fiber.dispose() }
  }, duplexOptions), { startLocal: true, ...browserOptions })
}

test('only enabled important alerts interrupt ordinary speech; blocked or cancelled alerts leave it intact', async () => {
  await withService(async ({ service, sockets, state, allow }) => {
    const automaticFocus = new PluginAudioFocus({ canPlay: () => true, claim: () => {}, subscribe: () => () => {} }, service.priorityActivity)
    const local = new LocalSpeechController()
    local.activateSession('session')
    const activity = new SpeechActivity()
    const off = activity.register(local.isBusy, () => local.interrupt())
    let priority = false
    const playback = new AnnouncementPlayback(service, activity, undefined, () => priority)
    const important = { source: 'approvals', id: 'approval', text: '请处理审批。', important: true }
    try {
      local.playCompleted('session', 'reply', '这是普通朗读。')
      await settle()
      assert.equal(local.isBusy(), true)
      playback.play(important)
      assert.equal(local.isBusy(), true)
      assert.equal(sockets.length, 0, 'the default behavior must still skip busy notifications')
      priority = true
      allow(false)
      playback.play(important)
      assert.equal(local.isBusy(), true, 'voice input, composing or lost audio permission must prevent preemption')
      allow(true)
      const controller = new AbortController()
      controller.abort()
      playback.play({ ...important, signal: controller.signal })
      assert.equal(local.isBusy(), true)
      assert.equal(service.tryPlay(' ', activity.isBusy, activity.interrupt), null)
      assert.equal(local.isBusy(), true, 'invalid reminders must not interrupt speech')
      playback.play({ source: 'job-results', id: 'success', text: '任务已完成。' })
      assert.equal(local.isBusy(), true, 'ordinary completions retain the busy-skip policy')
      const beforeCancel = state.cancelled
      const lifetime = new AbortController()
      playback.play({ ...important, signal: lifetime.signal })
      await settle()
      assert.equal(local.isBusy(), false)
      assert.ok(state.cancelled > beforeCancel)
      assert.equal(service.isBusy(), true)
      assert.equal(automaticFocus.canPlay(), false, 'ordinary automatic replies must yield for the entire priority playback')
      const socketCount = sockets.length
      service.play('鲸鱼娘的新消息。')
      playback.play({ ...important, id: 'another-important' })
      assert.equal(sockets.length, socketCount, 'an important alert must retain its audio tail against later proactive speech')
      lifetime.abort()
      assert.equal(service.isBusy(), false)
      assert.equal(automaticFocus.canPlay(), true)
      assert.equal(state.utterances.length, 1, 'the interrupted reply must not resume automatically')
    } finally { off(); local.dispose() }
  })
})

test('priority releases automatic audio permission after natural completion or synthesis failure', async () => {
  for (const failure of [false, true]) {
    await withService(async ({ service }) => {
      const automaticFocus = new PluginAudioFocus({ canPlay: () => true, claim: () => {}, subscribe: () => () => {} }, service.priorityActivity)
      const permissions = []
      const off = automaticFocus.subscribe(() => permissions.push(automaticFocus.canPlay()))
      try {
        service.tryPlay('重要提醒。', () => false, () => {})
        assert.equal(automaticFocus.canPlay(), false)
        await settle(); await settle()
        assert.equal(automaticFocus.canPlay(), true)
        assert.deepEqual(permissions, [false, true])
      } finally { off() }
    }, { endPcm: true }, failure ? { handle(socket, command) {
      if (command.type === 'text') { socket.message({ type: 'error', error: 'rate-limited' }); return true }
    } } : {})
  }
})

test('priority can replace ordinary PCM while stale cancellation cannot stop its replacement', async () => {
  await withService(async ({ service, sockets }) => {
    const oldStop = service.tryPlay('普通播报。', () => false)
    await settle()
    assert.equal(service.isBusy(), true)
    const stop = service.tryPlay('重要提醒。', () => false, () => {})
    await settle()
    assert.equal(typeof stop, 'function')
    assert.equal(sockets[0].closed, true)
    assert.equal(service.isBusy(), true)
    oldStop()
    assert.equal(service.isBusy(), true, 'an older source must not cancel the priority generation')
    stop()
    assert.equal(service.isBusy(), false)
  })
})

test('new adaptation switches default off and persist without changing either default-on switch', async () => {
  const user = {}
  const scope = {
    getSnapshot: () => ({ user, value: user }),
    async mutate(ops) { for (const op of ops) { if (op.op === 'set') user[op.path[0]] = op.value; else delete user[op.path[0]] } return true },
  }
  assert.equal(resolveTtsSettings().inputAvoidance, false)
  assert.equal(resolveTtsSettings().importantAnnouncementsFirst, false)
  const changes = { inputAvoidance: { kind: 'set' }, importantAnnouncementsFirst: { kind: 'set' } }
  await saveSettingsDraft(scope, resolveTtsSettings({ inputAvoidance: true, importantAnnouncementsFirst: true }), changes, { xiaomi: '', doubao: '', breeze: '' })
  assert.deepEqual(user, { inputAvoidance: true, importantAnnouncementsFirst: true })
  assert.equal(resolveTtsSettings(user).voiceInputCompatibility, true)
  assert.equal(resolveTtsSettings(user).showInHostSettings, true)
})
