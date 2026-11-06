import assert from 'node:assert/strict'
import test from 'node:test'
import { Context } from '@deepseek-ai/cordis'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { resolveTtsSettings } from '../lib/shared.js'

const { observeApprovals } = await loadClientModule('src/client/announcements/approvals.ts')
const { observeJobs } = await loadClientModule('src/client/announcements/jobs.ts')
const { hostCollector } = await loadClientModule('src/client/announcements/host-source.ts')
const { AnnouncementPlayback } = await loadClientModule('src/client/announcements/playback.ts')
const { SpeechActivity } = await loadClientModule('src/client/announcements/speech-activity.ts')
const t = key => key

function store(initial) {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    set(next) { value = next; for (const fn of [...listeners]) fn() }, listeners }
}
function sessions(id = 'main') {
  const list = store(null)
  const select = (id, phase = 'ready') => list.set({ phase, byId: id ? { [id]: { id, retainedBy: { mainView: 1 } } } : {} })
  select(id)
  return { list, select }
}
function options() {
  const controller = new AbortController(), events = []
  return { controller, events, signal: controller.signal, emit: event => events.push(event) }
}
const pending = (key, reason = '需要确认') => ({ key, kind: 'approval', sessionId: 'main', reason })
const status = interaction => new Map([['main', { pendingInteraction: interaction }]])

test('new notification sources are opt-in and normalize through existing settings', () => {
  assert.ok(!resolveTtsSettings().announcementSources.includes('approvals'))
  assert.ok(!resolveTtsSettings().announcementSources.includes('job-results'))
  assert.deepEqual(resolveTtsSettings({ announcementSources: ['approvals', 'job-results', 'approvals', 'unknown'] }).announcementSources,
    ['approvals', 'job-results'])
})

test('approval observation baselines, deduplicates request identity and cancels withdrawn or replaced requests', () => {
  const scope = sessions(), source = store(status(pending('old'))), run = options()
  const off = observeApprovals(scope, { sessionStatus: source }, t, run)
  assert.equal(run.events.length, 0)
  source.set(status(pending('new', '同样的原因')))
  source.set(status(pending('new', '同样的原因')))
  assert.equal(run.events.length, 1)
  source.set(status(pending('next', '同样的原因')))
  assert.equal(run.events[0].signal.aborted, true)
  assert.equal(run.events.length, 2)
  source.set(status(undefined))
  assert.equal(run.events[1].signal.aborted, true)
  source.set(status(pending('new')))
  assert.equal(run.events.length, 2, 'a reappearing request is not replayed')
  source.set(status({ key: 'question', kind: 'question' }))
  assert.equal(run.events.length, 2)
  off()
  assert.equal(source.listeners.size, 0)
  assert.equal(scope.list.listeners.size, 0)
})

test('approval observation scopes to the selected conversation and rebaselines on switch or reconnection', () => {
  const scope = sessions(), source = store(status(undefined)), run = options()
  const off = observeApprovals(scope, { sessionStatus: source }, t, run)
  source.set(new Map([['main', { pendingInteraction: pending('one') }], ['other', { pendingInteraction: pending('elsewhere') }]]))
  assert.equal(run.events.length, 1)
  scope.select('other')
  assert.equal(run.events[0].signal.aborted, true)
  assert.equal(run.events.length, 1)
  scope.select('main', 'pending')
  source.set(status(pending('offline')))
  scope.select('main')
  assert.equal(run.events.length, 1)
  source.set(status(pending('online')))
  assert.equal(run.events.length, 2)
  run.controller.abort()
  assert.equal(run.events[1].signal.aborted, true)
  source.set(status(pending('after-stop')))
  assert.equal(run.events.length, 2)
  off()
})

function jobs() {
  const state = store({ rows: {} }), watches = [], releases = []
  return { state, watches, releases, watchRows(id) { watches.push(id); return () => releases.push(id) },
    set(rows, id = 'main') { state.set({ rows: { [id]: rows } }) } }
}
const job = (id, state, owner = 'main') => ({ id, status: state, owner, label: '后台构建' })

test('jobs announce only observed live-to-terminal transitions and preserve cancellation semantics', () => {
  const scope = sessions(), source = jobs(), run = options()
  source.set([job('old', 'completed'), job('live', 'running')])
  const off = observeJobs(scope, source, t, run)
  source.set([job('old', 'completed'), job('live', 'completed'), job('fast-old', 'failed')])
  assert.equal(run.events.length, 1)
  source.set([job('live', 'completed'), job('failure', 'running'), job('cancel', 'stopping'), job('foreign', 'running', 'other'), job('global', 'running', undefined)])
  source.set([job('live', 'completed'), job('failure', 'failed'), job('cancel', 'killed'), job('foreign', 'failed', 'other'), { ...job('global', 'completed'), owner: undefined }])
  assert.deepEqual(run.events.map(event => event.text.split(': ')[1]),
    ['announcements.jobCompleted', 'announcements.jobFailed', 'announcements.jobKilled'])
  source.set(source.state.getSnapshot().rows.main)
  assert.equal(run.events.length, 3)
  source.set([])
  source.set([job('offline', 'completed')])
  assert.equal(run.events.length, 3, 'a roster reopened after disconnect only establishes a baseline')
  scope.select('other')
  assert.ok(run.events.every(event => event.signal.aborted))
  assert.deepEqual(source.watches, ['main', 'other'])
  off()
  assert.deepEqual(source.releases, ['main', 'other'])
  assert.equal(source.state.listeners.size, 0)
  assert.equal(scope.list.listeners.size, 0)
})

