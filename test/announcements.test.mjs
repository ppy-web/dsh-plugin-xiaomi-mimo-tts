import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { withBrowserPlayback } from './helpers/browser-playback.mjs'
import { withDuplexBrowser } from './helpers/duplex-browser.mjs'
import { resolveTtsSettings } from '../lib/shared.js'
import { Context } from '@deepseek-ai/cordis'

const { DshPetCollector } = await loadClientModule('src/client/announcements/dsh-pet.ts')
const { AnnouncementManager } = await loadClientModule('src/client/announcements/manager.ts')
const { SpeechActivity, isSpeechBusy } = await loadClientModule('src/client/announcements/speech-activity.ts')
const { AnnouncementPlayback } = await loadClientModule('src/client/announcements/playback.ts')
const { XiaomiMimoTtsPcmService } = await loadClientModule('src/client/playback/pcm-play-service.ts')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

const snapshot = (version, leaves, config = 0) => ({
  ...(version === undefined ? {} : { counter: version }),
  sections: { config: { counter: config, data: {} } },
  pets: Object.fromEntries(Object.entries(leaves).map(([id, [counter, data]]) => [id, { say: { counter, data } }])),
})
const config = ids => ({ main: { pets: ids.map(([id, display = 'web']) => ({ id, display })) } })

function mockPet(t, frames, configurations = [config([['main']])]) {
  const requests = []
  let lastConfig
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), signal: options.signal })
    if (String(url).includes('/config')) {
      lastConfig = configurations.length ? configurations.shift() : lastConfig
      if (lastConfig instanceof Error) throw lastConfig
      if (typeof lastConfig === 'number') return new Response('', { status: lastConfig })
      return Response.json(lastConfig)
    }
    if (frames.length) {
      const frame = frames.shift()
      if (frame instanceof Error) throw frame
      if (typeof frame === 'number') return new Response('', { status: frame })
      return Response.json(frame)
    }
    return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
  })
  const controller = new AbortController()
  const emitted = []
  const done = new DshPetCollector().start({ signal: controller.signal, emit: event => emitted.push(event) })
  t.after(async () => { controller.abort(); await done })
  return { emitted, requests, controller, done }
}

test('pet collector baselines, deduplicates by pet and counter, filters cues and orders simultaneous speech', async t => {
  const old = { text: '旧消息' }
  const frames = [
    snapshot(10, { 'a.b': [8, old], desktop: [9, old], hidden: [10, old] }),
    snapshot(10, { 'a.b': [8, old], desktop: [9, old], hidden: [10, old] }),
    snapshot(14, { 'a.b': [14, { text: '你好' }], desktop: [12, { text: '你好' }], hidden: [13, { text: '隐藏' }] }),
    snapshot(16, { 'a.b': [15, { clear: true, text: '清空' }], desktop: [16, { text: '零时长', duration: 0 }] }),
    snapshot(19, { 'a.b': [17, { text: ' ' }], desktop: [18, { text: '你好' }], removed: [19, { text: '已删除' }] }),
    snapshot(20, { 'a.b': [20, { text: 42 }] }),
    snapshot(21, { desktop: [21, { text: '正常' }] }),
    snapshot(22, { desktop: ['invalid', { text: '非法计数器' }] }),
    snapshot(23, { desktop: [21, { text: '正常' }] }),
  ]
  const run = mockPet(t, frames, [config([['a.b'], ['desktop', 'desktop'], ['hidden', 'none']])])
  await settle()
  assert.deepEqual(run.emitted.map(event => event.text), ['你好', '你好', '你好', '正常'])
  assert.equal(new Set(run.emitted.map(event => event.id)).size, run.emitted.length)
  const poll = new URL(run.requests.find(request => new URL(request.url, 'http://host.test').searchParams.has('since'))?.url, 'http://host.test')
  assert.equal(poll.searchParams.get('since'), '10')
  run.controller.abort()
  await run.done
  assert.ok(run.requests.at(-1).signal.aborted)
})

test('config changes hide pets, failed config pauses collection, recovery and restart only establish baselines', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const frames = [snapshot(2, { main: [2, { text: '旧' }] }),
    snapshot(4, { main: [4, { text: '隐藏' }] }, 3),
    snapshot(6, { main: [6, { text: '配置失败' }] }, 5),
    snapshot(8, { main: [8, { text: '恢复基线' }] }, 5),
    snapshot(9, { main: [9, { text: '恢复后' }] }, 5),
    snapshot(1, { main: [1, { text: '重启基线' }] }),
    snapshot(2, { main: [2, { text: '重启后' }] })]
  const run = mockPet(t, frames, [config([['main']]), config([['main', 'none']]), new Error('unavailable'), config([['main']])])
  await settle()
  assert.equal(run.emitted.length, 0)
  t.mock.timers.tick(5000)
  await settle()
  assert.deepEqual(run.emitted.map(event => event.text), ['恢复后', '重启后'])
})

