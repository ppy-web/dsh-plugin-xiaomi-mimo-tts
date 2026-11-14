import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { mathFromMarkdown } from 'mdast-util-math'
import { gfm } from 'micromark-extension-gfm'
import { math } from 'micromark-extension-math'
import { prepareTtsText } from './normalize.js'

type MarkdownBlock = ReturnType<typeof fromMarkdown>['children'][number]
type MarkdownParagraph = Extract<MarkdownBlock, { type: 'paragraph' }>
type MarkdownPhrase = MarkdownParagraph['children'][number]

const MAX_CHARACTERS = 150
const SENTENCE_SEGMENTER = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter('zh', { granularity: 'sentence' }) : null
const MARKDOWN_OPTIONS = {
  extensions: [gfm({ singleTilde: false }), math()],
  mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()],
}

const REFERENCE_LABEL = '参考(?:资料|文献|链接|来源)|资料来源|引用来源|来源|references?|sources?|bibliography|citations?'
/** Only a heading that is exactly a reference label starts a reference section. */
const REFERENCE_HEADING = new RegExp(`^(?:${REFERENCE_LABEL})\\s*[:：]?\\s*$`, 'iu')
const REFERENCE_PREFIX = new RegExp(`^(?:${REFERENCE_LABEL})\\s*[:：]\\s*`, 'iu')
const REFERENCE_SEPARATOR = /^[\s,，、;；:：|。.!！?？-]*$/u
const KEY_HEADING = /^(?:总结|结论|主要结果|结果|建议|推荐|下一步|待确认|注意事项|summary|conclusion|results?|recommendations?|next steps?|tldr|tl;dr)(?:\s*[:：]\s*(.+)|$)/iu
const KEY_SENTENCE = /(?:结论|首选|优先|问题是|原因是|最值得|下一步|需要你确认|只需要|建议|先(?:去|看|检查|确认)|已(?:经)?(?:完成|修复|加上|生成|恢复|确认|核对|整理|归档)|^我核对了|\b(?:recommend|the cause|the result|next step|please confirm|we fixed)\b)/iu
const QUALIFICATION = /^(?:但|不过|然而|除非|仅当|前提是|条件是|仅限|只适用|否则|but\b|however\b|unless\b|only if\b|provided that\b|otherwise\b)/iu
const NEGATIVE_CAVEAT = /^(?:不(?:可|得|能|支持|要)|请勿|切勿|must not\b|do not\b|never\b)/iu
const CONTINUATION = /^(?:这样(?:才|就|能|做)|这(?:也|意味着)|这[个项些](?:结果|反馈|结论|数据|问题|方案|方法|建议|选择|操作)|上述|因此|所以|它|其余|this (?:means|is why)|therefore\b|as a result\b)/iu
const FOLLOW_UP = /^(?:(?:如果要接着做|如果还要继续)[，, ]*(?:我(?:也)?可以(?:帮你)?(?:整理(?:后续)?(?:计划|安排)|继续(?:处理|协助)?))?|if you want to (?:continue|go further)[, ]*(?:i can (?:also )?(?:help|assist|continue))?)[。.!！ ]*$/iu
const FILLER = /^(?:你好[啊呀]?|您好|当然可以|好的|明白了|没问题|下面(?:是|我来)(?:详细)?(?:说明|解释|分析|介绍|解答)|希望(?:这(?:些|能)?对你有帮助|能帮到你)|如(?:果)?(?:你)?有(?:其他|任何)问题[，, ]*(?:欢迎|可以|请)?(?:随时)?(?:提问|告诉我)|if you (?:have any other questions|need anything else).+|let me know if you .+|hope this helps|of course|sure)[，,。.!！?？:： ]*$/iu
const EMPTY_INTRO = /^(?:(?:对比|结果|数据|详情)如下|(?:下面|以下)是(?:对比|结果|数据|表格)(?:表)?|here (?:is|are) the (?:comparison|results|data|table))[。.:： ]*$/iu
const LOG_LINE = /^(?:(?:\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?\s+)?\[(?:trace|debug|info|warn|error|fatal)\]\s|(?:\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:\d{2})?\s+)(?:trace|debug|info|warn|error|fatal)\b|traceback \(most recent call last\)|\s*at .+\([^)]*:\d+:\d+\)|(?:\$\s+|(?:PS )?[a-z]:\\[^>]*>\s*)\S)/iu
const FILE_LABEL = /^(?:[\w.-]+\.)+(?:md|mjs|js|ts|tsx|py|sh|json|csv|txt|wav|yml|yaml|log)$/iu
const URL_LABEL = /^(?:[a-z][\w+.-]*:\/\/|www\.|\S+@\S+\.\S+$)/iu
const TERMINAL_PUNCTUATION = /[.?!;。！？；]$/u
const DOLLAR_AMOUNT = /(?<![\\$])\$-?\d+(?:,\d{3})*(?:\.\d+)?(?![.,]\d)(?=[\s,.!?;:，。！？；：、）)]|$)/gu
const BRACKET_MARKUP = /\[(?:!NOTE|!TIP|!IMPORTANT|!WARNING|!CAUTION|\d+(?:\s*[,–-]\s*\d+)*)\]/giu
const SPEECH_CONTENT = /[\p{L}\p{N}]/u
// CommonMark replaces input NULs with U+FFFD, so this marks only code we omit.
const OMITTED_INLINE_CODE = '\u0000'

