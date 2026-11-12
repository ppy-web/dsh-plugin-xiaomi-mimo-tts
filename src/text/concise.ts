import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'
import { prepareTtsText } from './normalize.js'

type MarkdownBlock = ReturnType<typeof fromMarkdown>['children'][number]
type MarkdownPhrase = Extract<MarkdownBlock, { type: 'paragraph' }>['children'][number]

const MAX_CHARACTERS = 120
const SENTENCE_SEGMENTER = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'sentence' }) : null
const MARKDOWN_OPTIONS = {
  extensions: [gfm({ singleTilde: false }), math()],
  mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
}

const REFERENCE_LABEL = /^(?:参考(?:资料|文献|链接|来源)|资料来源|引用来源|来源|references?|sources?|bibliography|citations?)(?:\s*[:：]|$)/iu
const KEY_HEADING = /^(?:总结|结论|主要结果|结果|建议|推荐|下一步|待确认|注意事项|summary|conclusion|results?|recommendations?|next steps?|tldr|tl;dr)(?:\s*[:：]\s*(.+)|$)/iu
const KEY_SENTENCE = /(?:结论|首选|优先|问题是|原因是|最值得|下一步|需要你确认|只需要|建议|先(?:去|看|检查|确认)|已(?:经)?(?:完成|修复|加上|生成|恢复|确认|核对|整理|归档)|^我核对了|\b(?:recommend|the cause|the result|next step|please confirm|we fixed)\b)/iu
const QUALIFICATION = /^(?:但|不过|然而|除非|仅当|前提是|条件是|仅限|只适用|否则|but\b|however\b|unless\b|only if\b|provided that\b|otherwise\b)/iu
const NEGATIVE_CAVEAT = /^(?:不(?:可|得|能|支持|要)|请勿|切勿|must not\b|do not\b|never\b)/iu
const CONTINUATION = /^(?:这样(?:才|就|能|做)|这(?:也|意味着)|这[个项些](?:结果|反馈|结论|数据)|上述|因此|所以|它|其余|this (?:means|is why)|therefore\b|as a result\b)/iu
const FOLLOW_UP = /^(?:(?:如果|若).*(?:上述|以上|这[两三几]条资料)|如果(?:要接着做|还要继续)|if you want to (?:continue|go further))/iu
const FILLER = /^(?:你好[啊呀]?|您好|当然可以|好的|明白了|没问题|下面(?:是|我来)(?:详细)?(?:说明|解释|分析|介绍|解答)|希望(?:这(?:些|能)?对你有帮助|能帮到你)|如(?:果)?(?:你)?有(?:其他|任何)问题[，, ]*(?:欢迎|可以|请)?(?:随时)?(?:提问|告诉我)|if you (?:have any other questions|need anything else).+|let me know if you .+|hope this helps|of course|sure)[，,。.!！?？:： ]*$/iu
const EMPTY_INTRO = /^(?:(?:对比|结果|数据|详情)如下|(?:下面|以下)是(?:对比|结果|数据|表格)(?:表)?|here (?:is|are) the (?:comparison|results|data|table))[。.:： ]*$/iu
const LOG_LINE = /^(?:(?:\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?\s+)?\[(?:trace|debug|info|warn|error|fatal)\]\s|(?:\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?\s+)(?:trace|debug|info|warn|error|fatal)\b|traceback \(most recent call last\)|\s*at .+\([^)]*:\d+:\d+\)|(?:\$\s+|(?:PS )?[a-z]:\\[^>]*>\s*)\S)/iu
const FILE_LABEL = /^(?:[\w.-]+\.)+(?:md|mjs|js|ts|tsx|py|sh|json|csv|txt|wav|yml|yaml|log)$/iu
const URL_LABEL = /^(?:[a-z][\w+.-]*:\/\/|www\.|\S+@\S+\.\S+$)/iu
const TERMINAL_PUNCTUATION = /[.?!;。！？；]$/u
const DOLLAR_AMOUNT = /(?<![\\$])\$-?\d+(?:,\d{3})*(?:\.\d+)?(?![.,]\d)(?=[\s,.!?;:，。！？；：、）)]|$)/gu
const BRACKET_MARKUP = /\[(?:!NOTE|!TIP|!IMPORTANT|!WARNING|!CAUTION|\d+(?:\s*[,–-]\s*\d+)*)\]/giu
const SPEECH_CONTENT = /[\p{L}\p{N}]/u

