import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveApiKeyViewState } from '../src/client/settings/api-key-state.ts'

test('API key view state distinguishes saved, pending, invalid, unavailable, and clear states', () => {
  assert.equal(resolveApiKeyViewState('', false, 'loading', undefined), 'loading')
  assert.equal(resolveApiKeyViewState('', false, 'missing', undefined), 'missing')
  assert.equal(resolveApiKeyViewState('', false, 'recognized', undefined), 'recognized')
  assert.equal(resolveApiKeyViewState('', false, 'unrecognized', undefined), 'unrecognized')
  assert.equal(resolveApiKeyViewState('', false, 'unavailable', undefined), 'unavailable')
  assert.equal(resolveApiKeyViewState('  sk-new-key  ', true, 'recognized', 'set'), 'pending-save')
  assert.equal(resolveApiKeyViewState('tp-new-key', true, 'missing', 'set'), 'pending-save')
  assert.equal(resolveApiKeyViewState('not-a-mimo-key', false, 'recognized', 'set'), 'pending-invalid')
  assert.equal(resolveApiKeyViewState('', false, 'recognized', 'clear'), 'pending-clear')
})
