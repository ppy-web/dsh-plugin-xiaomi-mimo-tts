import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule, settle } from './helpers/client-modules.mjs'

const { ComposerInputActivity } = await loadClientModule('src/client/composer-input-activity.ts')
const { AutomaticReading } = await loadClientModule('src/client/conversation/automatic-reading.ts')

function browser(t) {
  const observers = []
  const original = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver')
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'MutationObserver', original)
    else delete globalThis.MutationObserver
  })
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: class {
    connected = false
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe() { this.connected = true }
    disconnect() { this.connected = false }
  } })
  class Target extends EventTarget {
    listeners = new Map()
    addEventListener(type, listener) { this.listeners.set(type, listener); super.addEventListener(type, listener) }
    removeEventListener(type, listener) { this.listeners.delete(type); super.removeEventListener(type, listener) }
  }
  const document = new Target()
  document.defaultView = new Target()
  document.focused = true
  document.hasFocus = () => document.focused
  document.activeElement = null
  const editor = {
    textContent: '', isConnected: true, attributes: {},
    closest: () => editor,
    contains: node => node === editor || node.parentNode === editor,
    getAttribute: name => editor.attributes[name] ?? null,
  }
  const mutate = () => { for (const observer of observers) if (observer.connected) observer.callback([{ target: editor }]) }
  return { document, editor, observers, mutate }
}

test('only a focused, editable Host composer with a draft blocks automatic speech', async t => {
  const { document, editor, mutate } = browser(t)
  const activity = new ComposerInputActivity(document)
  const transitions = []
  const off = activity.subscribe(() => transitions.push(activity.getSnapshot()))
  activity.configure(true)
  document.activeElement = editor
  document.dispatchEvent(new Event('focusin'))
  await settle()
  assert.equal(activity.getSnapshot(), false)
  editor.textContent = '未发送的内容'
  document.dispatchEvent(new Event('input'))
  assert.equal(activity.getSnapshot(), true)
  editor.textContent += '，继续编辑'
  mutate()
  assert.deepEqual(transitions, [true], 'continued editing must not repeatedly stop playback')
  editor.textContent = ' \n '
  mutate()
  assert.equal(activity.getSnapshot(), false, 'sending or clearing the draft releases the gate')
  editor.textContent = '草稿'
  mutate()
  assert.equal(activity.getSnapshot(), true)
  document.activeElement = { closest: () => null }
  document.dispatchEvent(new Event('focusout'))
  await settle()
  assert.equal(activity.getSnapshot(), false, 'plugin settings and unrelated inputs must not hold the gate')
  off(); activity.dispose()
  assert.equal(document.listeners.size, 0)
  assert.equal(document.defaultView.listeners.size, 0)
})

test('enable during editing, disabled composers, window blur, removal and disposal release correctly', async t => {
  const { document, editor, observers, mutate } = browser(t)
  const activity = new ComposerInputActivity(document)
  document.activeElement = editor
  editor.textContent = '草稿'
  assert.equal(activity.getSnapshot(), false)
  activity.configure(true)
  assert.equal(activity.getSnapshot(), true)
  editor.attributes['aria-disabled'] = 'true'
  mutate()
  assert.equal(activity.getSnapshot(), false)
  delete editor.attributes['aria-disabled']
  mutate()
  assert.equal(activity.getSnapshot(), true)
  document.focused = false
  document.defaultView.dispatchEvent(new Event('blur'))
  assert.equal(activity.getSnapshot(), false)
  document.focused = true
  document.defaultView.dispatchEvent(new Event('focus'))
  assert.equal(activity.getSnapshot(), true)
  editor.isConnected = false
  document.activeElement = null
  mutate()
  assert.equal(activity.getSnapshot(), false, 'switching sessions must release a removed composer')
  editor.isConnected = true
  document.activeElement = editor
  document.dispatchEvent(new Event('focusin'))
  await settle()
  assert.equal(activity.getSnapshot(), true)
  document.dispatchEvent(new Event('focusout'))
  activity.configure(false)
  await settle()
  assert.equal(activity.getSnapshot(), false, 'queued focus callbacks must not re-enable avoidance')
  assert.ok(observers.every(observer => !observer.connected))
  activity.dispose()
})

test('composing stops automatic reading until the next turn and preserves explicit manual playback', () => {
  const reading = new AutomaticReading()
  let stops = 0
  reading.observe('session', true)
  reading.markAutomatic()
  reading.interruptAutomatic(() => stops++)
  assert.equal(stops, 1)
  assert.equal(reading.allowed('session'), false)
  reading.observe('session', false)
  assert.equal(reading.allowed('session'), false)
  reading.observe('session', true)
  assert.equal(reading.allowed('session'), true)
  reading.markManual()
  reading.interruptAutomatic(() => stops++)
  assert.equal(stops, 1, 'typing must not interrupt an explicitly requested reading')
})
