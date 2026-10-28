/**
 * Settings nav glyph for the voice-reading section.
 *
 * Host 0.2.1-rc.2 paints the settings-nav glyph from a hardcoded section-id
 * table in the shell (`navIcon(id)` in ui-settings-general) and the
 * `settings.section` list registration accepts no icon option, so every
 * third-party section falls back to the settings gear. The shell owns that DOM,
 * so this module takes the narrowest patch available to a plugin: it marks the
 * voice-reading nav cell with a data attribute, and the stylesheet
 * (style/voice-reading.css) swaps the gear for a speaker glyph. No other host
 * node is touched.
 *
 * The panel is body-portaled and re-rendered by the host (open/close, locale
 * switch, registrant changes), so the mark is re-applied from a coalesced
 * MutationObserver scan and removed on dispose.
 */
import { en, zh, ja, fr } from '../localization.js'

/** Attribute the stylesheet keys the glyph swap off. */
export const VOICE_READING_NAV_ATTRIBUTE = 'data-xmimo-voice-reading-nav'

/** The body-portaled settings panel (ui-settings-general SettingsRoot). */
const SETTINGS_DIALOG_SELECTOR = '[role="dialog"][aria-modal="true"]'

/** Nav cells are the buttons of the panel's nav rail. */
const NAV_CELL_SELECTOR = 'nav button'

/** Section labels in every locale the plugin ships; the shell renders one at a time. */
export function voiceReadingNavLabels(): readonly string[] {
  return [zh, en, ja, fr].map(dictionary => dictionary['settings.voiceReadingNav'])
}

/** Structural nav-cell contract, so the marker is testable with a fake root. */
export interface VoiceReadingNavCell {
  textContent: string | null
  setAttribute(name: string, value: string): void
}

/** Structural queryable contract (Element or Document). */
export interface VoiceReadingNavRoot {
  querySelectorAll(selector: string): ArrayLike<VoiceReadingNavCell>
}

/** Trimmed, deduplicated, non-empty labels. */
function normalizeLabels(labels: readonly string[]): readonly string[] {
  const wanted = new Set<string>()
  for (const label of labels) {
    const text = label.trim()
    if (text !== '') wanted.add(text)
  }
  return [...wanted]
}

/**
 * Mark every nav cell under `root` whose text equals one of `labels`.
 * @returns the number of cells marked.
 */
export function markVoiceReadingNavCells(root: VoiceReadingNavRoot, labels: readonly string[]): number {
  const wanted = normalizeLabels(labels)
  if (wanted.length === 0) return 0
  let marked = 0
  for (const cell of Array.from(root.querySelectorAll(NAV_CELL_SELECTOR))) {
    const text = (cell.textContent ?? '').trim()
    if (!wanted.includes(text)) continue
    cell.setAttribute(VOICE_READING_NAV_ATTRIBUTE, '')
    marked += 1
  }
  return marked
}

/**
 * Mark the voice-reading nav cell whenever the settings panel is on screen.
 * @returns a disposer that stops observing and removes the marks.
 */
export function installVoiceReadingNavIcon(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const view = document
  const win = view.defaultView
  if (win === null || view.body === null) return () => {}

  let frame: number | undefined
  let disposed = false

  const apply = () => {
    frame = undefined
    if (disposed) return
    const labels = voiceReadingNavLabels()
    for (const dialog of Array.from(view.querySelectorAll(SETTINGS_DIALOG_SELECTOR))) {
      markVoiceReadingNavCells(dialog, labels)
    }
  }

  // One scan per frame: the observer fires per mutation batch, and a settled
  // scan is cheap (a single dialog lookup when no panel is open).
  const schedule = () => {
    if (disposed || frame !== undefined) return
    frame = win.requestAnimationFrame(apply)
  }

  const observer = new MutationObserver(schedule)
  observer.observe(view.body, { childList: true, subtree: true })
  schedule()

  return () => {
    disposed = true
    observer.disconnect()
    if (frame !== undefined) win.cancelAnimationFrame(frame)
    for (const cell of Array.from(view.querySelectorAll(`[${VOICE_READING_NAV_ATTRIBUTE}]`))) {
      cell.removeAttribute(VOICE_READING_NAV_ATTRIBUTE)
    }
  }
}
