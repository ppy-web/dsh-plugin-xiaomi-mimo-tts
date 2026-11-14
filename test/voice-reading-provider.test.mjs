import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TTS_PROVIDERS } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { VoiceReadingProvider } = await loadClientModule('src/client/settings/voice-reading-provider.tsx')
const { VoiceReadingSelect } = await loadClientModule('src/client/settings/voice-reading-select.tsx')
const { engineStateStore } = await loadClientModule('src/client/engine-state.ts')

function checkProviderSelection(provider) {
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
  }
  const groups = inputs.map(input => /name="([^"]+)"/.exec(input)?.[1])
  assert.ok(groups[0])
  assert.equal(new Set(groups).size, 1, 'arrow keys must move within one native radio group')
}

test('provider selector exposes one selected option in a native radio group', () => {
  for (const provider of TTS_PROVIDERS) checkProviderSelection(provider)
})

test('Breeze choice is hidden until enabled', () => {
  const html = renderToStaticMarkup(createElement(VoiceReadingProvider, {
    value: 'xiaomi', doubaoEnabled: true, breezeEnabled: false, disabled: false, t: key => key, onChange: () => {},
  }))
  assert.equal([...html.matchAll(/<input\b[^>]*>/g)].length, 2)
  assert.doesNotMatch(html, /value="breeze"/)
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

test('external takeover disables the built-in provider choices', () => {
  engineStateStore.accept({ provider: 'external:test', revision: 1, name: 'External', ready: true,
    formats: ['wav'], maxTextLength: 1000, streaming: false })
  try {
    const html = renderToStaticMarkup(createElement(VoiceReadingProvider, {
      value: 'xiaomi', doubaoEnabled: true, breezeEnabled: true, disabled: false,
      t: key => key === 'settings.externalTakeover' ? 'External takeover active' : key, onChange: () => {},
    }))
    assert.match(html, /<fieldset\b[^>]*disabled=""/)
    assert.equal([...html.matchAll(/<input\b[^>]*type="radio"/g)].length, 3)
    const descriptionId = /aria-describedby="([^"]+)"/.exec(html)?.[1]
    assert.ok(descriptionId)
    assert.ok(html.includes(`id="${descriptionId}"`))
    assert.ok(html.includes('External takeover active'))
  } finally {
    engineStateStore.accept({ provider: 'xiaomi', revision: 2, name: 'Xiaomi', ready: true,
      formats: ['wav'], maxTextLength: 1000, streaming: false })
  }
})

test('voice selector presents selected and fallback labels and respects read-only settings', () => {
  for (const [value, fallbackLabel, expected] of [
    ['warm', undefined, 'Warm voice'],
    ['custom-id', 'Custom voice', 'Custom voice'],
    ['custom-id', undefined, 'custom-id'],
  ]) {
    const html = renderToStaticMarkup(createElement(VoiceReadingSelect, {
      label: 'Voice', value, fallbackLabel, options: [{ id: 'warm', label: 'Warm voice' }],
      disabled: false, onSelect() {},
    }))
    const button = html.match(/<button\b[^>]*>/)?.[0]
    assert.ok(button)
    assert.match(button, /aria-label="Voice"/)
    assert.match(button, /aria-haspopup="menu"/)
    assert.match(button, /aria-expanded="false"/)
    assert.ok(html.includes(expected))
  }
  const readonly = renderToStaticMarkup(createElement(VoiceReadingSelect, {
    label: 'Voice', value: 'warm', options: [{ id: 'warm', label: 'Warm voice' }],
    disabled: true, onSelect() { assert.fail('read-only selector must not publish a selection') },
  }))
  assert.match(readonly.match(/<button\b[^>]*>/)?.[0] ?? '', /\bdisabled(?:\s|=|>)/)
})