/** CommonMark unescapes these TeX delimiters before they can be distinguished from prose. */
function removeBackslashMath(value: string): string {
  let open: { start: number; close: string } | undefined
  let offset = 0
  const parts: string[] = []
  for (const token of value.matchAll(/\\\\|\\[()[\]]|\r?\n[ \t]*(?=\r?\n)/gu)) {
    const delimiter = token[0]
    if (delimiter === '\\\\') continue
    if (delimiter === '\\(' || delimiter === '\\[') {
      open = { start: token.index, close: delimiter === '\\(' ? '\\)' : '\\]' }
    } else if (open !== undefined && delimiter === open.close) {
      const end = token.index + delimiter.length
      parts.push(value.slice(offset, open.start), value.slice(open.start, end).replace(/[^\r\n]+/gu, ' '))
      offset = end
      open = undefined
    } else if (delimiter.startsWith('\n') || delimiter.startsWith('\r')) {
      open = undefined
    }
  }
  return parts.join('') + value.slice(offset)
}

/** A pair of prices in one paragraph can otherwise look like a single inline formula. */
function escapeDollarAmounts(value: string): string {
  return value.replace(DOLLAR_AMOUNT, (amount, offset: number) => {
    const following = value.slice(offset + amount.length)
    return /^[ \t]*(?:[+*/=\\^_<>−-]|\$(?!\d))/u.test(following) ? amount : '\\' + amount
  })
}

function phraseText(node: MarkdownPhrase): string {
  switch (node.type) {
    case 'text': return node.value
    case 'break': return ' '
    case 'emphasis':
    case 'strong': return node.children.map(phraseText).join('')
    case 'link':
    case 'linkReference': {
      const label = node.children.map(phraseText).join('')
      return FILE_LABEL.test(label) || URL_LABEL.test(label) ? ' ' : label
    }
    case 'inlineCode':
      // Keep short values and terms embedded in prose. Commands and paths have their own spelling.
      return /^(?:[\p{L}\p{N}]{1,12}|[+-]?\d+(?:\.\d+)?(?:\s?(?:%|[\p{L}°℃℉/]{1,8}))?)$/u.test(node.value) ? node.value : ' '
    default: return ' '
  }
}

function clean(value: string): string {
  const chinese = /\p{Script=Han}/u.test(value)
  return prepareTtsText(value
    .replace(/^(?:你好|您好|当然可以|没问题|好的|of course|sure)[,，!！]\s*/iu, '')
    .replace(BRACKET_MARKUP, ' ')
    .replace(/°[CF]|[℃℉]/gu, unit => {
      const celsius = unit === '℃' || unit === '°C'
      return chinese ? (celsius ? '摄氏度' : '华氏度') : (celsius ? ' degrees Celsius' : ' degrees Fahrenheit')
    }))
    .replace(/^[,;:.!? ]+$/u, '')
}

interface Sentence {
  text: string
  key: boolean
  dependsOnPrevious: boolean
  previous: Sentence | undefined
  followUp: boolean
}

function sentences(value: string): string[] {
  return SENTENCE_SEGMENTER === null
    ? value.split(/(?<=[。！？!?]|\.(?!\d))\s*/u)
    : Array.from(SENTENCE_SEGMENTER.segment(value), part => part.segment)
}

function joinSpeech(parts: readonly string[]): string {
  return parts.reduce((result, next) => {
    if (result === '') return next
    if (next === '') return result
    return result + (TERMINAL_PUNCTUATION.test(result.at(-1)!) ? ' ' : '. ') + next
  }, '')
}

