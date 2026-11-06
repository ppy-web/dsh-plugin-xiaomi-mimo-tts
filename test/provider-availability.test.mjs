import assert from 'node:assert/strict'
import test from 'node:test'
import { Children, isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Switch } from './fixtures/plain-text.ts'
import { loadClientModule } from './helpers/client-modules.mjs'

const { ProviderSettings } = await loadClientModule('src/client/settings/provider-settings.tsx')

test('external takeover locks cloud configuration without locking local MOSS availability', () => {
  const controls = switches(ProviderSettings({
    t: key => key, writable: true, providerLocked: true, doubaoEnabled: true, breezeEnabled: true, mossEnabled: false,
    onMossEnabledChange() {}, onProviderEnabledChange() {},
  }))
  const local = controls.find(control => control.props.label === 'settings.mossProvider')
  assert.equal(local.props.disabled, false)
  for (const control of controls.filter(control => control !== local)) assert.equal(control.props.disabled, true)
})

function switches(node) {
  if (!isValidElement(node)) return []
  return node.type === Switch ? [node] : Children.toArray(node.props.children).flatMap(switches)
}

test('MOSS availability is independent from cloud providers and respects read-only settings', () => {
  for (const writable of [true, false]) {
    for (const enabled of [true, false]) {
      let next
      const controls = switches(ProviderSettings({
        t: key => key, writable, doubaoEnabled: true, breezeEnabled: false, mossEnabled: enabled,
        onMossEnabledChange: value => { next = value }, onProviderEnabledChange: () => {},
      }))
      const local = controls.find(control => control.props.label === 'settings.mossProvider')
      assert.ok(local)
      assert.equal(local.props.checked, enabled)
      assert.equal(local.props.disabled, !writable)
      if (writable) {
        local.props.onChange(!enabled)
        assert.equal(next, !enabled)
      }
    }
  }
})

for (const [doubaoEnabled, breezeEnabled] of [[true, false], [false, true], [true, true]]) {
  test(`provider switches protect the last optional provider: ${doubaoEnabled}/${breezeEnabled}`, () => {
    const calls = []
    const controls = switches(ProviderSettings({
      t: key => key, writable: true, doubaoEnabled, breezeEnabled, mossEnabled: false,
      onMossEnabledChange: enabled => calls.push({ provider: 'moss', enabled }),
      onProviderEnabledChange: (provider, enabled) => calls.push({ provider, enabled }),
    }))
    const byProvider = new Map()
    const fixed = []
    // Identify controls by the provider their public change callback updates.
    for (const control of controls) {
      const count = calls.length
      control.props.onChange(!control.props.checked)
      const change = calls[count]
      if (!change) {
        fixed.push(control)
        assert.equal(control.props.checked, true)
        assert.equal(control.props.disabled, true)
        continue
      }
      assert.equal(change.enabled, !control.props.checked)
      byProvider.set(change.provider, renderToStaticMarkup(control))
    }
    assert.ok(fixed.some(control => control.props.checked && control.props.disabled), 'a fixed enabled provider remains available')
    for (const [provider, checked, disabled] of [
      ['doubao', doubaoEnabled, doubaoEnabled && !breezeEnabled],
      ['breeze', breezeEnabled, breezeEnabled && !doubaoEnabled],
    ]) {
      const html = byProvider.get(provider)
      assert.ok(html, `an editable control must target ${provider}`)
      assert.equal(html.includes('checked=""'), checked)
      assert.equal(html.includes('disabled=""'), disabled)
    }
  })
}
