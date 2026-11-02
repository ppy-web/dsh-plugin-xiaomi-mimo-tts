/**
 * Pure MOSS-TTS-Nano helpers shared by the Host and the Web client.
 *
 * The local demo server exposes its built-in voice list as a JSON literal in
 * the page source (`const DEMOS = [...]`), so the parser below only needs the
 * page text and stays usable from tests and the browser.
 */

export interface MossVoice {
  /** Demo id accepted by `/api/generate` as `demo_id`. */
  id: string
  /** Localized demo name shown by the MOSS UI. */
  name: string
  /** Reference audio path relative to the MOSS app directory, when present. */
  promptSpeech?: string
}

const DEMO_LIST_MARKER = /\bconst\s+DEMOS\s*=\s*/u

/** Reject malformed or non-HTTP addresses before they reach the Host fetcher. */
export function normalizeMossBaseURL(value: unknown): string {
  if (typeof value !== 'string') throw new Error('moss-invalid-url')
  const input = value.trim()
  if (input.length === 0 || input.length > 2048) throw new Error('moss-invalid-url')
  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error('moss-invalid-url')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('moss-invalid-url')
  if (url.username.length > 0 || url.password.length > 0) throw new Error('moss-invalid-url')
  const pathname = url.pathname.replace(/\/+$/u, '')
  return `${url.origin}${pathname}`
}

/** Extract the built-in demo voices embedded in the MOSS demo page. */
export function parseMossDemoList(html: string): MossVoice[] {
  const marker = DEMO_LIST_MARKER.exec(html)
  if (marker === null) return []
  const start = html.indexOf('[', marker.index + marker[0].length)
  if (start < 0) return []
  const end = findJsonArrayEnd(html, start)
  if (end < 0) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(html.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set<string>()
  const voices: MossVoice[] = []
  for (const item of parsed) {
    if (item === null || typeof item !== 'object') continue
    const record = item as { id?: unknown; name?: unknown; prompt_speech?: unknown }
    if (typeof record.id !== 'string') continue
    const id = record.id.trim()
    if (id.length === 0 || seen.has(id)) continue
    seen.add(id)
    const name = typeof record.name === 'string' && record.name.trim().length > 0 ? record.name.trim() : id
    const promptSpeech = typeof record.prompt_speech === 'string' && record.prompt_speech.trim().length > 0
      ? record.prompt_speech.trim()
      : undefined
    voices.push({ id, name, ...(promptSpeech === undefined ? {} : { promptSpeech }) })
  }
  return voices
}

/** Find the closing bracket of a top-level JSON array while respecting strings. */
function findJsonArrayEnd(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]!
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '[') depth += 1
    else if (character === ']') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Build the display values used by the MOSS voice picker. */
export function mossVoiceChoices(voices: readonly MossVoice[], storedId: string, storedName: string): MossVoice[] {
  if (storedId.trim().length === 0 || voices.some(voice => voice.id === storedId)) return [...voices]
  return [{ id: storedId, name: storedName.trim() || storedId }, ...voices]
}
