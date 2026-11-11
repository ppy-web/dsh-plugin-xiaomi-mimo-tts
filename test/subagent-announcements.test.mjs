import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule, settle } from './helpers/client-modules.mjs'
import { resolveTtsSettings } from '../lib/shared.js'

const { observeSubagents } = await loadClientModule('src/client/announcements/subagents.ts')
const { AnnouncementManager } = await loadClientModule('src/client/announcements/manager.ts')
const { AnnouncementSettings } = await loadClientModule('src/client/settings/announcement-settings.tsx')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const { en } = await loadClientModule('src/client/localization.ts')
const t = key => en[key]

function fixture() {
  const listeners = new Set(), events = [], controller = new AbortController()
  let snapshot = { phase: 'ready', byId: {} }
  const sessions = { list: { getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) } } }
  const set = (rows, phase = 'ready') => {
    snapshot = { phase, byId: Object.fromEntries(rows.map(row => [row.id, row])) }
    for (const fn of [...listeners]) fn()
  }
  const root = (id = 'main', selected = true, catalog = []) => ({ id, running: false,
    retainedBy: selected ? { mainView: 1 } : {}, projectionValues: { subagentCatalog: catalog } })
  const child = (id, parentId, running, timing, catalog = []) => ({ id, parentId, origin: 'subagent', running,
    retainedBy: {}, projectionValues: { subagentTiming: timing, subagentCatalog: catalog } })
  const start = () => observeSubagents(sessions, t, { signal: controller.signal, emit: event => events.push(event) })
  return { sessions, set, root, child, start, controller, events, listeners }
}
const active = (since, settledMs = 0) => ({ settledMs, active: { since, through: since + 1 } })
const closed = (settledMs, lastTurnCompleted = true) => ({ settledMs, lastTurnCompleted })
const entry = (id, name = id, label = '') => ({ id, mode: 'continuable', name, label })

test('named and nested subagents announce observed results once, with ancestry and no historic replay', () => {
  const f = fixture()
  const main = f.root('main', true, [entry('research', 'researcher', '查资料')])
  const research = f.child('research', 'main', true, active(100), [entry('test', 'tester')])
  const testRow = f.child('test', 'research', true, active(110))
  const historic = f.child('old', 'main', false, closed(500))
  const foreign = f.child('foreign', 'elsewhere', true, active(100))
  f.set([main, research, testRow, historic, foreign])
  const off = f.start()
  try {
    assert.equal(f.events.length, 0)
    f.set([main, research, f.child('test', 'research', false, closed(30)), historic, foreign])
    assert.equal(f.events.length, 1)
    assert.match(f.events[0].text, /researcher.*查资料.*tester/)
    assert.ok(f.events[0].text.endsWith(t('announcements.subagentCompleted')))
    f.set([main, f.child('research', 'main', false, closed(50, false)), f.child('test', 'research', false, closed(30)), historic,
      f.child('foreign', 'elsewhere', false, closed(20))])
    assert.equal(f.events.length, 2)
    assert.ok(f.events[1].text.endsWith(t('announcements.subagentStopped')))
    f.set(Object.values(f.sessions.list.getSnapshot().byId))
    assert.equal(f.events.length, 2)
  } finally { off() }
  assert.equal(f.listeners.size, 0)
  assert.ok(f.events.every(event => event.signal.aborted))
})

test('late result projections wait for new evidence and resumable children can announce each new run', () => {
  const f = fixture(), main = f.root('main', true, [entry('worker')])
  f.set([main, f.child('worker', 'main', false, closed(10))])
  const off = f.start()
  try {
    f.set([main, f.child('worker', 'main', true, closed(10))])
    f.set([main, f.child('worker', 'main', false, closed(10))])
    assert.equal(f.events.length, 0, 'running=false must not replay a stale closed projection')
    f.set([main, f.child('worker', 'main', false, closed(20))])
    assert.equal(f.events.length, 1)
    f.set([main, f.child('worker', 'main', true, active(200, 20))])
    f.set([main, f.child('worker', 'main', false, closed(20))])
    assert.equal(f.events.length, 2, 'a zero-duration run still has a distinct observed active interval')
    assert.notEqual(f.events[0].id, f.events[1].id)
  } finally { off() }
})

