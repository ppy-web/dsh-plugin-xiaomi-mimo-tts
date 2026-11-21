const HAN = /\p{Script=Han}/u
export const DEEPSEEK_TEXT_UNITS = 10_000
export const DEEPSEEK_TEXT_BYTES = 64 * 1024
export const DEEPSEEK_INPUT_IDLE_MS = 55_000
const encoder = new TextEncoder()

function utf8CharBytes(char: string): number {
  const code = char.codePointAt(0)
  if (code === undefined) return 0
  if (code <= 0x7f) return 1
  if (code <= 0x7ff) return 2
  if (code <= 0xffff) return 3
  return 4
}

export function deepseekTextSize(text: string): { length: number; units: number; bytes: number } {
  let units = 0
  for (const char of text) units += HAN.test(char) ? 2 : 1
  return { length: text.length, units, bytes: encoder.encode(text).length }
}

export function exceedsDeepseekLimit(text: string, maximum: number): boolean {
  const size = deepseekTextSize(text)
  return size.length > maximum || size.units > DEEPSEEK_TEXT_UNITS || size.bytes > DEEPSEEK_TEXT_BYTES
}

/** Preserve input order and spacing, preferring a nearby sentence or word boundary. */
export function splitDeepseekText(text: string, maximum: number): string[] {
  if (!exceedsDeepseekLimit(text, maximum)) return text.trim() ? [text] : []
  const parts: string[] = []
  let remaining = text
  while (remaining) {
    let length = 0
    let units = 0
    let bytes = 0
    let sentence = 0
    let word = 0
    let previous = ''
    for (const char of remaining) {
      const cost = HAN.test(char) ? 2 : 1
      const width = utf8CharBytes(char)
      if (length + char.length > maximum || units + cost > DEEPSEEK_TEXT_UNITS || bytes + width > DEEPSEEK_TEXT_BYTES) break
      const next = remaining[length + char.length] ?? ''
      const boundary = /[。！？!?；;\n]/u.test(char) || (char === '.' && !(/\d/u.test(previous) && /\d/u.test(next)))
      length += char.length
      units += cost
      bytes += width
      if (boundary) sentence = length
      else if (/\s/u.test(char)) word = length
      previous = char
    }
    if (!length) throw new Error('text-too-long')
    const end = length === remaining.length ? length : sentence >= length / 2 ? sentence : word >= length / 2 ? word : length
    const part = remaining.slice(0, end)
    if (part.trim()) parts.push(part)
    remaining = remaining.slice(end)
  }
  return parts
}
