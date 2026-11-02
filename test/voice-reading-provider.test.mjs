import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TTS_PROVIDERS, TTS_PROVIDER_LOGO_ASSET_ROUTES } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { VoiceReadingProvider } = await loadClientModule('src/client/settings/voice-reading-provider.tsx')

for (const provider of TTS_PROVIDERS) test(`provider selector reflects ${provider} as the single selected provider`, () => {
  const html = renderToStaticMarkup(createElement(VoiceReadingProvider, {
    value: provider, doubaoEnabled: true, breezeEnabled: true, disabled: false, t: key => key, onChange: () => {},
  }))
  const inputs = [...html.matchAll(/<input\b[^>]*>/g)].map(match => match[0])
  assert.equal(inputs.length, TTS_PROVIDERS.length)
  assert.equal(inputs.filter(input => /\bchecked=""/.test(input)).length, 1)
  for (const value of TTS_PROVIDERS) {
    const input = inputs.find(input => input.includes(`value="${value}"`))
    assert.ok(input)
    assert.match(input, /type="radio"/)
    assert.equal(input.includes('checked=""'), value === provider)
    assert.ok(html.includes(TTS_PROVIDER_LOGO_ASSET_ROUTES[value]))
  }
  const groups = inputs.map(input => /name="([^"]+)"/.exec(input)?.[1])
  assert.ok(groups[0])
  assert.equal(new Set(groups).size, 1, 'arrow keys must move within one native radio group')
})

test('Breeze choice is hidden until enabled', () => {
  const html = renderToStaticMarkup(createElement(VoiceReadingProvider, {
    value: 'xiaomi', doubaoEnabled: true, breezeEnabled: false, disabled: false, t: key => key, onChange: () => {},
  }))
  assert.equal([...html.matchAll(/<input\b[^>]*>/g)].length, 2)
  assert.doesNotMatch(html, /value="breeze"/)
  assert.ok(html.includes(TTS_PROVIDER_LOGO_ASSET_ROUTES.xiaomi))
  assert.ok(html.includes(TTS_PROVIDER_LOGO_ASSET_ROUTES.doubao))
})

test('Doubao choice is hidden when disabled and Breeze is enabled', () => {
  const html = renderToStaticMarkup(createElement(VoiceReadingProvider, {
    value: 'breeze', doubaoEnabled: false, breezeEnabled: true, disabled: false, t: key => key, onChange: () => {},
  }))
  assert.match(html, /value="xiaomi"/)
  assert.match(html, /value="breeze"/)
  assert.doesNotMatch(html, /value="doubao"/)
})

test('provider choices are disabled together when settings are not writable', () => {
  const html = renderToStaticMarkup(createElement(VoiceReadingProvider, {
    value: 'xiaomi', disabled: true, t: key => key, onChange: () => {},
  }))
  assert.match(html, /<fieldset\b[^>]*disabled=""/)
})
