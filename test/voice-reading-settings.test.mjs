import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  BREEZE_VOICE_PRESETS,
  DOUBAO_VOICE_PRESETS,
  TTS_READ_SCOPES,
  TTS_VOICE_DESIGN_PRESETS,
  TTS_VOICE_PRESETS,
  resolveTtsSettings,
} from '../lib/shared.js'
import { loadClientModule } from './helpers/client-modules.mjs'

const {
  buildVoiceReadingVoiceSource,
  voiceReadingWarningKey,
  voiceChoiceWriteOps,
  autoPlayWriteOps,
  readScopeLabelKey,
  readScopeHintKey,
  readScopeWriteOps,
  soundWriteOps,
  volumeWriteOps,
  rateWriteOps,
  formatVoiceVolume,
  formatVoiceRate,
  VOICE_RATE_RANGE,
} = await loadClientModule('src/client/settings/voice-reading-options.ts')
const { zh, en } = await loadClientModule('src/client/localization.ts')
const { LensSlider } = await loadClientModule('src/client/settings/controls/lens-slider.tsx')
const { ReadScopeCards } = await loadClientModule('src/client/settings/controls/read-scope-cards.tsx')
const { centeredRangeScale } = await loadClientModule('src/client/settings/controls/use-settings-range.ts')

test('credential warnings remain visible with local speech enabled for either provider', () => {
  for (const provider of ['xiaomi', 'doubao']) {
    for (const localSpeechMode of ['auto', 'local-first', 'disabled']) {
      const settings = resolveTtsSettings({ provider, localSpeechMode })
      assert.equal(voiceReadingWarningKey(settings, 'missing'), 'settings.voiceReadingWarningApiKeyMissing')
      assert.equal(voiceReadingWarningKey(settings, 'unrecognized'), 'settings.voiceReadingWarningApiKeyInvalid')
    }
  }
})

test('credential checks distinguish pending, unavailable, and usable credentials', () => {
  const settings = resolveTtsSettings({})
  assert.equal(voiceReadingWarningKey(settings, 'loading'), null)
  assert.equal(voiceReadingWarningKey(settings, 'unavailable'), 'settings.voiceReadingWarningApiKeyUnavailable')
  assert.equal(voiceReadingWarningKey(settings, 'recognized'), null)
})

test('reading disabled and missing active voice settings produce actionable warnings', () => {
  assert.equal(voiceReadingWarningKey(resolveTtsSettings({ enabled: false }), 'recognized'), 'settings.voiceReadingWarningDisabled')
  for (const settings of [
    { provider: 'xiaomi', voice: ' ' },
    { provider: 'doubao', doubaoModel: 'seed-tts-2.0', doubaoVoice: '' },
    { provider: 'doubao', doubaoModel: 'seed-icl-2.0', doubaoClonedVoice: ' ' },
  ]) {
    assert.equal(voiceReadingWarningKey(resolveTtsSettings(settings), 'recognized'), 'settings.voiceReadingWarningVoiceRequired')
  }
})

test('only the active model needs a voice and fixing its configuration clears the warning', () => {
  const standard = resolveTtsSettings({ provider: 'doubao', doubaoClonedVoice: '' })
  assert.equal(voiceReadingWarningKey(standard, 'recognized'), null)
  const cloned = resolveTtsSettings({ provider: 'doubao', doubaoModel: 'seed-icl-2.0', doubaoVoice: '' })
  assert.equal(voiceReadingWarningKey(cloned, 'recognized'), 'settings.voiceReadingWarningVoiceRequired')
  assert.equal(voiceReadingWarningKey({ ...cloned, doubaoClonedVoice: 'saved-voice-id' }, 'recognized'), null)
})

/** Index write operations by their dotted path so order is not incidental. */
function operationsByPath(ops) {
  const mapped = new Map()
  for (const op of ops) mapped.set(op.path.join('.'), op)
  return mapped
}

/** Assert an exact set of `set` writes, independent of operation order. */
function assertSetOperations(ops, expected) {
  for (const op of ops) assert.equal(op.op, 'set')
  const mapped = operationsByPath(ops)
  assert.equal(mapped.size, ops.length, 'duplicate write paths in one mutation')
  assert.deepEqual([...mapped.keys()].sort(), Object.keys(expected).sort())
  for (const [path, value] of Object.entries(expected)) assert.deepEqual(mapped.get(path).value, value)
}

function sortedValues(choices) {
  return choices.map(choice => choice.value).sort()
}

