import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'

import { MINIMAL_MODE_STORAGE_KEY, readMinimalMode, writeMinimalMode } from '../src/client/settings/minimal-mode.ts'

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window
  else Object.defineProperty(globalThis, 'window', originalWindow)
})

test('minimal mode defaults to off and restores a saved preference', () => {
  const values = new Map()
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } },
  })

  assert.equal(readMinimalMode(), false)
  writeMinimalMode(true)
  assert.equal(values.get(MINIMAL_MODE_STORAGE_KEY), 'true')
  assert.equal(readMinimalMode(), true)
  writeMinimalMode(false)
  assert.equal(readMinimalMode(), false)
})

test('minimal mode falls back safely when browser storage is blocked', () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    get() { throw new Error('storage unavailable') },
  })

  assert.equal(readMinimalMode(), false)
  assert.doesNotThrow(() => writeMinimalMode(true))
})
