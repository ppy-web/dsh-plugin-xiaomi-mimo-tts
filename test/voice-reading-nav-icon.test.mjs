import assert from 'node:assert/strict'
import test from 'node:test'
import { loadClientModule } from './helpers/client-modules.mjs'

const {
  VOICE_READING_NAV_ATTRIBUTE,
  installVoiceReadingNavIcon,
  markVoiceReadingNavCells,
  voiceReadingNavLabels,
} = await loadClientModule('src/client/settings/nav-icon.ts')
const { zh, en } = await loadClientModule('src/client/localization.ts')

const voiceReadingZh = zh['settings.voiceReadingNav']
const voiceReadingEn = en['settings.voiceReadingNav']

/** Fake nav cell: text plus recorded attribute writes. */
function fakeCell(text) {
  const attributes = new Map()
  return {
    textContent: text,
    attributes,
    setAttribute(name, value) { attributes.set(name, value) },
    removeAttribute(name) { attributes.delete(name) },
  }
}

/** Fake panel root that records which selector the marker scopes to. */
function fakePanel(cells) {
  const panel = {
    selectors: [],
    cells,
  }
  panel.querySelectorAll = (selector) => {
    panel.selectors.push(selector)
    return panel.cells
  }
  return panel
}

/** Fake document/window pair with a manually flushed animation frame queue. */
function fakeDocument(panels) {
  const frames = []
  const observers = []
  const flags = (selector, cells) => (selector === `[${VOICE_READING_NAV_ATTRIBUTE}]`
    ? cells.filter(cell => cell.attributes.has(VOICE_READING_NAV_ATTRIBUTE))
    : cells)
  const documentFake = {
    body: {},
    frames,
    observers,
    defaultView: {
      requestAnimationFrame(callback) { frames.push(callback); return frames.length },
      cancelAnimationFrame() {},
    },
    querySelectorAll(selector) {
      if (selector === '[role="dialog"][aria-modal="true"]') return panels
      return flags(selector, panels.flatMap(panel => panel.cells))
    },
  }
  globalThis.MutationObserver = class {
    constructor(callback) { this.callback = callback; observers.push(this) }
    observe(target, options) { this.target = target; this.options = options }
    disconnect() { this.disconnected = true }
  }
  return documentFake
}

test('labels cover every shipped locale', () => {
  const labels = voiceReadingNavLabels()
  assert.ok(labels.includes(voiceReadingZh))
  assert.ok(labels.includes(voiceReadingEn))
  for (const label of labels) assert.ok(label.trim().length > 0)
})

test('marks only the voice-reading nav cell and scopes to nav buttons', () => {
  const voice = fakeCell(` ${voiceReadingZh} `)
  const other = fakeCell('通用设置')
  const panel = fakePanel([fakeCell('账户'), voice, other])

  assert.equal(markVoiceReadingNavCells(panel, [voiceReadingZh, voiceReadingEn]), 1)
  assert.deepEqual(panel.selectors, ['nav button'])
  assert.equal(voice.attributes.get(VOICE_READING_NAV_ATTRIBUTE), '')
  assert.equal(other.attributes.size, 0)
})

test('matches the label of whichever locale the shell renders', () => {
  const zhCell = fakeCell(voiceReadingZh)
  const enCell = fakeCell(voiceReadingEn)
  const labels = voiceReadingNavLabels()

  assert.equal(markVoiceReadingNavCells(fakePanel([zhCell]), labels), 1)
  assert.equal(markVoiceReadingNavCells(fakePanel([enCell]), labels), 1)
  assert.equal(zhCell.attributes.get(VOICE_READING_NAV_ATTRIBUTE), '')
  assert.equal(enCell.attributes.get(VOICE_READING_NAV_ATTRIBUTE), '')
})

test('ignores cells without text and labels that normalize away', () => {
  const iconOnly = fakeCell(null)
  const blank = fakeCell('   ')

  assert.equal(markVoiceReadingNavCells(fakePanel([iconOnly, blank]), [voiceReadingZh]), 0)
  assert.equal(markVoiceReadingNavCells(fakePanel([iconOnly, blank]), ['   ']), 0)
  assert.equal(iconOnly.attributes.size, 0)
  assert.equal(blank.attributes.size, 0)
})

test('repeated scans stay idempotent', () => {
  const panel = fakePanel([fakeCell(voiceReadingZh)])
  const labels = voiceReadingNavLabels()
  assert.equal(markVoiceReadingNavCells(panel, labels), 1)
  assert.equal(markVoiceReadingNavCells(panel, labels), 1)
  assert.equal(panel.selectors.length, 2)
})

test('marks the open panel, re-marks host re-renders, and cleans up on dispose', () => {
  const cell = fakeCell(voiceReadingZh)
  const panel = fakePanel([fakeCell('账户'), cell])
  const documentFake = fakeDocument([panel])
  globalThis.document = documentFake
  try {
    const dispose = installVoiceReadingNavIcon()

    // The scan is coalesced onto the next frame instead of running synchronously.
    assert.equal(documentFake.frames.length, 1)
    documentFake.frames.shift()()
    assert.equal(cell.attributes.get(VOICE_READING_NAV_ATTRIBUTE), '')

    // A host re-render replaces the cell; the observer re-marks the new node.
    const rerendered = fakeCell(voiceReadingZh)
    panel.cells = [fakeCell('账户'), rerendered]
    documentFake.observers[0].callback()
    assert.equal(documentFake.frames.length, 1)
    documentFake.frames.shift()()
    assert.equal(rerendered.attributes.get(VOICE_READING_NAV_ATTRIBUTE), '')

    dispose()
    assert.equal(documentFake.observers[0].disconnected, true)
    assert.equal(rerendered.attributes.has(VOICE_READING_NAV_ATTRIBUTE), false)
  } finally {
    delete globalThis.document
    delete globalThis.MutationObserver
  }
})