function inlineCodeText(value: string): string {
  const term = /^[\p{L}\p{N}]{1,12}$/u.test(value)
    || (value.length <= 32 && /^(?:[a-z\d]+(?:-[a-z\d]+){1,3}|v?\d+(?:\.\d+){1,3}(?:-[a-z\d]+(?:[.-][a-z\d]+)*)?)$/iu.test(value))
  const quantity = /^[+-]?\d+(?:\.\d+)?(?:\s?(?:%|[\p{L}°℃℉/]{1,8}))?$/u.test(value)
  return term || quantity ? value : OMITTED_INLINE_CODE
}

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
      // Keep short values and terms; never leave a hole where a command or condition was.
      return inlineCodeText(node.value)
    case 'delete':
      // Struck text is usually the superseded value, so concise reading keeps the correction only.
      return ' '
    default: return ' '
  }
}

/**
 * A reference list paragraph is a label followed only by links. Requiring that
 * shape keeps ordinary prose such as "来源：本地缓存。" readable.
 */
function isReferenceParagraph(node: MarkdownParagraph): boolean {
  const [first, ...rest] = node.children
  if (first?.type !== 'text') return false
  const prefix = REFERENCE_PREFIX.exec(first.value)
  if (prefix === null || !REFERENCE_SEPARATOR.test(first.value.slice(prefix[0].length))) return false
  return rest.every(phrase => phrase.type === 'link' || phrase.type === 'linkReference'
    || (phrase.type === 'text' && REFERENCE_SEPARATOR.test(phrase.value)))
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
  unsafe: boolean
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
      .filter(line => !LOG_LINE.test(line))
      .join(' ')
      .replace(BRACKET_MARKUP, ' ')
    const block: Sentence[] = []
    for (const part of sentences(prose)) {
      const raw = part.trim()
      if (FILLER.test(raw) || EMPTY_INTRO.test(raw) || FOLLOW_UP.test(raw)) continue
      const text = clean(raw)
      const unsafe = raw.includes(OMITTED_INLINE_CODE)
      if (!unsafe && !SPEECH_CONTENT.test(text)) continue
      // Adjacent restrictions stay with their action even across paragraphs or list items.
      if (previous !== undefined && (QUALIFICATION.test(text) || NEGATIVE_CAVEAT.test(text))) {
        previous.text = joinSpeech([previous.text, text])
        previous.unsafe ||= unsafe
        continue
      }
      const dependsOnPrevious = CONTINUATION.test(text)
        || (/^(?:需要|得)在.+之间选/u.test(text) && /^如果/u.test(previous?.text ?? ''))
      previous = {
        text, key: keyHeading || KEY_SENTENCE.test(text), dependsOnPrevious,
        previous: dependsOnPrevious ? previous : undefined,
        unsafe: unsafe || (dependsOnPrevious && (previous?.unsafe ?? false)),
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
        referenceDepth = REFERENCE_HEADING.test(heading) ? node.depth : 0
        const key = KEY_HEADING.exec(heading)
        keyHeading = key !== null
        previous = undefined
        if (key?.[1]) addParagraph(key[1], true)
      } else if (referenceDepth !== 0) continue
      else if (node.type === 'paragraph') {
        if (isReferenceParagraph(node)) {
          previous = undefined
          continue
        }
        const codeOnly = node.children.some(phrase => phrase.type === 'inlineCode')
          && node.children.every(phrase => phrase.type === 'inlineCode' || (phrase.type === 'text' && !SPEECH_CONTENT.test(phrase.value)))
        if (!codeOnly || node.children.every(phrase => phrase.type !== 'inlineCode' || /^[+-]?\d/u.test(phrase.value))) {
          addParagraph(node.children.map(phraseText).join(''), keyHeading)
        } else previous = undefined
      } else if (node.type === 'list') {
        for (const item of node.children) visit(item.children, keyHeading)
      } else if (node.type === 'blockquote') visit(node.children, keyHeading)
      else if (node.type === 'table' && table === '') {
        previous = undefined
        const [header, ...rows] = node.children
        const rawLabels = header?.children.map(cell => cell.children.map(phraseText).join('')) ?? []
        if (rawLabels.some(label => label.includes(OMITTED_INLINE_CODE))) continue
        const labels = rawLabels.map(clean)
        for (const row of rows) {
          if (row.children.some(cell => cell.children.map(phraseText).join('').includes(OMITTED_INLINE_CODE))) continue
          const cells = labels.flatMap((label, index) => {
            const value = clean(row.children[index]?.children.map(phraseText).join('') ?? '')
            return SPEECH_CONTENT.test(value) ? [label === '' ? value : label + '：' + value] : []
          })
          if (cells.length > 0) {
            table = joinSpeech(cells)
            break
          }
        }
      } else previous = undefined
    }
  }

  visit(fromMarkdown(escapeDollarAmounts(removeBackslashMath(markdown)), MARKDOWN_OPTIONS).children)
  return { blocks: blocks.map(block => block.filter(sentence => !sentence.unsafe)).filter(block => block.length > 0), table }
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
  const blockPositions = new Map(blocks.flatMap((block, blockIndex) => block.map(sentence => [sentence, blockIndex] as const)))
  const positions = new Map(all.map((sentence, position) => [sentence, position]))
  const lengths = new Map(all.map(sentence => [sentence, sentence.text.length > MAX_CHARACTERS * 2
    ? MAX_CHARACTERS + 1 : [...sentence.text].length]))
  const separators = new Map(all.map(sentence => [sentence, TERMINAL_PUNCTUATION.test(sentence.text.at(-1)!) ? 1 : 2]))
  const speechLength = (group: readonly Sentence[]): number => group.reduce((length, sentence, index) =>
    length + lengths.get(sentence)! + (index === group.length - 1 ? 0 : separators.get(sentence)!), 0)
  const frequency = new Map<string, number>()
  for (const sentence of all) frequency.set(sentence.text, (frequency.get(sentence.text) ?? 0) + 1)

  // Cache bounded dependency groups, including failures, instead of walking each chain again.
  const excerpts = new Map<Sentence, Sentence[] | null>()
  const candidates = all.flatMap((sentence, position) => {
    const antecedent = sentence.dependsOnPrevious ? excerpts.get(sentence.previous!) : []
    const group = antecedent == null ? null : [...antecedent, sentence]
    const valid = group !== null && speechLength(group) <= MAX_CHARACTERS ? group : null
    excerpts.set(sentence, valid)
    if (valid === null) return []
    const block = blockPositions.get(sentence)!
    // Do not let repeated background crowd out the opening or the closing.
    if (!sentence.key && frequency.get(sentence.text)! > 1 && block !== 0 && block !== blocks.length - 1) return []
    return [{ sentence, position, block, group: valid }]
  })
  if (candidates.length === 0) return ''

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
  let kept: Sentence[] = []
  const keptTexts = new Set<string>()
  let keptLength = 0
  const include = (group: readonly Sentence[]): boolean => {
    if (group.length === 1) {
      const sentence = group[0]!
      if (keptTexts.has(sentence.text) || keptLength + lengths.get(sentence)! + (kept.length === 0 ? 0 : 1) > MAX_CHARACTERS) return false
    }
    const texts = new Set<string>()
    const additions = group.filter(sentence => {
      if (keptTexts.has(sentence.text) || texts.has(sentence.text)) return false
      texts.add(sentence.text)
      return true
    })
    if (additions.length === 0) return false
    // Each sentence contributes its following pause, except the last in source order.
    const last = kept.at(-1)
    const addedLast = additions.at(-1)!
    const nextLast = last === undefined || positions.get(addedLast)! > positions.get(last)! ? addedLast : last
    const nextLength = keptLength + (last === undefined ? 0 : separators.get(last)!)
      + additions.reduce((length, sentence) => length + lengths.get(sentence)! + separators.get(sentence)!, 0)
      - separators.get(nextLast)!
    if (nextLength > MAX_CHARACTERS) return false
    kept = [...kept, ...additions].sort((a, b) => positions.get(a)! - positions.get(b)!)
    for (const text of texts) keptTexts.add(text)
    keptLength = nextLength
    return true
  }

  const firstBlock = candidates[0]!.block
  const lastBlock = candidates.at(-1)!.block
  const sameBlock = firstBlock === lastBlock
  const important = (sentence: Sentence): boolean => sentence.key || /[?？]$/u.test(sentence.text)
  const opening = candidates.filter(item => item.block === firstBlock)
    .sort((a, b) => (sameBlock ? 0 : Number(important(b.sentence)) - Number(important(a.sentence))) || a.position - b.position)
  const closing = candidates.filter(item => item.block === lastBlock)
    .sort((a, b) => (sameBlock ? 0 : Number(important(b.sentence)) - Number(important(a.sentence))) || b.position - a.position)

  // Reserve the tail first. A multi-sentence closing should not lose its useful
  // context merely to make room for the opening. A single paragraph keeps both edges.
  include(closing[0]!.group)
  if (!sameBlock) for (const tail of closing.slice(1)) include(tail.group)
  for (const head of opening) {
    if (include(head.group)) break
  }

  const priority = (item: typeof candidates[number]): number => {
    if (item.block === lastBlock) return 0
    if (important(item.sentence)) return item.block === firstBlock ? 1 : 2
    return item.block === firstBlock ? 3 : 4
  }
  candidates.sort((a, b) => priority(a) - priority(b)
    || (a.block === lastBlock && b.block === lastBlock ? b.position - a.position : 0)
    || distance(a.position) - distance(b.position) || a.position - b.position)
  for (const { group } of candidates) include(group)
  return joinSpeech(kept.map(sentence => sentence.text))
}