test('switching, reconnecting, absent projections and stopping observation cancel without backfilling results', () => {
  const f = fixture(), main = f.root('main', true, [entry('worker')])
  f.set([main, f.child('worker', 'main', true, active(100))])
  const off = f.start()
  f.set([main, f.child('worker', 'main', false, closed(30))])
  assert.equal(f.events.length, 1)
  f.set([f.root('other'), f.child('worker', 'main', false, closed(30))])
  assert.equal(f.events[0].signal.aborted, true)
  f.set([main, f.child('worker', 'main', false, closed(30))], 'pending')
  f.set([main, f.child('worker', 'main', false, closed(30))])
  f.set([main, f.child('missing', 'main', true, undefined)])
  f.set([main, f.child('missing', 'main', false, undefined)])
  assert.equal(f.events.length, 1)
  f.controller.abort()
  f.set([main, f.child('missing', 'main', false, closed(80))])
  assert.equal(f.events.length, 1)
  off()
  assert.equal(f.listeners.size, 0)
})

test('the new source is off by default and turning it off releases its subscription and playback', async () => {
  assert.ok(!resolveTtsSettings().announcementSources.includes('subagent-results'))
  const f = fixture(), stopped = []
  const manager = new AnnouncementManager([{ id: 'subagent-results', start: options => new Promise(resolve => {
    const off = observeSubagents(f.sessions, t, options)
    options.signal.addEventListener('abort', () => { off(); resolve() }, { once: true })
  }) }], event => f.events.push(event), source => stopped.push(source))
  manager.update(['subagent-results'], true)
  assert.equal(f.listeners.size, 1)
  manager.update([], true)
  await settle()
  assert.equal(f.listeners.size, 0)
  assert.deepEqual(stopped, ['subagent-results'])
  manager.dispose()
})

test('subagent source is an accessible switch under announcement sources, enabled only when selected and writable', context => {
  const report = console.error
  context.mock.method(console, 'error', (...args) => {
    // These controls ship only in the browser; the semantic SSR probe has no layout phase.
    if (typeof args[0] === 'string' && args[0].startsWith('Warning: useLayoutEffect does nothing on the server')) return
    report(...args)
  })
  for (const selected of [false, true]) for (const writable of [false, true]) {
    const html = renderToStaticMarkup(createElement(AnnouncementSettings, {
      t, sources: selected ? ['subagent-results'] : [], writable, overridden: false,
      onChange() {}, onReset() {},
    }))
    const input = html.match(/<input\b[^>]*>/g)?.find(control => control.includes(`aria-label="${t('settings.announcementsSubagents')}"`))
    assert.ok(input)
    assert.equal(input.includes('checked=""'), selected)
    assert.equal(input.includes('disabled=""'), !writable)
  }
})

test('subagent source persists with other choices and resetting preserves unrelated settings', async () => {
  let user = { announcementSources: ['approvals'], voiceRate: 1.2 }
  const scope = { getSnapshot: () => ({ value: user, user }), async mutate(ops) {
    for (const operation of ops) {
      if (operation.op === 'set') user[operation.path[0]] = operation.value
      else delete user[operation.path[0]]
    }
    return true
  } }
  const draft = resolveTtsSettings({ ...user, announcementSources: ['approvals', 'subagent-results'] })
  await saveSettingsDraft(scope, draft, { announcementSources: { kind: 'set' } }, { xiaomi: '', doubao: '', breeze: '' })
  assert.deepEqual(user.announcementSources, ['approvals', 'subagent-results'])
  await saveSettingsDraft(scope, resolveTtsSettings(), { announcementSources: { kind: 'clear' } }, { xiaomi: '', doubao: '', breeze: '' })
  assert.ok(!resolveTtsSettings(user).announcementSources.includes('subagent-results'))
  assert.equal(user.voiceRate, 1.2)
})
