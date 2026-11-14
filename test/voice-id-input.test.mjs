import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOUBAO_VOICE_PRESETS } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const { VoiceIdInput } = await loadClientModule('src/client/settings/controls/voice-id-input.tsx')
const { writeVoiceIdHistory, writeVoiceIdNames } = await loadClientModule('src/client/settings/voice-id-history.ts')
const locales = await loadClientModule('src/client/localization.ts')

const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`, 'u'))?.[1]
const renderedInputs = html => [...html.matchAll(/<input\b([^>]*)>/gu)].map(([, tag]) => ({
  label: attribute(tag, 'aria-label'),
  value: attribute(tag, 'value'),
  disabled: /\bdisabled=""/u.test(tag),
}))
const renderedButtons = html => [...html.matchAll(/<button\b([^>]*)>/gu)].map(([, tag]) => ({
  label: attribute(tag, 'aria-label'),
  selected: /\baria-pressed="true"/u.test(tag),
  disabled: /\bdisabled=""/u.test(tag),
}))
const selectButtons = html => [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/gu)].map(([, tag, text]) => ({
  label: attribute(tag, 'aria-label'),
  text,
  selected: /\baria-pressed="true"/u.test(tag),
}))
const voiceField = html => renderedInputs(html).find(input => input.label === 'Voice ID')

function renderInput({ kind = 'standard', value, history = [value], names = {}, disabled = false, locale = 'zh' }) {
  const stored = new Map()
  const storage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) }
  writeVoiceIdHistory(kind, history, storage)
  writeVoiceIdNames(kind, names, storage)
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: storage } })
  try {
    return renderToStaticMarkup(createElement(VoiceIdInput, {
      kind, value, disabled, onChange: () => {}, label: 'Voice ID', historyLabel: 'Recent voices',
      t: key => {
        assert.equal(typeof locales[locale][key], 'string', `missing ${locale} translation: ${key}`)
        return locales[locale][key]
      },
    }))
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete globalThis.window
  }
}

test('voice history uses preset names only for standard IDs and respects saved labels', t => {
  const preset = DOUBAO_VOICE_PRESETS.find(voice => voice.value && voice.name)
  if (!preset) return t.skip('No built-in voice presets')
  const id = preset.value
  const html = renderInput({ value: ` ${id} `, history: [id, 'unknown-id'] })
  const named = selectButtons(html).find(button => button.text === preset.name)
  assert.ok(named, 'the preset name is shown for a recognized ID')
  assert.equal(named.selected, true)
  assert.ok(named.label.includes(id), 'the accessible name retains the synthesis ID')
  assert.equal(selectButtons(html).find(button => button.text === 'unknown-id').label, 'unknown-id')
  assert.equal(voiceField(html).value, ` ${id} `)

  const cloned = renderInput({ kind: 'cloned', value: id })
  const texts = selectButtons(cloned).map(button => button.text)
  assert.ok(texts.includes(id))
  assert.ok(!renderedButtons(cloned).some(button => (button.label ?? '').includes(preset.name)), 'standard names must not leak into cloned history')

  const custom = renderInput({ value: id, names: { [id]: 'My voice' } })
  const labelled = selectButtons(custom).find(button => button.text === 'My voice')
  assert.ok(labelled)
  assert.ok(labelled.label.includes(id))
  assert.equal(voiceField(custom).value, id)
})

test('saved voice remarks retain their IDs across voice types and languages', () => {
  for (const kind of ['standard', 'cloned']) for (const locale of ['zh', 'en', 'ja', 'fr']) {
    const html = renderInput({ kind, locale, value: 'custom-id', names: { 'custom-id': 'My voice' } })
    const named = selectButtons(html).find(button => button.text === 'My voice')
    assert.ok(named, `${kind}: ${locale}`)
    assert.equal(named.selected, true)
    assert.ok(named.label.includes('custom-id'))
    const labels = renderedButtons(html).map(button => button.label)
    assert.ok(labels.includes(`${locales[locale]['settings.voiceTagEdit']}: My voice`))
    assert.ok(labels.includes(`${locales[locale]['settings.voiceTagRemove']}: My voice`))
    assert.equal(voiceField(html).value, 'custom-id')
  }
})

test('read-only inputs disable voice selection and remark editing', () => {
  const html = renderInput({ kind: 'cloned', value: 'clone-id', names: { 'clone-id': 'My voice' }, disabled: true })
  assert.ok(renderedInputs(html).every(input => input.disabled))
  assert.ok(renderedButtons(html).every(button => button.disabled))
})

test('opening the control does not recreate a removed current voice', () => {
  const html = renderInput({ kind: 'cloned', value: 'removed-current', history: [] })
  assert.equal(voiceField(html).value, 'removed-current')
  assert.equal(selectButtons(html).length, 0)
  assert.ok(selectButtons(renderInput({ kind: 'cloned', value: 'constructor' })).some(button => button.text === 'constructor'))
})
