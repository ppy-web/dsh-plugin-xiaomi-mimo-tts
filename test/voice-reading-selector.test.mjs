import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'

const { VoiceReadingSelect } = await loadClientModule('src/client/settings/voice-reading-select.tsx')

for (const [value, fallbackLabel, expected] of [
  ['warm', undefined, 'Warm voice'],
  ['custom-id', 'Custom voice', 'Custom voice'],
  ['custom-id', undefined, 'custom-id'],
]) test(`voice selector displays the selected or fallback label for ${expected}`, () => {
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
})

test('read-only voice selector disables its native control', () => {
  const html = renderToStaticMarkup(createElement(VoiceReadingSelect, {
    label: 'Voice', value: 'warm', options: [{ id: 'warm', label: 'Warm voice' }],
    disabled: true, onSelect() { assert.fail('read-only selector must not publish a selection') },
  }))
  assert.match(html.match(/<button\b[^>]*>/)?.[0] ?? '', /\bdisabled(?:\s|=|>)/)
})