for (const endpoint of ['state', 'config']) test(`missing pet ${endpoint} endpoint stops polling instead of retrying`, async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const run = endpoint === 'state'
    ? mockPet(t, [404])
    : mockPet(t, [snapshot(1, { main: [1, { text: '旧消息' }] })], [404])
  await settle()
  const count = run.requests.length
  assert.ok(run.requests.at(-1).url.includes(`/${endpoint}`))
  t.mock.timers.tick(60000)
  await settle()
  assert.equal(run.requests.length, count)
  assert.deepEqual(run.emitted, [])
  await run.done
})

test('missing pet stays idle on settings updates and can recover after the source is re-enabled', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const frames = [404, snapshot(1, { main: [1, { text: '旧消息' }] }), snapshot(2, { main: [2, { text: '安装后新消息' }] })]
  const events = [], requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push(String(url))
    if (String(url).includes('/config')) return Response.json(config([['main']]))
    if (frames.length) {
      const frame = frames.shift()
      return typeof frame === 'number' ? new Response('', { status: frame }) : Response.json(frame)
    }
    return new Promise((_, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
    })
  })
  const manager = new AnnouncementManager([new DshPetCollector()], event => events.push(event), () => {})
  t.after(() => manager.dispose())
  manager.update(['dsh-pet'], true)
  await settle()
  manager.update(['dsh-pet'], true)
  t.mock.timers.tick(60000)
  await settle()
  assert.equal(requests.length, 1)
  manager.update([], true)
  manager.update(['dsh-pet'], true)
  await settle()
  assert.deepEqual(events.map(event => event.text), ['安装后新消息'])
})

test('server failures and malformed snapshots back off; legacy hosts use fixed polling; cancellation clears retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const run = mockPet(t, [503, { invalid: true }, snapshot(undefined, { main: [1, { text: '基线' }] }), snapshot(undefined, { main: [2, { text: '新消息' }] })])
  await settle()
  assert.equal(run.requests.length, 1)
  t.mock.timers.tick(4999)
  await settle()
  assert.equal(run.requests.length, 1)
  t.mock.timers.tick(1)
  await settle()
  assert.equal(run.requests.length, 2)
  t.mock.timers.tick(5000)
  await settle()
  assert.equal(run.emitted.length, 0)
  t.mock.timers.tick(1000)
  await settle()
  assert.deepEqual(run.emitted.map(event => event.text), ['新消息'])
  assert.ok(run.requests.every(request => !request.url.includes('since=')))
  run.controller.abort()
  await run.done
  const count = run.requests.length
  t.mock.timers.tick(60000)
  await settle()
  assert.equal(run.requests.length, count)
})

test('visibility is refreshed before new speech even when a config save did not change its counter', async t => {
  const run = mockPet(t, [snapshot(1, { main: [1, { text: '旧消息' }] }),
    snapshot(2, { main: [2, { text: '已隐藏' }] }),
    snapshot(3, { main: [3, { text: '重新显示' }] })],
  [config([['main']]), config([['main', 'none']]), config([['main', 'both']])])
  await settle()
  assert.deepEqual(run.emitted.map(event => event.text), ['重新显示'])
})

test('manager gates sources by settings/audio ownership and rejects emissions from aborted collectors', async () => {
  const starts = [], events = [], stops = []
  const manager = new AnnouncementManager([{ id: 'dsh-pet', async start(options) { starts.push(options) } }], event => events.push(event), source => stops.push(source))
  manager.update(['dsh-pet'], false)
  assert.equal(starts.length, 0)
  manager.update(['dsh-pet'], true)
  manager.update(['dsh-pet'], true)
  assert.equal(starts.length, 1)
  starts[0].emit({ source: 'dsh-pet', id: '1', text: '新' })
  manager.update([], true)
  starts[0].emit({ source: 'dsh-pet', id: '2', text: '旧' })
  assert.equal(events.length, 1)
  assert.equal(starts[0].signal.aborted, true)
  manager.update(['dsh-pet'], true)
  assert.equal(starts.length, 2)
  manager.dispose()
  assert.equal(starts[1].signal.aborted, true)
  assert.deepEqual(stops, ['dsh-pet', 'dsh-pet'])
})

