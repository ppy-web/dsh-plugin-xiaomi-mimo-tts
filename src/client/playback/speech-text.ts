import { extractMarkdownPlainText } from '@deepseek-ai/dsh-client-ui-primitives'
import { prepareBreezeTtsText, prepareTtsText, prepareXiaomiTtsText } from '../../shared.js'

/** Exclude raw code before Markdown extraction can erase its fences. */
export function prepareSpeechText(value: string, tags: boolean | 'xiaomi' = false): string {
  // A tag may arrive across multiple assistant updates; wait for its closing bracket.
  const text = tags ? value.replace(/(?:\[[^\]\r\n]*|\([^()\r\n]*|（[^（）\r\n]*)$/u, '') : value
  return extractMarkdownPlainText((tags === 'xiaomi' ? prepareXiaomiTtsText : tags ? prepareBreezeTtsText : prepareTtsText)(text)).trim()
}
