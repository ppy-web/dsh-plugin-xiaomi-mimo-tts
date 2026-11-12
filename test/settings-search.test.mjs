import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { searchSettings } = await loadClientModule('src/client/settings/settings-search.ts')
const { zh, en } = await loadClientModule('src/client/localization.ts')
const defaults = { provider: 'xiaomi', voiceDesign: false, doubaoClone: false, soundEnabled: true, mossEnabled: false, mossSelected: false }
const search = (query, dictionary = zh, options = {}) => searchSettings(query, key => dictionary[key], { ...defaults, ...options })

test('a query can match an alias, localized hint, or normalized name across collapsed sections', () => {
  const speed = search('倍速')
  assert.ok(speed.visible.has('voiceRate'))
  assert.ok(!speed.visible.has('voiceVolume'), 'unrelated controls stay hidden')
  assert.ok(search('音量').visible.has('soundVolume'))
  assert.ok(search('音量').visible.has('voiceVolume'))
  assert.ok(search('ＡＰＩ   ＫＥＹ', en).visible.has('apiKey'))
  assert.ok(search('待审批').visible.has('approvals'))
  assert.equal(search(' 　'), null, 'empty input restores the full settings page')
  assert.equal(search('no-such-setting').visible.size, 0)
})

test('an unavailable match points to the control that makes it editable', () => {
  const volume = search('音效音量', zh, { soundEnabled: false })
  assert.ok(volume.visible.has('soundEnabled'))
  assert.ok(!volume.visible.has('soundVolume'))
  assert.ok(volume.unavailable.some(item => item.id === 'soundVolume'))

  const moss = search('MOSS 服务地址')
  assert.ok(moss.visible.has('mossEnabled'))
  assert.ok(search('MOSS 服务地址', zh, { mossEnabled: true }).visible.has('localEngine'))
  assert.ok(search('MOSS 服务地址', zh, { mossEnabled: true, mossSelected: true }).visible.has('mossBaseURL'))
})

test('cloud search results follow the active provider and model', () => {
  const design = search('音色设计')
  assert.ok(design.visible.has('model'))
  assert.ok(!design.visible.has('voiceDesign'))
  assert.ok(search('音色设计', zh, { voiceDesign: true }).visible.has('voiceDesign'))
  assert.ok(!search('音色设计', zh, { provider: 'breeze' }).unavailable.some(item => item.id === 'voiceDesign'))
  assert.ok(search('模型选择', zh, { provider: 'breeze', externalName: 'External' }).visible.has('model'))
})
