import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { resolveTtsSettings } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { registerVoiceSettingsSidebar } = await loadClientModule('src/client/settings/sidebar-action.tsx')
const { SidebarSettings } = await loadClientModule('src/client/settings/sidebar-settings.tsx')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')
const t = key => key

function host(initial = {}) {
  let snapshot = { status: 'ready', value: resolveTtsSettings(initial) }
  const listeners = new Set()
  const entries = new Map()
  const events = []
  const opened = []
  const scope = { getSnapshot: () => snapshot, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) } }
  const page = { scope, t, controller: { play() {}, update() {} } }
  const ctx = {
    slots: { register(options, component) {
      const key = `${options.name}:${options.key ?? options.id}`
      assert.equal(entries.has(key), false, 'a registration must not replace itself')
      entries.set(key, { options, component })
      events.push(['register', options.name])
      return () => { assert.ok(entries.delete(key), 'each registration is removed once'); events.push(['remove', options.name]) }
    } },
    pluginNavigation: { openBundle: name => opened.push(name) },
  }
  const update = (value, status = 'ready') => {
    snapshot = { status, value: resolveTtsSettings(value) }
    for (const listener of listeners) listener()
  }
  return { scope, page, ctx, entries, listeners, events, opened, update }
}

test('saved shortcut opens a standalone settings page using the shared configuration and controls', () => {
  const h = host()
  const dispose = registerVoiceSettingsSidebar(h.ctx, h.page)
  assert.equal(h.entries.size, 1)
  // Speech can be disabled while the settings shortcut remains available.
  h.update({ showInSidebar: true, enabled: false })
  assert.deepEqual(h.events, [['register', 'main'], ['register', 'sidebar.panellist']])
  const rows = [...h.entries.values()]
  const panel = rows.find(entry => entry.options.name === 'main')
  const nav = rows.find(entry => entry.options.name === 'sidebar.panellist')
  assert.equal(nav.options.id, panel.options.key)
  assert.equal(nav.options.label(), t('settings.voiceSettingsNav'))
  const icon = renderToStaticMarkup(createElement(nav.component, { size: 18, active: false }))
  assert.ok(icon.includes('<svg'), 'the host receives a glyph for its native row')
  assert.equal(panel.options.inject().scope, h.scope)
  assert.equal(panel.options.inject().controller, h.page.controller)
  const html = renderToStaticMarkup(createElement(panel.component, panel.options.inject()))
  assert.ok(html.includes('<h1>settings.voiceSettingsNav</h1>'))
  assert.ok(html.includes('type="password"'), 'provider credentials remain editable on the standalone page')
  assert.deepEqual(h.opened, [], 'opening settings must not navigate to plugin management')
  panel.options.inject().onOpenPluginSettings()
  assert.deepEqual(h.opened, ['dsh-xiaomi-tts'], 'the explicit Plugin settings action opens this bundle')
  h.update({ showInSidebar: true, enabled: false })
  assert.equal(h.entries.size, 2)
  assert.equal(h.events.length, 2)
  h.update({ showInSidebar: false })
  assert.equal(h.entries.size, 1, 'hiding the shortcut must keep the current settings page mounted')
  assert.deepEqual(h.events.slice(2), [['remove', 'sidebar.panellist']])
  dispose()
  assert.equal(h.entries.size, 0)
  assert.equal(h.listeners.size, 0)
})

test('shortcut cleans up on unavailable settings, re-enables and disposes without duplicate registrations', () => {
  const h = host({ showInSidebar: true })
  const dispose = registerVoiceSettingsSidebar(h.ctx, h.page)
  h.update({ showInSidebar: true }, 'unavailable')
  assert.equal(h.entries.size, 1)
  h.update({ showInSidebar: true })
  assert.equal(h.entries.size, 2)
  dispose()
  dispose()
  assert.equal(h.entries.size, 0)
  assert.equal(h.listeners.size, 0)
})

test('the independent settings page opens its mixer by default', () => {
  const h = host({ enabled: true })
  const dispose = registerVoiceSettingsSidebar(h.ctx, h.page)
  try {
    const panel = [...h.entries.values()].find(entry => entry.options.name === 'main')
    const html = renderToStaticMarkup(createElement(panel.component, panel.options.inject()))
    const mixer = html.match(/<button\b[^>]*aria-label="settings.detailedVoiceConfig"[^>]*>/u)?.[0]
    assert.ok(mixer)
    assert.ok(mixer.includes('aria-expanded="true"'))
  } finally { dispose() }
})

test('failed navigation-row registration rolls back its destination and settings subscription', () => {
  const h = host({ showInSidebar: true })
  const register = h.ctx.slots.register
  h.ctx.slots.register = (options, component) => {
    if (options.name === 'sidebar.panellist') throw new Error('slot unavailable')
    return register(options, component)
  }
  assert.throws(() => registerVoiceSettingsSidebar(h.ctx, h.page), /slot unavailable/)
  assert.equal(h.entries.size, 0)
  assert.equal(h.listeners.size, 0)
})

test('independent shortcut control reflects saved state and read-only permissions', () => {
  for (const value of [false, true]) for (const writable of [false, true]) {
    const html = renderToStaticMarkup(createElement(SidebarSettings, { t, value, writable, overridden: false, onChange() {}, onReset() {} }))
    const control = html.match(/<input\b[^>]*role="switch"[^>]*>/u)?.[0]
    assert.ok(control)
    assert.ok(control.includes('aria-label="settings.showInSidebar"'))
    assert.equal(control.includes('checked=""'), value)
    assert.equal(control.includes('disabled=""'), !writable)
  }
})

test('shortcut setting saves separately, skips unchanged writes and restores the default', async () => {
  let value = resolveTtsSettings()
  const writes = []
  const scope = {
    getSnapshot: () => ({ value, user: value, writable: true }),
    async mutate(ops) {
      writes.push(ops)
      for (const op of ops) { if (op.op === 'set') value = { ...value, [op.path[0]]: op.value }; else delete value[op.path[0]] }
      return true
    },
  }
  const draft = { ...value, showInSidebar: true }
  const keys = { xiaomi: '', doubao: '', breeze: '' }
  await saveSettingsDraft(scope, draft, { showInSidebar: { kind: 'set' } }, keys)
  assert.deepEqual(writes, [[{ op: 'set', path: ['showInSidebar'], value: true }]])
  await saveSettingsDraft(scope, draft, { showInSidebar: { kind: 'set' } }, keys)
  assert.equal(writes.length, 1)
  await saveSettingsDraft(scope, resolveTtsSettings(), { showInSidebar: { kind: 'clear' } }, keys)
  assert.equal(resolveTtsSettings(value).showInSidebar, false)
})
