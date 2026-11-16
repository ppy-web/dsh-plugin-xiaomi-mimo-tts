import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import { PassThrough } from 'node:stream'
import { resolveTtsSettings, TTS_VOICE_DESIGN_PRESETS, TTS_VOICE_PRESETS } from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const [{ BuiltInVoicePicker }, { VoiceDesignPresetPicker }, { VoiceAvatar }, { VoiceReadingSelect }] = await Promise.all([
  loadClientModule('src/client/settings/controls/built-in-voice-picker.tsx'),
  loadClientModule('src/client/settings/controls/voice-design-picker.tsx'),
  loadClientModule('src/client/settings/controls/voice-avatar.tsx'),
  loadClientModule('src/client/settings/voice-reading-select.tsx'),
])

async function avatarUrl(component, props) {
  const html = await new Promise((resolve, reject) => {
    const output = new PassThrough()
    let text = ''
    output.setEncoding('utf8')
    output.on('data', chunk => { text += chunk })
    output.on('end', () => resolve(text))
    output.on('error', reject)
    const stream = renderToPipeableStream(createElement(component, props), {
      onAllReady() { stream.pipe(output) },
      onError: reject,
    })
  })
  const src = html.match(/<img\b[^>]*\bsrc="([^"]+)"/)?.[1]
  assert.ok(src, 'the selected voice renders an image')
  const comma = src.indexOf(',')
  assert.match(src.slice(0, comma), /^data:image\/svg\+xml\b/)
  assert.match(decodeURIComponent(src.slice(comma + 1)), /<svg\b/)
  return src
}

const pickerProps = { label: 'Voice', disabled: false, onChange() {} }

test('each MiMo preset renders an avatar without a packaged image URL', async () => {
  const builtIn = await Promise.all(TTS_VOICE_PRESETS.map(preset => avatarUrl(BuiltInVoicePicker, { ...pickerProps, value: preset.value })))
  const designed = await Promise.all(TTS_VOICE_DESIGN_PRESETS.map(preset => avatarUrl(VoiceDesignPresetPicker, {
    ...pickerProps, value: preset.prompt, customLabel: 'Custom', customSummary: 'Describe a voice',
  })))
  assert.ok(new Set(builtIn).size > 1, 'built-in IDs affect the generated avatars')
  assert.ok(new Set(designed).size > 1, 'voice design preset IDs affect the generated avatars')
})

test('the voice reading selector shows the same avatar for the saved ID after a rename', async () => {
  const { value } = TTS_VOICE_PRESETS[0]
  const workbenchAvatar = await avatarUrl(BuiltInVoicePicker, { ...pickerProps, value })
  const readingAvatar = await avatarUrl(VoiceReadingSelect, {
    label: 'Voice', value, disabled: false, onSelect() {},
    options: [{
      id: value,
      label: 'Renamed voice',
      icon: createElement(VoiceAvatar, { voice: { provider: 'xiaomi', id: value }, label: 'Renamed voice', compact: true }),
    }],
  })
  assert.equal(readingAvatar, workbenchAvatar)
})

test('avatar styles preserve the voice drawing and change its background', async () => {
  const voice = { provider: 'xiaomi', id: 'sample' }
  const styles = ['default', 'pastel', 'sunrise']
  const urls = await Promise.all(styles.map(avatarStyle => avatarUrl(VoiceAvatar, { voice, label: 'Sample', avatarStyle })))
  assert.equal(new Set(urls).size, styles.length)
  const svg = urls.map(url => decodeURIComponent(url.slice(url.indexOf(',') + 1)))
  const paths = value => [...value.matchAll(/<path\b[^>]*>/g)].map(match => match[0])
  for (const variant of svg.slice(1)) assert.deepEqual(paths(variant), paths(svg[0]))
  assert.match(svg[2], /linearGradient/)
})

test('a previously saved greyscale style falls back to the default', () => {
  assert.equal(resolveTtsSettings({ avatarStyle: 'greyscale' }).avatarStyle, 'default')
})
