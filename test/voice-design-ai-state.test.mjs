import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isUnmountedChannelFailure,
  resolveVoiceDesignAiAvailability,
} from '../src/client/settings/voice-design-ai-state.ts'

test('Voice Design AI availability requires an explicit Host confirmation', () => {
  assert.equal(resolveVoiceDesignAiAvailability({ available: true }), 'available')
  assert.equal(resolveVoiceDesignAiAvailability({ available: false }), 'unavailable')
  assert.equal(resolveVoiceDesignAiAvailability({}), 'unavailable')
  assert.equal(resolveVoiceDesignAiAvailability({ available: 'yes' }), 'unavailable')
  assert.equal(resolveVoiceDesignAiAvailability(null), 'unavailable')
  assert.equal(resolveVoiceDesignAiAvailability('available'), 'unavailable')
})

test('an unmounted RPC channel is recognised from the transport failure message', () => {
  assert.equal(isUnmountedChannelFailure('transport failure for /xiaomi-mimo-tts/voice-design/generate: HTTP 405'), true)
  assert.equal(isUnmountedChannelFailure('transport failure for /xiaomi-mimo-tts/voice-design/generate: HTTP 500'), false)
  assert.equal(isUnmountedChannelFailure('transport failure for /xiaomi-mimo-tts/voice-design/generate: HTTP 401'), false)
  assert.equal(isUnmountedChannelFailure('voice-design-ai-failed'), false)
  assert.equal(isUnmountedChannelFailure(new Error('HTTP 405')), false)
  assert.equal(isUnmountedChannelFailure(undefined), false)
})