test('busy notifications are skipped permanently; request cancellation stops only its own playback', () => {
  let busy = true, plays = 0, generation = 0, stops = 0
  const activity = new SpeechActivity()
  activity.register(() => busy)
  const playback = new AnnouncementPlayback({ tryPlay(text, isBusy) {
    if (isBusy()) return null
    plays++; const current = ++generation
    return () => { if (current === generation) stops++ }
  } }, activity)
  const scope = sessions(), source = store(status(undefined)), run = options()
  run.emit = event => { run.events.push(event); playback.play(event) }
  const off = observeApprovals(scope, { sessionStatus: source }, t, run)
  source.set(status(pending('busy')))
  busy = false
  source.set(status(pending('busy')))
  assert.equal(plays, 0)
  source.set(status(pending('idle')))
  assert.equal(plays, 1)
  source.set(status(undefined))
  assert.equal(stops, 1)
  source.set(status(pending('second')))
  generation++ // A user starts unrelated speech.
  source.set(status(undefined))
  assert.equal(stops, 1)
  off()
})

test('priority routing interrupts for new approvals and failed jobs, while successful jobs stay quiet when busy', () => {
  const scope = sessions(), approvals = store(status(undefined)), background = jobs()
  const activity = new SpeechActivity()
  let busy = true, interruptions = 0, plays = 0
  const offActivity = activity.register(() => busy, () => { busy = false; interruptions++ })
  const playback = new AnnouncementPlayback({ tryPlay(_text, isBusy, interrupt) {
    if (isBusy() && interrupt === undefined) return null
    interrupt?.()
    plays++
    return () => {}
  } }, activity, undefined, () => true)
  const run = options()
  run.emit = playback.play
  const offJobs = observeJobs(scope, background, t, run)
  const offApprovals = observeApprovals(scope, { sessionStatus: approvals }, t, run)
  try {
    background.set([job('success', 'running')])
    background.set([job('success', 'completed')])
    assert.equal(plays, 0)
    assert.equal(interruptions, 0)
    background.set([job('failure', 'running')])
    background.set([job('failure', 'failed')])
    assert.equal(plays, 1)
    assert.equal(interruptions, 1)
    background.set([job('failure', 'failed')])
    assert.equal(plays, 1, 'a repeated failed snapshot must not produce another reminder')
    busy = true
    approvals.set(status(pending('new')))
    assert.equal(plays, 2)
    assert.equal(interruptions, 2)
    approvals.set(status(pending('new')))
    assert.equal(plays, 2)
  } finally { offApprovals(); offJobs(); offActivity(); run.controller.abort() }
})

test('optional service collectors wait without polling and dispose observers on service removal and abort', async () => {
  const ctx = new Context(), run = options(), mounts = [], cleanups = []
  ctx.provide('sessions', sessions())
  const collector = hostCollector(ctx, 'job-results', 'jobs', (_child, options) => {
    mounts.push(options.signal)
    return () => cleanups.push(true)
  })
  const done = collector.start(run)
  await settle()
  assert.equal(mounts.length, 0)
  const remove = ctx.provide('jobs', jobs())
  await settle()
  assert.equal(mounts.length, 1)
  remove()
  await settle()
  assert.equal(mounts[0].aborted, true)
  assert.equal(cleanups.length, 1)
  const removeAgain = ctx.provide('jobs', jobs())
  await settle()
  assert.equal(mounts.length, 2)
  run.controller.abort()
  await done
  assert.equal(mounts[1].aborted, true)
  assert.equal(cleanups.length, 2)
  removeAgain()
})

test('optional service collectors settle after synchronous or asynchronous disposal', async () => {
  for (const asynchronous of [false, true]) {
    const run = options()
    let disposals = 0, settled = false, finish
    const ctx = { inject() {
      return { dispose() {
        disposals++
        if (asynchronous) return new Promise(resolve => { finish = resolve })
      } }
    } }
    const collector = hostCollector(ctx, 'job-results', 'jobs', () => () => {})
    const done = collector.start(run).then(() => { settled = true })
    run.controller.abort()
    await settle()
    assert.equal(disposals, 1)
    assert.equal(settled, !asynchronous)
    finish?.()
    await done
    run.controller.abort()
    assert.equal(disposals, 1)
  }
})

test('optional service collectors can stop after their parent has already disposed the fiber', async () => {
  const ctx = new Context(), run = options(), cleanups = []
  ctx.provide('sessions', sessions())
  ctx.provide('jobs', jobs())
  const collector = hostCollector(ctx, 'job-results', 'jobs', (_child, options) => {
    return () => { assert.equal(options.signal.aborted, true); cleanups.push(true) }
  })
  const done = collector.start(run)
  await settle()
  await ctx.fiber.dispose()
  assert.equal(cleanups.length, 1)
  run.controller.abort()
  await done
  assert.equal(cleanups.length, 1)
})

test('optional service collectors report disposal failures through their start promise', async () => {
  for (const asynchronous of [false, true]) {
    const run = options(), failure = new Error('cleanup failed')
    const ctx = { inject() {
      return { dispose() {
        if (asynchronous) return Promise.reject(failure)
        throw failure
      } }
    } }
    const collector = hostCollector(ctx, 'job-results', 'jobs', () => () => {})
    const rejected = assert.rejects(collector.start(run), error => error === failure)
    run.controller.abort()
    await rejected
  }
})
