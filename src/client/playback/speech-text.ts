import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import { prepareBreezeTtsText, prepareTtsText } from '../../shared.js'

/** Exclude raw code before Markdown extraction can erase its fences. */
export function prepareSpeechText(value: string, breeze = false): string {
  // A tag may arrive across multiple assistant updates; wait for its closing bracket.
  const text = breeze ? value.replace(/(?:\[[^\]\r\n]*|\([^()\r\n]*)$/u, '') : value
  return extractMarkdownPlainText((breeze ? prepareBreezeTtsText : prepareTtsText)(text)).trim()
}
