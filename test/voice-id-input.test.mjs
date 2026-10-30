import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'

const { VoiceIdInput } = await loadClientModule('src/client/settings/controls/voice-id-input.tsx')
const { writeVoiceIdHistory, writeVoiceIdNames } = await loadClientModule('src/client/settings/voice-id-history.ts')
const locales = await loadClientModule('src/client/localization.ts')

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

test('standard history displays a recognized voice name while retaining its ID and selection', () => {
  const id = 'zh_female_vv_uranus_bigtts'
  const html = renderInput({ value: ` ${id} `, history: [id, 'unknown-id'] })
  assert.match(html, /<button\b[^>]*aria-label="Vivi 2\.0 \(zh_female_vv_uranus_bigtts\)"[^>]*aria-pressed="true"[^>]*>Vivi 2\.0<\/button>/)
  assert.match(html, /<button\b[^>]*aria-label="unknown-id"[^>]*>unknown-id<\/button>/)
  assert.match(html, /<input\b[^>]*aria-label="Voice ID"[^>]*value=" zh_female_vv_uranus_bigtts "/)
})

for (const kind of ['standard', 'cloned']) for (const locale of ['zh', 'en', 'ja', 'fr']) test(`${locale} ${kind} labels display saved remarks and keep the original voice ID`, () => {
  const html = renderInput({ kind, locale, value: 'custom-id', names: { 'custom-id': 'My voice' } })
  assert.match(html, /<button\b[^>]*aria-label="My voice \(custom-id\)"[^>]*aria-pressed="true"[^>]*>My voice<\/button>/)
  assert.match(html, /<input\b[^>]*aria-label="Voice ID"[^>]*value="custom-id"/)
  assert.match(html, /<input\b[^>]*value="My voice"/)
})

test('cloned IDs do not inherit standard names and unlabelled IDs remain usable', () => {
  const id = 'zh_female_vv_uranus_bigtts'
  const html = renderInput({ kind: 'cloned', value: id, history: [id, 'constructor'] })
  assert.match(html, /<button\b[^>]*>zh_female_vv_uranus_bigtts<\/button>/)
  assert.match(html, /<button\b[^>]*>constructor<\/button>/)
})

test('read-only inputs disable voice selection and remark editing', () => {
  const html = renderInput({ kind: 'cloned', value: 'clone-id', names: { 'clone-id': 'My voice' }, disabled: true })
  assert.equal([...html.matchAll(/<input\b[^>]*>/g)].every(([input]) => input.includes('disabled=""')), true)
  assert.match(html, /<button\b[^>]*disabled=""/)
})
