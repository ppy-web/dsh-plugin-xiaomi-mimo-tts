import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TTS_VOICE_DESIGN_PRESETS, TTS_VOICE_PRESETS } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const [{ BuiltInVoicePicker }, { VoiceDesignPresetPicker }, { VoiceAvatar }, { VoiceReadingSelect }] = await Promise.all([
  loadClientModule('src/client/settings/controls/built-in-voice-picker.tsx'),
  loadClientModule('src/client/settings/controls/voice-design-picker.tsx'),
  loadClientModule('src/client/settings/controls/voice-avatar.tsx'),
  loadClientModule('src/client/settings/voice-reading-select.tsx'),
])

function avatarUrl(component, props) {
  const html = renderToStaticMarkup(createElement(component, props))
  const src = html.match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1]
  assert.ok(src, 'the selected voice renders an image')
  const comma = src.indexOf(',')
  assert.match(src.slice(0, comma), /^data:image\/svg\+xml\b/)
  assert.match(decodeURIComponent(src.slice(comma + 1)), /<svg\b/)
  return src
}

const pickerProps = { label: 'Voice', disabled: false, onChange() {} }

test('each MiMo preset renders an avatar without a packaged image URL', () => {
  const builtIn = TTS_VOICE_PRESETS.map(preset => avatarUrl(BuiltInVoicePicker, { ...pickerProps, value: preset.value }))
  const designed = TTS_VOICE_DESIGN_PRESETS.map(preset => avatarUrl(VoiceDesignPresetPicker, {
    ...pickerProps, value: preset.prompt, customLabel: 'Custom', customSummary: 'Describe a voice',
  }))
  assert.ok(new Set(builtIn).size > 1, 'built-in IDs affect the generated avatars')
  assert.ok(new Set(designed).size > 1, 'voice design preset IDs affect the generated avatars')
})

test('the voice reading selector shows the same avatar for the saved ID after a rename', () => {
  const { value } = TTS_VOICE_PRESETS[0]
  const workbenchAvatar = avatarUrl(BuiltInVoicePicker, { ...pickerProps, value })
  const readingAvatar = avatarUrl(VoiceReadingSelect, {
    label: 'Voice', value, disabled: false, onSelect() {},
    options: [{
      id: value,
      label: 'Renamed voice',
      icon: createElement(VoiceAvatar, { voice: { provider: 'xiaomi', id: value }, label: 'Renamed voice', compact: true }),
    }],
  })
  assert.equal(readingAvatar, workbenchAvatar)
})
