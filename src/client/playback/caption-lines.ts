/** Split spoken text into short lines without cutting graphemes or ordinary words. */
const WORDS = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null
const GRAPHEMES = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
const MAX_LINE_WIDTH = 16

function graphemes(value: string): string[] {
  return GRAPHEMES ? Array.from(GRAPHEMES.segment(value), part => part.segment) : Array.from(value)
}

function displayWidth(value: string): number {
  return graphemes(value).reduce((width, char) => width
    + (/\s/u.test(char) ? .35 : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Extended_Pictographic}]/u.test(char) ? 1 : .6), 0)
}

/** Approximate spoken time; used only when the provider supplies no word timestamps. */
function speechWeight(value: string): number {
  return Math.max(.3, graphemes(value).reduce((seconds, char) => seconds
    + (/\s/u.test(char) ? .04 : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(char) ? .22
      : /[\p{L}\p{N}]/u.test(char) ? .065 : .13), 0))
}

export interface CaptionLine { text: string; weight: number }

export function splitCaptionLines(value: string): CaptionLine[] {
  const text = value.replace(/\s+/gu, ' ').trim()
  if (!text) return []
  const words = WORDS ? Array.from(WORDS.segment(text), part => part.segment) : text.match(/\s+|[a-z\d]+|./giu) ?? []
  const output: string[] = []
  let line = ''
  let pendingBreak = false
  const flush = (): void => {
    if (line.trim()) output.push(line.trim())
    line = ''
    pendingBreak = false
  }
  for (const word of words) {
    if (/^\s+$/u.test(word)) { if (line) line += word; continue }
    const closing = /^[)\]}）】》」』”’]+$/u.test(word)
    const punctuation = /^[\p{P}\p{S}]+$/u.test(word)
    const continuation = closing || /^[.!?！？。;；,，、…]+$/u.test(word)
    if (pendingBreak && !continuation) flush()
    if (line && !punctuation && displayWidth(line + word) > MAX_LINE_WIDTH) flush()
    if (!line && displayWidth(word) > MAX_LINE_WIDTH) {
      for (const char of graphemes(word)) {
        if (line && displayWidth(line + char) > MAX_LINE_WIDTH) flush()
        line += char
      }
    } else {
      line += word
    }
    if (/[。！？!?；;.]$/u.test(word)) pendingBreak = true
    else if (/[，,、：:]$/u.test(word) && displayWidth(line) >= 9) pendingBreak = true
  }
  flush()
  return output.map(text => ({ text, weight: speechWeight(text) }))
}

/** Distribute lines over the measured duration, or over a speech-rate estimate. */
export function captionLineAt(lines: readonly CaptionLine[], elapsed: number, duration: number | undefined, rate = 1): number {
  if (lines.length < 2 || !Number.isFinite(elapsed) || elapsed <= 0) return 0
  const total = lines.reduce((sum, line) => sum + line.weight, 0)
  const effectiveRate = Number.isFinite(rate) && rate > 0 ? rate : 1
  const length = duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : total / effectiveRate
  const elapsedWeight = Math.min(total, elapsed / length * total)
  let remaining = elapsedWeight
  for (let index = 0; index < lines.length - 1; index += 1) {
    remaining -= lines[index]!.weight
    if (remaining < 0) return index
  }
  return lines.length - 1
}