function readMarkdown(markdown: string): { blocks: Sentence[][]; table: string } {
  const blocks: Sentence[][] = []
  let table = ''
  let previous: Sentence | undefined
  const addParagraph = (value: string, keyHeading: boolean): void => {
    const prose = value.split(/\r?\n/u)
      .map(line => line.trim())
      .filter(line => !LOG_LINE.test(line) && !REFERENCE_LABEL.test(line))
      .join(' ')
      .replace(BRACKET_MARKUP, ' ')
    const block: Sentence[] = []
    for (const part of sentences(prose)) {
      const raw = part.trim()
      if (FILLER.test(raw) || EMPTY_INTRO.test(raw)) continue
      const text = clean(raw)
      if (!SPEECH_CONTENT.test(text)) continue
      if (previous !== undefined && (QUALIFICATION.test(text) || (block.length > 0 && NEGATIVE_CAVEAT.test(text)))) {
        previous.text = joinSpeech([previous.text, text])
        continue
      }
      const dependsOnPrevious = CONTINUATION.test(text)
        || (/^(?:需要|得)在.+之间选/u.test(text) && /^如果/u.test(previous?.text ?? ''))
      previous = {
        text, key: keyHeading || KEY_SENTENCE.test(text), dependsOnPrevious,
        previous: dependsOnPrevious ? previous : undefined, followUp: FOLLOW_UP.test(text),
      }
      block.push(previous)
    }
    if (block.length > 0) blocks.push(block)
  }

  const visit = (nodes: readonly MarkdownBlock[], inheritedKey = false): void => {
    let referenceDepth = 0
    let keyHeading = inheritedKey
    for (const node of nodes) {
      if (node.type === 'heading') {
        if (referenceDepth !== 0 && node.depth > referenceDepth) continue
        const heading = node.children.map(phraseText).join('').trim()
        referenceDepth = REFERENCE_LABEL.test(heading) ? node.depth : 0
        const key = KEY_HEADING.exec(heading)
        keyHeading = key !== null
        previous = undefined
        if (key?.[1]) addParagraph(key[1], true)
      } else if (referenceDepth !== 0) continue
      else if (node.type === 'paragraph') {
        const codeOnly = node.children.some(phrase => phrase.type === 'inlineCode')
          && node.children.every(phrase => phrase.type === 'inlineCode' || (phrase.type === 'text' && !SPEECH_CONTENT.test(phrase.value)))
        if (!codeOnly || node.children.every(phrase => phrase.type !== 'inlineCode' || /^[+-]?\d/u.test(phrase.value))) {
          addParagraph(node.children.map(phraseText).join(''), keyHeading)
        }
      } else if (node.type === 'list') {
        for (const item of node.children) visit(item.children, keyHeading)
      } else if (node.type === 'blockquote') visit(node.children, keyHeading)
      else if (node.type === 'table' && table === '') {
        const [header, ...rows] = node.children
        const labels = header?.children.map(cell => clean(cell.children.map(phraseText).join(''))) ?? []
        for (const row of rows) {
          const cells = labels.flatMap((label, index) => {
            const value = clean(row.children[index]?.children.map(phraseText).join('') ?? '')
            return SPEECH_CONTENT.test(value) ? [label === '' ? value : label + '：' + value] : []
          })
          if (cells.length > 0) {
            table = joinSpeech(cells)
            break
          }
        }
      }
    }
  }

  visit(fromMarkdown(escapeDollarAmounts(removeBackslashMath(markdown)), MARKDOWN_OPTIONS).children)
  return { blocks, table }
}

/** Select complete, speakable excerpts from raw assistant Markdown before synthesis. */
export function prepareConciseTtsText(markdown: string): string {
  const { blocks, table } = readMarkdown(markdown)
  const fits = (text: string): boolean => text.length <= MAX_CHARACTERS * 2
    && [...text].length <= MAX_CHARACTERS
  if (blocks.length === 0) return fits(table) ? table : ''

  const full = joinSpeech(blocks.flatMap(block => block.map(sentence => sentence.text)))
  if (fits(full)) return full

  const all = blocks.flat()
  const frequency = new Map<string, number>()
  for (const sentence of all) frequency.set(sentence.text, (frequency.get(sentence.text) ?? 0) + 1)

  // Include the antecedent of a dependent sentence as one indivisible excerpt.
  const excerpt = (sentence: Sentence): Sentence[] | null => {
    const group = [sentence]
    let current = sentence
    while (current.dependsOnPrevious) {
      if (current.previous === undefined) return null
      current = current.previous
      group.unshift(current)
      if (!fits(joinSpeech(group.map(item => item.text)))) return null
    }
    return group
  }
  const candidates = all.flatMap((sentence, position) => {
    const group = excerpt(sentence)
    if (group === null || !fits(joinSpeech(group.map(item => item.text)))) return []
    // Repeated background and continuation offers should not consume the summary budget.
    if (!sentence.key && frequency.get(sentence.text)! > 1) return []
    if (group.some(item => item.followUp)) return []
    return [{ sentence, position, group }]
  })
  const keyPositions = new Set(candidates.filter(item => item.sentence.key).map(item => item.position))
  const distances = all.map(() => Infinity)
  let nearest = -Infinity
  for (let position = 0; position < all.length; position += 1) {
    if (keyPositions.has(position)) nearest = position
    distances[position] = position - nearest
  }
  nearest = Infinity
  for (let position = all.length - 1; position >= 0; position -= 1) {
    if (keyPositions.has(position)) nearest = position
    distances[position] = Math.min(distances[position]!, nearest - position)
  }
  const distance = (position: number): number => keyPositions.size === 0 ? position : distances[position]!
  candidates.sort((a, b) => Number(b.sentence.key) - Number(a.sentence.key)
    || distance(a.position) - distance(b.position) || a.position - b.position)

  const kept = new Set<Sentence>()
  const keptText = new Set<string>()
  const positions = new Map(all.map((sentence, position) => [sentence, position]))
  const render = (selection: Set<Sentence>): string => joinSpeech([...selection]
    .sort((a, b) => positions.get(a)! - positions.get(b)!).map(item => item.text))
  for (const { group } of candidates) {
    const addition = group.filter(item => !keptText.has(item.text))
    if (addition.length === 0) continue
    const proposed = new Set([...kept, ...addition])
    if (!fits(render(proposed))) continue
    for (const sentence of addition) {
      kept.add(sentence)
      keptText.add(sentence.text)
    }
  }
  return render(kept)
}
