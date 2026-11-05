import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule, settle } from './helpers/client-modules.mjs'

const { withSidebarLoading } = await loadClientModule('src/client/settings/sidebar-loading.ts')

function browser(t, hidden = false) {
  class Element extends EventTarget {
    children = []
    attributes = new Map()
    open = false
    constructor(tag) { super(); this.tag = tag }
    setAttribute(name, value) { this.attributes.set(name, value) }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child) } }
    showModal() { this.open = true }
    close() { this.open = false }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this) }
  }
  const body = new Element('body')
  const globals = ['document', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { body, createElement: tag => new Element(tag) } })
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: hidden ? () => 0 : callback => setImmediate(callback) })
  Object.defineProperty(globalThis, 'cancelAnimationFrame', { configurable: true, value: hidden ? () => {} : id => clearImmediate(id) })
  t.after(() => {
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  return body
}

for (const mounted of [true, false]) test(`${mounted ? 'mount' : 'exit'} keeps a modal status through the operation and cleans it after navigation`, async t => {
  const body = browser(t)
  const page = document.createElement('section')
  body.append(page)
  let complete
  const pending = new Promise(resolve => { complete = resolve })
  let started = false
  const task = withSidebarLoading(mounted, key => key, async () => {
    started = true
    assert.equal(dialog.open, true)
    await pending
    page.remove()
    assert.equal(dialog.open, true, 'replacing the settings page must not remove the modal')
    return 'navigated'
  })
  const dialog = body.children.find(child => child.tag === 'dialog')
  assert.equal(dialog.open, true)
  const status = dialog.children[0]
  assert.equal(status.attributes.get('role'), 'status')
  assert.equal(status.attributes.get('aria-busy'), 'true')
  assert.equal(status.children[1].textContent, mounted ? 'settings.mountingSidebar' : 'settings.unmountingSidebar')
  const cancel = new Event('cancel', { cancelable: true })
  dialog.dispatchEvent(cancel)
  assert.equal(cancel.defaultPrevented, true, 'Escape must not dismiss an in-flight operation')
  await settle()
  await settle()
  assert.equal(started, true)
  complete()
  assert.equal(await task, 'navigated')
  assert.equal(dialog.open, false)
  assert.deepEqual(body.children, [])
})

test('failed saves release the modal and preserve the original failure and settings page', async t => {
  const body = browser(t)
  const page = document.createElement('section')
  body.append(page)
  const failure = Object.assign(new Error(), { code: 'host-rejected' })
  await assert.rejects(withSidebarLoading(true, key => key, async () => { throw failure }), error => error === failure)
  assert.deepEqual(body.children, [page])
})

test('hidden tabs finish and release the modal even when animation frames stop', async t => {
  const body = browser(t, true)
  assert.equal(await withSidebarLoading(false, key => key, async () => 'finished'), 'finished')
  assert.deepEqual(body.children, [])
})