test('PCM idle playback skips other speech, reserves synthesis, protects audio tails and scopes stop handles', async () => {
  await withBrowserPlayback(async state => withDuplexBrowser(async sockets => {
    const context = new Context()
    const settings = resolveTtsSettings({ provider: 'doubao', enabled: true })
    const service = new XiaomiMimoTtsPcmService(context, { getSnapshot: () => ({ status: 'ready', value: settings }) }, () => {})
    const activity = new SpeechActivity()
    const status = { value: 'loading' }
    const off = activity.register(() => isSpeechBusy(status.value))
    const playback = new AnnouncementPlayback(service, activity)
    const emit = text => playback.play({ source: 'dsh-pet', id: text, text })
    try {
      for (const busy of ['loading', 'playing', 'paused']) {
        status.value = busy
        emit(busy)
      }
      assert.equal(sockets.length, 0)
      status.value = 'idle'
      emit('第一句。')
      assert.equal(service.isBusy(), true)
      emit('合成中跳过。')
      await settle()
      assert.equal(sockets.length, 1)
      assert.equal(service.isBusy(), true)
      emit('尾段跳过。')
      await settle()
      assert.equal(sockets.length, 1)
      const sources = state.contexts.flatMap(context => context.sources)
      for (const source of sources) source.dispatchEvent(new Event('ended'))
      assert.equal(service.isBusy(), false)
      emit('第二句。')
      await settle()
      assert.equal(sockets.length, 2)
      service.play('主动播放。')
      await settle()
      playback.stop('dsh-pet')
      assert.equal(service.isBusy(), true, 'stale collector handle must not stop subsequent public playback')
      service.stop()
      emit('关闭前的播报。')
      assert.equal(service.isBusy(), true)
      playback.stop('dsh-pet')
      assert.equal(service.isBusy(), false)
      status.value = 'paused'
      assert.equal(activity.isBusy(), true)
      off()
      assert.equal(activity.isBusy(), false)
    } finally { await service.dispose() }
  }), { endPcm: false })
})

test('source settings normalize and save/reset without rewriting an unchanged list', async () => {
  const defaults = resolveTtsSettings().announcementSources
  assert.equal(defaults.includes('dsh-pet'), false)
  assert.equal(defaults.includes('dsh-whale-musume'), true)
  assert.equal(defaults.includes('question-titles'), true)
  assert.deepEqual(resolveTtsSettings({ announcementSources: ['unknown', 'dsh-pet', 'dsh-pet'] }).announcementSources, ['dsh-pet'])
  const writes = []
  let user = {}
  const scope = {
    getSnapshot: () => ({ value: user, user }),
    async mutate(ops) {
      for (const op of ops) {
        const field = op.path[0]
        if (op.op === 'set') { writes.push(['set', field, op.value]); user = { ...user, [field]: op.value } }
        else { writes.push(['unset', field]); delete user[field] }
      }
      return true
    },
  }
  const changes = { announcementSources: { kind: 'set' } }
  const draft = resolveTtsSettings({ announcementSources: ['dsh-pet'] })
  await saveSettingsDraft(scope, draft, changes, { xiaomi: '', doubao: '' })
  await saveSettingsDraft(scope, draft, changes, { xiaomi: '', doubao: '' })
  await saveSettingsDraft(scope, resolveTtsSettings(), { announcementSources: { kind: 'clear' } }, { xiaomi: '', doubao: '' })
  assert.deepEqual(writes, [['set', 'announcementSources', ['dsh-pet']], ['unset', 'announcementSources']])
})

test('failed synthesis releases the idle playback slot and a later announcement can retry', async () => {
  await withBrowserPlayback(async () => withDuplexBrowser(async sockets => {
    const ctx = new Context()
    ctx.logger.warn = () => {}
    const service = new XiaomiMimoTtsPcmService(ctx, { getSnapshot: () => ({ status: 'ready', value: resolveTtsSettings({ provider: 'doubao' }) }) }, () => {})
    try {
      assert.equal(typeof service.tryPlay('失败播报。', () => false), 'function')
      await settle()
      assert.equal(service.isBusy(), false)
      assert.equal(typeof service.tryPlay('再次播报。', () => false), 'function')
      await settle()
      assert.equal(sockets.length, 2)
      assert.equal(service.isBusy(), false)
    } finally { await service.dispose() }
  }, { handle(socket, command) {
    if (command.type !== 'start') return false
    socket.message({ type: 'error', error: 'request-failed' })
    return true
  } }))
})