for (const mode of [
  {
    name: 'xiaomi built-in voices',
    settings: {},
    field: 'voice',
    hintKey: 'settings.voiceReadingHintXiaomi',
    presetValues: TTS_VOICE_PRESETS.map(preset => preset.value),
  },
  {
    name: 'xiaomi voice design',
    settings: { model: 'mimo-v2.5-tts-voicedesign' },
    field: 'voiceDesignPrompt',
    hintKey: 'settings.voiceReadingHintVoiceDesign',
    presetValues: TTS_VOICE_DESIGN_PRESETS.map(preset => preset.prompt),
  },
  {
    name: 'doubao standard voices',
    settings: { provider: 'doubao' },
    field: 'doubaoVoice',
    hintKey: 'settings.voiceReadingHintDoubaoStandard',
    presetValues: DOUBAO_VOICE_PRESETS.map(preset => preset.value),
  },
  {
    name: 'doubao cloned voices',
    settings: { provider: 'doubao', doubaoModel: 'seed-icl-2.0', doubaoClonedVoice: 'clone-current' },
    field: 'doubaoClonedVoice',
    hintKey: 'settings.voiceReadingHintDoubaoCloned',
    presetValues: ['clone-current'],
  },
  {
    name: 'breeze voices',
    settings: { provider: 'breeze', breezeEnabled: true },
    field: 'breezeVoice',
    hintKey: 'settings.voiceReadingHintBreeze',
    presetValues: BREEZE_VOICE_PRESETS.map(preset => preset.value),
  },
]) test(`${mode.name} select the matching voice field and hint`, () => {
  const resolved = resolveTtsSettings(mode.settings)
  const source = buildVoiceReadingVoiceSource(resolved)
  assert.equal(source.field, mode.field)
  assert.equal(source.value, resolved[mode.field])
  assert.equal(source.hintKey, mode.hintKey)
  assert.deepEqual(sortedValues(source.choices), [...mode.presetValues].sort())
  for (const choice of source.choices) {
    assert.equal(typeof choice.value, 'string')
    assert.equal(typeof choice.label, 'string')
    assert.ok(choice.label.length > 0, 'choice labels must be non-empty')
  }
})

test('cloned voice source keeps the current id first, dedupes and drops blanks', () => {
  const resolved = resolveTtsSettings({
    provider: 'doubao',
    doubaoModel: 'seed-icl-2.0',
    doubaoClonedVoice: 'clone-a',
  })
  const source = buildVoiceReadingVoiceSource(resolved, ['clone-b', 'clone-a', ' ', 'clone-b', '', 'clone-c'])
  assert.equal(source.field, 'doubaoClonedVoice')
  assert.equal(source.value, 'clone-a')
  assert.deepEqual(source.choices.map(choice => choice.value), ['clone-a', 'clone-b', 'clone-c'])
})

test('cloned voice source tolerates missing history and a blank current id', () => {
  const current = resolveTtsSettings({ provider: 'doubao', doubaoModel: 'seed-icl-2.0', doubaoClonedVoice: 'only-current' })
  const source = buildVoiceReadingVoiceSource(current, undefined)
  assert.equal(source.value, 'only-current')
  assert.deepEqual(source.choices.map(choice => choice.value), ['only-current'])

  const blank = buildVoiceReadingVoiceSource(
    resolveTtsSettings({ provider: 'doubao', doubaoModel: 'seed-icl-2.0', doubaoClonedVoice: '' }),
    ['', ' ', 'from-history'],
  )
  assert.equal(blank.value, '')
  assert.deepEqual(blank.choices.map(choice => choice.value), ['from-history'])
})

for (const mode of [
  {
    name: 'xiaomi',
    settings: {},
    field: 'voice',
    expectedPaths: ['voice'],
  },
  {
    name: 'voice design',
    settings: { model: 'mimo-v2.5-tts-voicedesign' },
    field: 'voiceDesignPrompt',
    expectedPaths: ['voiceDesignPrompt', 'voiceDesignCustomPrompt'],
  },
  {
    name: 'doubao standard',
    settings: { provider: 'doubao' },
    field: 'doubaoVoice',
    expectedPaths: ['doubaoVoice'],
  },
  {
    name: 'doubao cloned',
    settings: { provider: 'doubao', doubaoModel: 'seed-icl-2.0' },
    field: 'doubaoClonedVoice',
    selected: 'new-clone-id',
    expectedPaths: ['doubaoClonedVoice'],
  },
]) test(`${mode.name} voice selection writes ${mode.expectedPaths.join(' + ')} with no duplicates`, () => {
  const source = buildVoiceReadingVoiceSource(resolveTtsSettings(mode.settings))
  assert.equal(source.field, mode.field)
  // Pick any preset other than the current value so the test never depends on catalog order.
  const selected = mode.selected ?? source.choices.map(choice => choice.value).find(value => value !== source.value)
  assert.ok(selected, `${mode.name} needs at least one selectable preset`)
  const ops = voiceChoiceWriteOps(source, selected)
  for (const op of ops) {
    assert.equal(op.op, 'set')
    assert.equal(op.value, selected)
  }
  const paths = ops.map(op => op.path.join('.'))
  assert.equal(new Set(paths).size, paths.length, 'duplicate write paths')
  assert.deepEqual(paths.sort(), [...mode.expectedPaths].sort())
})

