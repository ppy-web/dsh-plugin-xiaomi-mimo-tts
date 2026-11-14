import assert from 'node:assert/strict'
import test from 'node:test'
import { Children, isValidElement } from 'react'
import { Switch } from './fixtures/plain-text.ts'
import { loadClientModule } from './helpers/client-modules.mjs'

const { ProviderSettings } = await loadClientModule('src/client/settings/provider-settings.tsx')

const externalSwitchProps = { acceptExternalProviders: true, onAcceptExternalProvidersChange() {} }

test('external takeover leaves its opt-out switch and local MOSS available', () => {
  const controls = switches(ProviderSettings({
    ...externalSwitchProps,
    t: key => key, writable: true, providerLocked: true, doubaoEnabled: true, breezeEnabled: true, mossEnabled: false,
    onMossEnabledChange() {}, onProviderEnabledChange() {},
  }))
  const local = controls.find(control => control.props.label === 'settings.mossProvider')
  const external = controls.find(control => control.props.label === 'settings.acceptExternalProviders')
  assert.equal(local.props.disabled, false)
  assert.equal(external.props.checked, true)
  assert.equal(external.props.disabled, false)
  for (const control of controls.filter(control => control !== local && control !== external)) assert.equal(control.props.disabled, true)
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
        ...externalSwitchProps,
        t: key => key, writable, doubaoEnabled: true, breezeEnabled: false, mossEnabled: enabled,
        onMossEnabledChange: value => { next = value }, onProviderEnabledChange: () => {},
      }))
      const local = controls.find(control => control.props.label === 'settings.mossProvider')
      assert.ok(local)
      assert.equal(local.props.checked, enabled)
      assert.equal(local.props.disabled, !writable)
      assert.equal(controls.find(control => control.props.label === 'settings.acceptExternalProviders').props.disabled, !writable)
      if (writable) {
        local.props.onChange(!enabled)
        assert.equal(next, !enabled)
      }
    }
  }
})

test('provider controls cap enabled cloud providers at three and keep the remaining optional provider on', () => {
  for (const optional of [
    { doubaoEnabled: true, breezeEnabled: false, deepseekEnabled: false },
    { doubaoEnabled: false, breezeEnabled: true, deepseekEnabled: false },
    { doubaoEnabled: false, breezeEnabled: false, deepseekEnabled: true },
    { doubaoEnabled: true, breezeEnabled: true, deepseekEnabled: false },
    { doubaoEnabled: true, breezeEnabled: false, deepseekEnabled: true },
    { doubaoEnabled: false, breezeEnabled: true, deepseekEnabled: true },
  ]) {
    const calls = []
    const controls = switches(ProviderSettings({
      ...externalSwitchProps,
      t: key => key, writable: true, ...optional, mossEnabled: false,
      onMossEnabledChange: () => {},
      onProviderEnabledChange: (provider, enabled) => calls.push({ provider, enabled }),
    }))
    const optionalCount = Object.values(optional).filter(Boolean).length
    assert.equal(controls.find(control => control.props.label === 'settings.acceptExternalProviders').props.disabled, false)
    assert.ok(controls.some(control => control.props.label === 'XiaoMi Mimo' && control.props.checked && control.props.disabled))
    const checks = new Map()
    for (const control of controls) {
      const count = calls.length
      control.props.onChange(!control.props.checked)
      const change = calls[count]
      if (change) checks.set(change.provider, control)
    }
    for (const [provider, field] of [['doubao', 'doubaoEnabled'], ['breeze', 'breezeEnabled'], ['deepseek', 'deepseekEnabled']]) {
      const control = checks.get(provider)
      assert.ok(control, `expected a switch for ${provider}`)
      assert.equal(control.props.checked, optional[field])
      assert.equal(control.props.disabled, optional[field] ? optionalCount === 1 : optionalCount === 2)
      assert.equal(calls.find(call => call.provider === provider).enabled, !optional[field])
    }
  }
})
