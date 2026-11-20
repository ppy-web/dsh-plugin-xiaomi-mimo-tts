import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const { EMPTY_DRAFT, editDraft, draftFieldDirty, pruneDraftEdits } = await loadClientModule('src/client/settings/draft.ts')

/** Baseline where the Host accepts `accepted` and the user layer owns `overridden`. */
function baseline(accepted = {}, overridden = []) {
  return { accepted: field => accepted[field], overridden: field => overridden.includes(field) }
}

test('an edit equal to the accepted value never becomes a pending change', () => {
  const base = baseline({ voiceVolume: 0.8, provider: 'xiaomi' })
  assert.deepEqual(editDraft(EMPTY_DRAFT, { voiceVolume: 0.8 }, 'set', base).changes, {})
  assert.deepEqual(editDraft(EMPTY_DRAFT, { voiceVolume: 0.5 }, 'set', base).changes, { voiceVolume: { kind: 'set' } })
  const edits = editDraft(EMPTY_DRAFT, { voiceVolume: 0.5 }, 'set', base)
  assert.deepEqual(editDraft(edits, { voiceVolume: 0.8 }, 'set', base).values, {})
})

test('array settings compare by content, so an order-preserving revert is not a change', () => {
  const base = baseline({ announcementSources: ['question-titles', 'approvals'] })
  assert.deepEqual(editDraft(EMPTY_DRAFT, { announcementSources: ['question-titles', 'approvals'] }, 'set', base).changes, {})
  assert.deepEqual(editDraft(EMPTY_DRAFT, { announcementSources: ['approvals'] }, 'set', base).changes,
    { announcementSources: { kind: 'set' } })
})

test('resetting a field records a clear only while the user layer overrides it', () => {
  const override = baseline({ voiceVolume: 0.8 }, ['voiceVolume'])
  assert.deepEqual(editDraft(EMPTY_DRAFT, { voiceVolume: 0.8 }, 'clear', override).changes, { voiceVolume: { kind: 'clear' } })
  assert.deepEqual(editDraft(EMPTY_DRAFT, { voiceVolume: 0.8 }, 'clear', baseline({ voiceVolume: 0.8 })).changes, {})
})

test('an edit made while a save is in flight is kept so the save can describe it', () => {
  const base = baseline({ voiceVolume: 0.8 })
  const saving = editDraft(EMPTY_DRAFT, { voiceVolume: 0.8 }, 'set', base, true)
  assert.deepEqual(saving.changes, { voiceVolume: { kind: 'set' } })
  assert.deepEqual(saving.values, { voiceVolume: 0.8 })
})

test('dirty tracking reports unsaved values and overrides only', () => {
  assert.equal(draftFieldDirty(undefined, 0.5, 0.8, true), false)
  assert.equal(draftFieldDirty({ kind: 'set' }, 0.5, 0.8, false), true)
  assert.equal(draftFieldDirty({ kind: 'set' }, 0.8, 0.8, false), false)
  assert.equal(draftFieldDirty({ kind: 'set' }, 'voice-a', 'voice-a', false), false)
  assert.equal(draftFieldDirty({ kind: 'clear' }, 0.8, 0.8, true), true)
  assert.equal(draftFieldDirty({ kind: 'clear' }, 0.8, 0.8, false), false)
})

test('a successful save clears only the entries it committed and its key inputs', () => {
  const edits = {
    values: { voiceVolume: 0.5, soundVolume: 0.2 },
    changes: { voiceVolume: { kind: 'set' }, soundVolume: { kind: 'set' }, apiKey: { kind: 'set' } },
    keys: { xiaomi: 'sk-new', doubao: '', breeze: '', deepseek: '' },
  }
  const committed = { ...edits.changes }
  assert.deepEqual(pruneDraftEdits(edits, committed, false), { values: {}, changes: {}, keys: { xiaomi: '', doubao: '', breeze: '', deepseek: '' } })
})

test('an edit made during the save survives pruning while the committed one does not', () => {
  const edits = {
    values: { voiceVolume: 0.5, soundVolume: 0.2 },
    changes: { voiceVolume: { kind: 'set' }, soundVolume: { kind: 'set' } },
    keys: { xiaomi: '', doubao: '', breeze: '', deepseek: '' },
  }
  const committed = { voiceVolume: edits.changes.voiceVolume, soundVolume: edits.changes.soundVolume }
  const duringSave = { ...edits, values: { ...edits.values, voiceVolume: 0.6 }, changes: { ...edits.changes, voiceVolume: { kind: 'set' } } }
  const pruned = pruneDraftEdits(duringSave, committed, false)
  assert.deepEqual(pruned.values, { voiceVolume: 0.6 })
  assert.deepEqual(pruned.changes, { voiceVolume: { kind: 'set' } })
})

test('an external engine owns built-in fields, so their committed drafts stay pending', () => {
  const edits = {
    values: { voiceVolume: 0.5, voice: '冰糖' },
    changes: { voiceVolume: { kind: 'set' }, voice: { kind: 'set' } },
    keys: { xiaomi: '', doubao: '', breeze: '', deepseek: '' },
  }
  const committed = { ...edits.changes }
  assert.deepEqual(pruneDraftEdits(edits, committed, true), {
    values: { voice: '冰糖' }, changes: { voice: { kind: 'set' } }, keys: edits.keys,
  })
})