test('turning automatic playback off writes only autoPlay false', () => {
  assert.deepEqual(autoPlayWriteOps(false, resolveTtsSettings({})), [
    { op: 'set', path: ['autoPlay'], value: false },
  ])
})

test('turning automatic playback on keeps an already enabled voice reading setting', () => {
  const ops = autoPlayWriteOps(true, resolveTtsSettings({ enabled: true }))
  assert.deepEqual(ops, [{ op: 'set', path: ['autoPlay'], value: true }])
})

test('turning automatic playback on also enables a disabled voice reading setting', () => {
  const ops = autoPlayWriteOps(true, resolveTtsSettings({ enabled: false }))
  assertSetOperations(ops, { autoPlay: true, enabled: true })
})

test('turning sound effects off writes only soundEnabled false', () => {
  const current = resolveTtsSettings({ soundEnabled: true, taskSounds: true, clickSounds: true })
  assert.deepEqual(soundWriteOps(false, current), [
    { op: 'set', path: ['soundEnabled'], value: false },
  ])
})

test('turning sound effects on from fully disabled enables both sound scopes', () => {
  const ops = soundWriteOps(true, resolveTtsSettings({}))
  assertSetOperations(ops, { soundEnabled: true, taskSounds: true, clickSounds: true })
})

test('turning sound effects on preserves an existing narrow or full scope', () => {
  for (const current of [
    { soundEnabled: false, taskSounds: false, clickSounds: true },
    { soundEnabled: false, taskSounds: true, clickSounds: false },
    { soundEnabled: false, taskSounds: true, clickSounds: true },
  ]) {
    assertSetOperations(soundWriteOps(true, resolveTtsSettings(current)), { soundEnabled: true })
  }
})

test('resolved settings always yield a voice change that satisfies the write contract', () => {
  const inputs = [
    {},
    { provider: 'doubao' },
    { provider: 'doubao', doubaoModel: 'seed-icl-2.0' },
    { model: 'mimo-v2.5-tts-voicedesign' },
  ]
  for (const input of inputs) {
    const resolved = resolveTtsSettings(input)
    const source = buildVoiceReadingVoiceSource(resolved)
    assert.ok(Array.isArray(source.choices))
    assert.equal(source.value, resolved[source.field], `source value must mirror ${source.field}`)
    const ops = voiceChoiceWriteOps(source, source.value)
    assert.ok(ops.length > 0)
    for (const op of ops) {
      assert.equal(op.op, 'set')
      assert.ok(Array.isArray(op.path) && op.path.length > 0, 'write path must be non-empty')
    }
    const paths = ops.map(op => op.path.join('.'))
    assert.equal(new Set(paths).size, paths.length, 'duplicate write paths')
  }
})

test('every read scope maps to a distinct localized label and hint in both locales', () => {
  const labels = TTS_READ_SCOPES.map(scope => readScopeLabelKey(scope))
  const hints = TTS_READ_SCOPES.map(scope => readScopeHintKey(scope))
  assert.equal(new Set(labels).size, labels.length, 'read scope labels must be distinct')
  assert.equal(new Set(hints).size, hints.length, 'read scope hints must be distinct')
  for (const key of [...labels, ...hints]) {
    assert.equal(typeof zh[key], 'string', `missing zh copy for ${key}`)
    assert.ok(zh[key].length > 0, `empty zh copy for ${key}`)
    assert.equal(typeof en[key], 'string', `missing en copy for ${key}`)
    assert.ok(en[key].length > 0, `empty en copy for ${key}`)
  }
})

for (const scope of TTS_READ_SCOPES) test(`selecting the ${scope} read scope writes only readScope`, () => {
  assert.deepEqual(readScopeWriteOps(scope), [{ op: 'set', path: ['readScope'], value: scope }])
})

