import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement, isValidElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'

const { SpeechInstructionPicker } = await loadClientModule('src/client/settings/controls/speech-instruction-picker.tsx')
const locales = await loadClientModule('src/client/localization.ts')

function elements(node, type) {
  if (Array.isArray(node)) return node.flatMap(child => elements(child, type))
  if (!isValidElement(node)) return []
  return [...(node.type === type ? [node] : []), ...elements(node.props.children, type)]
}

function checkProviderInstructions(locale) {
  const t = key => {
    assert.equal(typeof locales[locale][key], 'string', `missing ${locale} translation: ${key}`)
    return locales[locale][key]
  }
  const selectedPrompts = []
  for (const provider of ['xiaomi', 'doubao']) {
    let value = 'my custom delivery'
    const props = { provider, value, disabled: false, t, onChange: next => { value = next } }
    const tree = SpeechInstructionPicker(props)
    const buttons = elements(tree, 'button')
    assert.ok(buttons.every(button => button.props['aria-pressed'] === false), 'custom text must not falsely select a preset')
    const argument = buttons.find(button => button.props.children === t('settings.speechInstructionArgument'))
    argument.props.onClick()
    selectedPrompts.push(value)
    const promptKey = provider === 'xiaomi' ? 'settings.mimoInstructionArgumentPrompt' : 'settings.speechInstructionArgumentPrompt'
    assert.equal(value, t(promptKey))
    const selected = elements(SpeechInstructionPicker({ ...props, value }), 'button').filter(button => button.props['aria-pressed'])
    assert.equal(selected.length, 1)
    assert.equal(selected[0].props.children, t('settings.speechInstructionArgument'))
    const textarea = elements(tree, 'textarea')[0]
    assert.equal(textarea.props.value, 'my custom delivery')
    textarea.props.onChange({ target: { value: 'new custom delivery' } })
    assert.equal(value, 'new custom delivery')
    buttons.find(button => button.props.children === t('settings.speechInstructionNatural')).props.onClick()
    assert.equal(value, '')
    const shanghai = buttons.some(button => button.props.children === t('settings.speechInstructionShanghai'))
    assert.equal(shanghai, provider === 'doubao', 'MiMo must only offer its own dialect recommendations')
  }
  assert.notEqual(selectedPrompts[0], selectedPrompts[1], 'providers must not share the same delivery prompt')
}

test('style selection uses each provider catalog and preserves custom input in every language', () => {
  for (const locale of ['zh', 'en', 'ja', 'fr']) checkProviderInstructions(locale)
})

test('compact and read-only style pickers retain provider-specific prompts and disable native controls', () => {
  for (const provider of ['xiaomi', 'doubao', 'breeze']) {
    const props = { provider, value: '', disabled: true, t: key => key, onChange: () => {} }
    const tree = SpeechInstructionPicker({ ...props, minimal: true })
    assert.equal(elements(tree, 'textarea')[0].props.disabled, true)
    assert.ok(elements(tree, 'button').every(button => button.props.disabled))
    const html = renderToStaticMarkup(createElement(SpeechInstructionPicker, props))
    assert.match(html, /<textarea\b[^>]*disabled=""/)
    assert.equal(elements(tree, 'button').filter(button => button.props['aria-pressed']).length, 1)
  }
})

function checkBreezeInstructions(locale) {
  const t = key => {
    assert.equal(typeof locales[locale][key], 'string', `missing ${locale} translation: ${key}`)
    return locales[locale][key]
  }
  for (const minimal of [false, true]) {
    let value = 'custom Breeze delivery'
    const props = { provider: 'breeze', value, minimal, disabled: false, t, onChange: next => { value = next } }
    const tree = SpeechInstructionPicker(props)
    const buttons = elements(tree, 'button')
    const textarea = elements(tree, 'textarea')[0]
    assert.equal(textarea.props.value, value)
    assert.equal(textarea.props.disabled, false)
    const warm = buttons.find(button => button.props.children === t('settings.breezeInstructionLabelWarmCompanion'))
    warm.props.onClick()
    assert.equal(value, t('settings.breezeInstructionTextWarmCompanion'))
    const selected = elements(SpeechInstructionPicker({ ...props, value }), 'button').filter(button => button.props['aria-pressed'])
    assert.equal(selected.length, 1)
    assert.equal(selected[0].props.children, t('settings.breezeInstructionLabelWarmCompanion'))
    buttons.find(button => button.props.children === t('settings.speechInstructionNatural')).props.onClick()
    assert.equal(value, '')
    textarea.props.onChange({ target: { value: 'edited Breeze instruction' } })
    assert.equal(value, 'edited Breeze instruction')
  }
}

test('Breeze presets replace and clear custom instructions in both display modes and every language', () => {
  for (const locale of ['zh', 'en', 'ja', 'fr']) checkBreezeInstructions(locale)
})
