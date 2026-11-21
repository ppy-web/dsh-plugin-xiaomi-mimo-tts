const EMOTE = /\[表情[:：][^\]]*\]/gu
const CITATION = /\[(?:!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)|\^\S+?|\d+(?:\s*[,–-]\s*\d+)*)\]/giu
const CITATION_LABEL = new RegExp(`^${CITATION.source}$`, 'iu')
const PRICE = /^\$-?\d+(?:,\d{3})*(?:\.\d+)?(?![.,]\d)(?=[\s,.!?;:，。！？；：、）)]|$)(?![ \t]*(?:[+*/=\\^_<>−-]|\$(?!\d)))/u
const TOKEN = /\\[\\`$\[\]()<!&]|`+|\$+|!\[|\[|[<&(（]/gu
const HTML_TAG = /^<\/?[a-z][\w:-]*(?:\s(?:"[^"]*"|'[^']*'|[^'"<>])*)?\/?>/iu
const HTML_START = /^<\/?[a-z][\w:-]*(?=[\s/>]|$)/iu
const RAW_HTML = /^<(script|style|pre)(?=[\s/>]|$)/iu
const ENTITY_PREFIX = /^&(?:[a-z][a-z0-9]*|#(?:x[\da-f]*|\d*))?$/iu

export type SpeechTag = (value: string) => boolean

interface MarkupSpan {
  start: number
  end: number
  kind: 'omit' | 'inlineCode' | 'inlineMath' | 'displayMath' | 'link' | 'html'
  text: string | undefined
}

export function removeEmoteMarkup(value: string): string {
  return value.replace(EMOTE, ' ')
}

export function removeCitationMarkup(value: string): string {
  return value.replace(CITATION, ' ')
}

/** Find an unescaped delimiter on the same line, allowing nested pairs. */
function closingBracket(value: string, start: number, open: string, close: string): number {
  let depth = 1
  for (let index = start + 1; index < value.length; index++) {
    const character = value[index]
    if (character === '\n' || character === '\r') break
    if (character === '\\') index += 1
    else if (character === open) {
      depth += 1
      if (depth > 32) return -1
    }
    else if (character === close && --depth === 0) return index + 1
  }
  return -1
}

/** Parse only constructs that affect spoken text or can change an already visible prefix. */
export function findSpeechMarkup(value: string, streaming = false, isTag?: SpeechTag): { spans: MarkupSpan[]; pending: number } {
  const spans: MarkupSpan[] = []
  const tokens = new RegExp(TOKEN)
  const lastLineBreak = Math.max(value.lastIndexOf('\n'), value.lastIndexOf('\r'))
  let token: RegExpExecArray | null
  while ((token = tokens.exec(value)) !== null) {
    const start = token.index
    const mark = token[0]
    const after = tokens.lastIndex
    const tail = value.slice(start)
    let end = -1
    let kind: MarkupSpan['kind'] = 'omit'
    let speech: string | undefined
    let pending = false

    if (mark === '[' && (tail.startsWith('[表情:') || tail.startsWith('[表情：'))) {
      const close = value.indexOf(']', after)
      end = close < 0 ? value.length : close + 1
      pending = close < 0
    } else if (mark === '[' || mark === '![') {
      const bracket = after - 1
      const labelEnd = closingBracket(value, bracket, '[', ']')
      if (labelEnd < 0) {
        pending = bracket > lastLineBreak
      } else {
        const label = value.slice(bracket, labelEnd)
        const next = value[labelEnd]
        if (next === '(' || next === '[') {
          const destinationEnd = closingBracket(value, labelEnd, next, next === '(' ? ')' : ']')
          if (destinationEnd < 0) {
            pending = labelEnd > lastLineBreak
          } else if (!(mark === '[' && isTag?.(label) && isTag(value.slice(labelEnd, destinationEnd)))) {
            end = destinationEnd
            kind = mark === '![' ? 'omit' : 'link'
            speech = label.slice(1, -1)
          }
        } else if (labelEnd === value.length) {
          pending = true
        }
        if (end < 0 && CITATION_LABEL.test(label)) end = labelEnd
      }
    } else if (mark === '(' || mark === '（') {
      pending = streaming && start > lastLineBreak && closingBracket(value, start, mark, mark === '(' ? ')' : '）') < 0
    } else if (mark.startsWith('`')) {
      const closing = new RegExp('(?<!`)' + mark + '(?!`)', 'gu')
      closing.lastIndex = after
      const match = closing.exec(value)
      const body = value.slice(after, match?.index)
      if (!/\r?\n[ \t]*\r?\n/u.test(body)) {
        if (match) {
          end = match.index + mark.length
          kind = 'inlineCode'
          speech = body.replace(/[\r\n]+/gu, ' ')
        } else pending = true
      }
    } else if (mark === '\\(' || mark === '\\[' || (mark.startsWith('$') && !PRICE.test(tail))) {
      const delimiter = mark === '\\(' ? '\\)' : mark === '\\[' ? '\\]' : mark
      const display = mark === '\\[' || mark.length > 1 && mark[0] === '$'
      const blank = /\r?\n[ \t]*\r?\n/u.exec(value.slice(after))
      const limit = display || blank === null ? value.length : after + blank.index
      let close = value.indexOf(delimiter, after)
      while (close >= 0 && (value[close - 1] === '\\' && delimiter[0] === '$'
        || delimiter[0] === '$' && (value[close - 1] === '$' || value[close + delimiter.length] === '$' || /\d/u.test(value[close + delimiter.length] ?? '')))) {
        close = value.indexOf(delimiter, close + delimiter.length)
      }
      kind = display ? 'displayMath' : 'inlineMath'
      if (close >= after && close < limit) end = close + delimiter.length
      else if (display) { end = value.length; pending = true }
      else pending = limit === value.length && (mark === '\\(' || (!/^\$\s/u.test(tail) && !/[\r\n。！？；]/u.test(tail)))
    } else if (mark === '<') {
      if (tail.startsWith('<!--')) {
        const close = value.indexOf('-->', after + 3)
        end = close < 0 ? value.length : close + 3
        pending = close < 0
      } else {
        const tag = HTML_TAG.exec(tail)?.[0]
        const raw = RAW_HTML.exec(tail)?.[1]
        if (raw && !tag?.endsWith('/>')) {
          const close = tag ? new RegExp(`</${raw}\\s*>`, 'iu').exec(tail.slice(tag.length)) : null
          end = close ? start + tag!.length + close.index + close[0].length : value.length
          pending = close === null
        } else if (tag && !isTag?.(tag)) {
          kind = 'html'
          end = start + tag.length
        } else {
          const opener = HTML_START.exec(tail)?.[0]
          pending = '<!--'.startsWith(tail) || tail === '</' || opener !== undefined
            && ((/^\s+[\w:-]+\s*=/u.test(tail.slice(opener.length)) && !/\r?\n\r?\n/u.test(tail)) || !/[<>。！？；!?\r\n.,，]/u.test(tail.slice(1)))
        }
      }
    } else if (mark === '&') {
      pending = ENTITY_PREFIX.test(tail)
    }

    if (streaming && pending) return { spans, pending: start }
    if (end < 0) continue
    spans.push({ start, end, kind, text: speech })
    tokens.lastIndex = end
  }
  return { spans, pending: value.length }
}
