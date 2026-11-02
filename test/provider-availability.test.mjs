import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'

const { ProviderSettings } = await loadClientModule('src/client/settings/provider-settings.tsx')

for (const [doubaoEnabled, breezeEnabled] of [[true, false], [false, true], [true, true]]) {
  test(`provider switches protect the last optional provider: ${doubaoEnabled}/${breezeEnabled}`, () => {
    const html = renderToStaticMarkup(createElement(ProviderSettings, {
      t: key => key, writable: true, doubaoEnabled, breezeEnabled, onProviderEnabledChange: () => {},
    }))
    const switches = [...html.matchAll(/<input\b[^>]*role="switch"[^>]*>/g)].map(match => match[0])
    assert.equal(switches.length, 3)
    const get = label => switches.find(value => value.includes(`aria-label="${label}"`))
    assert.match(get('settings.providerXiaomi'), /checked=""/)
    assert.match(get('settings.providerXiaomi'), /disabled=""/)
    assert.equal(get('settings.providerDoubao').includes('checked=""'), doubaoEnabled)
    assert.equal(get('settings.breezeEnabled').includes('checked=""'), breezeEnabled)
    assert.equal(get('settings.providerDoubao').includes('disabled=""'), doubaoEnabled && !breezeEnabled)
    assert.equal(get('settings.breezeEnabled').includes('disabled=""'), breezeEnabled && !doubaoEnabled)
  })
}
