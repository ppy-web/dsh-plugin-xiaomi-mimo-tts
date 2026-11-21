import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadClientModule } from './helpers/client-modules.mjs'
import { resolveTtsSettings } from '../lib/shared.js'

const { ActivationGuide } = await loadClientModule('src/client/settings/activation-guide.tsx')
const { saveSettingsDraft } = await loadClientModule('src/client/settings/save-settings.ts')

function fixture(initial = {}) {
  let user = { ...initial }
  return {
    getSnapshot: () => ({ value: user, user }),
    subscribe: () => () => {},
    async mutate(ops) {
      for (const op of ops) {
        if (op.op === 'set') user[op.path[0]] = op.value
        else delete user[op.path[0]]
      }
      return true
    },
  }
}

test('feature guide defaults on and its preference saves and resets', async () => {
  const scope = fixture()
  const defaults = resolveTtsSettings(scope.getSnapshot().value)
  assert.equal(defaults.showFeatureGuide, true)
  await saveSettingsDraft(scope, { ...defaults, showFeatureGuide: false }, { showFeatureGuide: { kind: 'set' } }, { xiaomi: '', doubao: '', breeze: '' })
  assert.equal(resolveTtsSettings(scope.getSnapshot().value).showFeatureGuide, false)
  await saveSettingsDraft(scope, defaults, { showFeatureGuide: { kind: 'clear' } }, { xiaomi: '', doubao: '', breeze: '' })
  assert.equal(resolveTtsSettings(scope.getSnapshot().value).showFeatureGuide, true)
})

test('disabled preference suppresses automatic activation guide', () => {
  const scope = fixture({ showFeatureGuide: false })
  const html = renderToStaticMarkup(createElement(ActivationGuide, { scope, t: key => key, packageName: 'dsh-xiaomi-tts', onDismiss() {}, onOpenWorkbench() {} }))
  assert.equal(html, '')
})

test('activation guide renders multi-paragraph diary notes and optional star postscript', () => {
  const scope = fixture({ showFeatureGuide: true })
  const copy = {
    'onboarding.title': 'Whale Note',
    'onboarding.summary': 'Lead line',
    'onboarding.details': 'Diary region',
    'onboarding.diary': 'First observation.\n\nSecond observation.',
    'onboarding.starNote': 'Please star!',
  }
  const t = key => copy[key] ?? key
  const html = renderToStaticMarkup(createElement(ActivationGuide, { scope, t, packageName: 'dsh-xiaomi-tts', onDismiss() {}, onOpenWorkbench() {} }))
  assert.match(html, /<p>First observation\.<\/p><p>Second observation\.<\/p>/)
  assert.match(html, /Please star!/)

  const withoutStar = renderToStaticMarkup(createElement(ActivationGuide, {
    scope,
    t: key => (key === 'onboarding.starNote' ? '   ' : t(key)),
    packageName: 'dsh-xiaomi-tts',
    onDismiss() {},
    onOpenWorkbench() {},
  }))
  assert.doesNotMatch(withoutStar, /xmimo-tts-activation-note-ps/)
})