test('only the selected scope has a description, outside the clickable card labels', () => {
  for (const value of TTS_READ_SCOPES) {
    const html = renderToStaticMarkup(createElement(ReadScopeCards, { value, t: key => key, onChange() {} }))
    const labels = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gu)].map(match => match[0])
    const described = labels.filter(label => label.includes('aria-describedby='))
    assert.equal(described.length, 1)
    assert.match(described[0], /\bchecked=""/u)
    for (const scope of TTS_READ_SCOPES) {
      const hint = readScopeHintKey(scope)
      assert.ok(labels.every(label => !label.includes(hint)))
      assert.equal(html.includes(hint), scope === value)
    }
  }
})

test('slider values use volume percentages and playback multipliers', () => {
  assert.equal(formatVoiceVolume(0.55), '55%')
  assert.equal(formatVoiceRate(1.7), '1.7×')
})

test('the native sliders expose off-menu values and the full supported ranges to assistive tools', () => {
  for (const [props, expected] of [
    [{ value: 0.57, formatValue: formatVoiceVolume }, { min: '0', max: '1', step: '0.01', value: '0.57', 'aria-valuetext': '57%' }],
    [{ value: 1.9, formatValue: formatVoiceRate, ...VOICE_RATE_RANGE }, { 'aria-valuemin': '0.5', 'aria-valuemax': '2', 'aria-valuenow': '1.9', 'aria-valuetext': '1.9×' }],
  ]) {
    const html = renderToStaticMarkup(createElement(LensSlider, { ...props, label: 'Playback', onChange() {} }))
    const range = html.match(/<input\b[^>]*\btype="range"[^>]*>/u)?.[0]
    assert.ok(range)
    const attributes = Object.fromEntries([...range.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, key, value]) => [key, value]))
    for (const [key, value] of Object.entries(expected)) assert.equal(attributes[key], value)
  }
})

test('the speed slider centers normal playback and preserves every supported speed', () => {
  const { min, max, step, center } = VOICE_RATE_RANGE
  const scale = centeredRangeScale(min, max, step, center)
  assert.equal(scale.value(0), 0.5)
  assert.equal(scale.value(0.5), 1)
  assert.equal(scale.value(1), 2)
  assert.equal(scale.position(1), 0.5)
  assert.equal(scale.value(0.24), 0.7)
  assert.equal(scale.value(0.76), 1.5)
  for (let tenths = 5; tenths <= 20; tenths++) {
    const rate = tenths / 10
    assert.equal(scale.value(scale.position(rate)), rate)
  }
})

test('volume and speed writes preserve arbitrary slider steps and their own fields', () => {
  assert.deepEqual(volumeWriteOps(0.57), [{ op: 'set', path: ['voiceVolume'], value: 0.57 }])
  assert.deepEqual(volumeWriteOps(0), [{ op: 'set', path: ['voiceVolume'], value: 0 }])
  assert.deepEqual(rateWriteOps(1.7), [{ op: 'set', path: ['voiceRate'], value: 1.7 }])
  assert.deepEqual(rateWriteOps(0.5), [{ op: 'set', path: ['voiceRate'], value: 0.5 }])
  assert.deepEqual(rateWriteOps(2), [{ op: 'set', path: ['voiceRate'], value: 2 }])
})

for (const [kind, settings, field] of [
  ['standard', { provider: 'doubao', doubaoVoice: 'custom-standard' }, 'doubaoVoice'],
  ['cloned', { provider: 'doubao', doubaoModel: 'seed-icl-2.0', doubaoClonedVoice: 'custom-cloned' }, 'doubaoClonedVoice'],
  ['breeze', { provider: 'breeze', breezeEnabled: true, breezeVoice: 'custom-breeze' }, 'breezeVoice'],
]) test(`${kind} remarks label custom choices without changing saved synthesis IDs`, () => {
  const id = settings[field]
  const resolved = resolveTtsSettings(settings)
  const source = buildVoiceReadingVoiceSource(resolved, [], { [kind]: { history: [id, id, 'other'], names: { [id]: '我的声音' } } })
  assert.equal(source.choices.filter(choice => choice.value === id).length, 1)
  assert.equal(source.choices.find(choice => choice.value === id).label, '我的声音')
  assertSetOperations(voiceChoiceWriteOps(source, id), { [field]: id })
  const removed = buildVoiceReadingVoiceSource(resolved, [], { [kind]: { history: [], names: {} } })
  assert.equal(removed.choices.find(choice => choice.value === id).label, id)
  assert.equal(removed.choices.some(choice => choice.value === 'other'), false)
})
