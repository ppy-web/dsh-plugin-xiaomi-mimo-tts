import { findFencedCodeRegions, removeFencedCode, removeIndentedCode } from './fenced-code.js'
import { isKnownXiaomiAudioTag, stripXiaomiAudioTags, XIAOMI_AUDIO_TAG_PATTERN } from './xiaomi-audio-tags.js'
import { findSpeechMarkup, removeCitationMarkup, removeEmoteMarkup } from './markup.js'
import type { SpeechTag } from './markup.js'

const TTS_PUNCTUATION: Record<string, string> = {
  '，': ',',
  '。': '.',
  '！': '!',
  '？': '?',
  '；': ';',
  '：': ':',
  '、': ',',
  '（': ',',
  '）': ',',
  '　': ' ',
}

/** Decorative punctuation can make TTS emit non-speech artifacts, so omit it entirely. */
const TTS_NON_SPEECH_PUNCTUATION = /[()\[\]【】［］〔〕〖〗{}｛｝「」『』《》〈〉“”"`<>]/gu
/** Keep apostrophes inside words; remove quote marks around them. */
const TTS_APOSTROPHE_QUOTE = /(?<![\p{L}\p{N}])['’‘]|['’‘](?![\p{L}\p{N}])/gu
/** Comparison signs carry meaning that plain symbol removal would erase. */
const TTS_COMPARISON_OPERATOR = /[ \t]*(<=|>=|!=|=>|->|[≤≥≠→])[ \t]*|(?<=[\p{L}\p{N}])[ \t]*([<>])[ \t]*(?=[\p{L}\p{N}])/gu
const TTS_OPERATORS: Record<string, [string, string]> = {
  '<': ['小于', 'less than'], '>': ['大于', 'greater than'],
  '<=': ['小于等于', 'less than or equal to'], '≤': ['小于等于', 'less than or equal to'],
  '>=': ['大于等于', 'greater than or equal to'], '≥': ['大于等于', 'greater than or equal to'],
  '!=': ['不等于', 'not equal to'], '≠': ['不等于', 'not equal to'],
  '=>': ['指向', 'points to'], '->': ['指向', 'points to'], '→': ['指向', 'points to'],
}
/** Ellipses and wave dashes carry a sentence-level pause, so keep that cue as a period. */
const TTS_SENTENCE_PAUSE_PUNCTUATION = /[…⋯〜～]+/gu
const TTS_PAUSE_MARKER = ''

const TTS_URL_PATTERN = /\b(?:https?|ftp):\/\/[^\s<>()[\]，。！？；：、]+|\bwww\.[^\s<>()[\]，。！？；：、]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|cn|net|org|io|ai|dev|me|co|edu|gov|xyz|tech|info|app|site|link)\b(?:[/:?#][^\s<>()[\]，。！？；：、]*)?/giu
const TTS_WINDOWS_PATH_PATTERN = /(?<=["'])(?:[A-Za-z]:[\\/]|\\\\)[^"'<>\r\n]+(?=["'])|\b[A-Za-z]:[\\/][\w.~%+-]+(?:[\\/][\w.~%+-]+)*|\\\\[\w.~%+-]+(?:[\\/][\w.~%+-]+)+/gu
const TTS_UNIX_PATH_PATTERN = /(?<=^|[\s([（【:：，、；。！？,;!?=*_'"`])~?\/(?!(?:\d+\/)+\d+(?![\w./-]))(?:[\w.~-]+\/)+[\w.~-]+/gu
const TTS_RELATIVE_PATH_PATTERN = /(?:\.\.?[\\/])(?:[A-Za-z0-9._-]+[\\/])*(?:[A-Za-z0-9._-]+(?:\.[A-Za-z0-9_-]+)?)/gu
const TTS_PROJECT_PATH_PATTERN = /\b(?:[\w.~-]+[\\/])+[\w~-]+(?:\.[\w~-]+)+\b/gu

const MARKDOWN_REFERENCE_DEFINITION_RE = /(^|\n)(?:[ \t]*>[ \t]?)*[ \t]*\[[^\]\r\n]+\]:[^\r\n]*(?=\r?\n|$)/g
const MARKDOWN_HEADING_RE = /(^|\n)[ \t]{0,3}#+/g
const MARKDOWN_LIST_RE = /(^|\n)\s*(?:[-*+]|\d+[.)])\s+/g
const MARKDOWN_BLOCKQUOTE_RE = /(^|\n)\s*>\s?/g
const MARKDOWN_TASK_MARKER_RE = /(^|\s)\[[ xX]\](?=\s|$)/g
const MARKDOWN_RULE_RE = /(^|\n)[ \t]{0,3}(?:(?:=[ \t]*)+|(?:-[ \t]*)+|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})[ \t]*(?=\r?\n|$)/g
const MARKDOWN_TABLE_DELIMITER_RE = /(^|\n)[ \t]{0,3}(?=[^\r\n]*\|)[|:\- \t]+(?=\r?\n|$)/g
const MARKDOWN_INLINE_FORMAT_RE = /`+|[*_]+|~{2,}/g
const MARKDOWN_TABLE_SEP_RE = /[|]/g
const WORD_CHARACTER = /[\p{L}\p{N}]/u

const HTML_ENTITY = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/gu
const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ',
  copy: '©', reg: '®', trade: '™', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', times: '×', divide: '÷', deg: '°',
  middot: '·', bull: '•', plusmn: '±', micro: 'µ', para: '¶', sect: '§',
}

function decodeHtmlEntities(value: string): string {
  if (!value.includes('&')) return value
  return value.replace(HTML_ENTITY, (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
    if (decimal !== undefined || hex !== undefined) {
      const code = decimal !== undefined ? Number(decimal) : Number.parseInt(hex!, 16)
      return code > 0 && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : match
    }
    return HTML_NAMED_ENTITIES[name!.toLowerCase()] ?? match
  })
}

/** Keep word-internal markers apart so 2*3 does not become 23. */
function stripMarkdownInlineFormat(value: string): string {
  return value.replace(MARKDOWN_INLINE_FORMAT_RE, (match, offset: number) => {
    const before = value[offset - 1] ?? ''
    const after = value[offset + match.length] ?? ''
    return WORD_CHARACTER.test(before) && WORD_CHARACTER.test(after) ? ' ' : ''
  })
}

const ADDRESS_PATTERNS = [TTS_URL_PATTERN, TTS_WINDOWS_PATH_PATTERN, TTS_RELATIVE_PATH_PATTERN, TTS_UNIX_PATH_PATTERN, TTS_PROJECT_PATH_PATTERN]

function addressEnd(address: string): number {
  return address.replace(/[.,!?;:]+$/u, '').length
}

function removeAddresses(value: string): string {
  for (const pattern of ADDRESS_PATTERNS) value = value.replace(pattern, address => ` ${address.slice(addressEnd(address))}`)
  return value
}

function projectMarkup(value: string, isTag?: SpeechTag, decode = true): string {
  const { spans } = findSpeechMarkup(value, false, isTag)
  const prose = (text: string): string => {
    if (!decode) return text
    const decoded = decodeHtmlEntities(text)
    return decoded === text ? text : projectMarkup(decoded, isTag, false)
  }
  let result = ''
  let from = 0
  for (const { start, end, kind, text } of spans) {
    result += prose(value.slice(from, start))
    if (kind === 'inlineCode') result += removeAddresses(text!).replace(/(?<=\w)<([\w$][\w$,. ?\[\]]*)>/gu, ' $1 ')
    else if (kind === 'link') result += projectMarkup(text!, isTag, decode)
    else result += ' '
    from = end
  }
  return result + prose(value.slice(from))
}

function removeTtsMarkup(value: string, protect?: (text: string) => string, isTag?: SpeechTag): string {
  const source = removeIndentedCode(removeFencedCode(value)).replace(MARKDOWN_REFERENCE_DEFINITION_RE, '$1')
  let text = projectMarkup(removeEmoteMarkup(source), isTag)
    .replace(MARKDOWN_BLOCKQUOTE_RE, '$1')
    .replace(MARKDOWN_RULE_RE, '$1')
    .replace(MARKDOWN_HEADING_RE, '$1')
    .replace(MARKDOWN_LIST_RE, '$1')
    .replace(MARKDOWN_TASK_MARKER_RE, '$1')
    .replace(MARKDOWN_TABLE_DELIMITER_RE, '$1')
  text = removeCitationMarkup(removeEmoteMarkup(text))
  return stripMarkdownInlineFormat(removeAddresses(protect?.(text) ?? text)).replace(MARKDOWN_TABLE_SEP_RE, ' ')
}

function removeTtsSymbols(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁯﻿]/g, ' ')
    .replace(/(?![℃℉°㎡㎥])(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{So}|︎|️|‍|⃣)/gu, ' ')
}

function normalizeTtsComparisons(value: string): string {
  return value.replace(TTS_COMPARISON_OPERATOR, (match, compound: string | undefined, single: string | undefined, offset: number) => {
    // Use only the current clause's preceding text, which is stable as a reply grows.
    const before = value.slice(Math.max(0, offset - 80), offset).match(/[^\r\n。！？!?；;:：.]*$/u)?.[0] ?? ''
    const chinese = /\p{Script=Han}/u.test(before + value.slice(offset + match.length, offset + match.length + 2))
    return ` ${TTS_OPERATORS[(compound ?? single)!]![chinese ? 0 : 1]} `
  })
}

/** Combined punctuation normalization: collapse adjacent punctuation, remove non-speech characters, and normalize Chinese punctuation. */
function normalizeTtsPunctuation(value: string): string {
  return normalizeTtsComparisons(value)
    .replace(TTS_SENTENCE_PAUSE_PUNCTUATION, '.')
    // A dash in prose signals a pause; preserve that cue as a single comma.
    // Keep it marked until standalone punctuation has been removed.
    .replace(/[—–－]+/gu, TTS_PAUSE_MARKER)
    .replace(TTS_APOSTROPHE_QUOTE, '')
    .replace(TTS_NON_SPEECH_PUNCTUATION, '')
    .replace(/[，。！？；：、（）　]/gu, (character) => TTS_PUNCTUATION[character] ?? character)
    .replace(/(^|\s)[,;:!?]+(?=\s|$)/g, '$1')
    .replace(/([,;:])\s*([.!?])/g, '$2')
    .replace(/([.!?])[,;:]+(?=\s|$)/g, '$1')
    .replace(new RegExp(TTS_PAUSE_MARKER, 'g'), ',')
    .replace(/\s+([,.;:!?])/g, '$1')
    // Filtering Markdown, paths, and line breaks can leave sentence-ending
    // periods next to each other. Keep one separator and never start speech
    // with a punctuation-only period.
    .replace(/\.{2,}/gu, '.')
    .replace(/^\.+/u, '')
}

/**
 * Prepare assistant text for speech synthesis without changing the chat transcript.
 *
 * @param value Raw assistant text or Markdown-derived text.
 * @returns Text with non-speech content removed and punctuation normalized.
 */
export function prepareTtsText(value: string): string {
  return normalizeSpeech(value, undefined, tag => BREEZE_AUDIO_TAGS.has(tag))
}

/** Generic external cleanup preserves only tags explicitly declared by the selected model. */
export function prepareExternalTtsText(value: string, allowedTags: readonly string[] = []): string {
  const tags = new Set(allowedTags.filter(Boolean))
  return normalizeSpeech(value, (text, save) => {
    for (const tag of [...tags].sort((a, b) => b.length - a.length)) text = text.split(tag).join(save(tag))
    return text
  }, tag => tags.has(tag))
}

/** Preserve MiMo's open tag vocabulary after removing code, links and paths. */
export function prepareXiaomiTtsText(value: string, isTag: SpeechTag = () => true): string {
  return normalizeSpeech(value, (text, save) => text.replace(XIAOMI_AUDIO_TAG_PATTERN, tag => isTag(tag) ? save(tag) : tag),
    isKnownXiaomiAudioTag, false)
}

export function prepareXiaomiVoiceDesignText(value: string): string {
  return normalizeSpeech(value, text => stripXiaomiAudioTags(text, true), isKnownXiaomiAudioTag)
}

function normalizeSpeech(value: string, protect?: (text: string, save: (tag: string) => string) => string, isTag?: SpeechTag, stripBreeze = true): string {
  const tags: string[] = []
  const cleaned = removeTtsMarkup(value.replace(/[\uE000-\uE002]/gu, ' '), text => {
    const prose = text.replace(/[\uE000-\uE002]/gu, ' ')
    const protectedText = protect?.(prose, tag => `\uE001${tags.push(tag) - 1}\uE002`) ?? prose
    return stripBreeze ? stripBreezeAudioTags(protectedText) : protectedText
  }, isTag)
  const text = normalizeTtsPunctuation(removeTtsSymbols(cleaned
    .replace(/\\\\|\\[rn]/gu, escape => escape === '\\\\' ? escape : ' ')
    .replace(/\r\n?|\n/g, '.')))
  return text.replace(/\s+/gu, ' ').trim().replace(/\uE001(\d+)\uE002/gu, (_match, index: string) => tags[Number(index)] ?? '')
}

/** Documented Breeze audio events, grouped for the model-facing tag reference. */
export interface BreezeAudioTagGroup {
  /** Short Chinese category label. */
  label: string
  /** Chinese tags, which use square brackets. */
  zh: readonly string[]
  /** English tags, which use parentheses. */
  en: readonly string[]
}

export const BREEZE_AUDIO_TAG_GROUPS: readonly BreezeAudioTagGroup[] = [
  { label: '笑声', zh: ['[笑]', '[轻笑]', '[咯咯笑]'], en: ['(laughs)', '(chuckles)', '(giggles)'] },
  { label: '哭泣与疼痛', zh: ['[哭声]', '[抽泣]', '[呜咽]', '[呻吟]', '[哀号]'], en: ['(cries)', '(sobs)', '(whimpers)', '(groans)', '(moans)'] },
  { label: '呼吸', zh: ['[叹气]', '[惊呼]', '[吸气]', '[呼气]', '[喘息]'], en: ['(sighs)', '(gasps)', '(inhales)', '(exhales)', '(breathes heavily)'] },
  { label: '发声', zh: ['[耳语]', '[喊叫]', '[惨叫]'], en: ['(whispers)', '(shouts)', '(screams)'] },
  { label: '唱歌', zh: ['[唱歌]', '[哼歌]'], en: ['(sings)', '(hums)'] },
  { label: '说话', zh: ['[结巴]', '[停顿]', '[清嗓]'], en: ['(stutters)', '(pauses)', '(clears throat)'] },
  { label: '喉部', zh: ['[咳嗽]', '[吸鼻子]', '[咂嘴]', '[啧嘴]'], en: ['(coughs)', '(sniffles)', '(lip smacks)', '(clicks tongue)'] },
  { label: '其他', zh: ['[打哈欠]', '[打喷嚏]', '[打嗝]', '[打饱嗝]', '[吞咽]', '[干呕]', '[闷哼]', '[冷笑]', '[哼鼻子]'], en: ['(yawns)', '(sneezes)', '(hiccups)', '(burps)', '(gulps)', '(gags)', '(grunts)', '(scoffs)', '(snorts)'] },
]

export const BREEZE_AUDIO_TAGS: ReadonlySet<string> = new Set(
  BREEZE_AUDIO_TAG_GROUPS.flatMap(group => [...group.zh, ...group.en]),
)

/** Compact reference appended to speech tool descriptions so the model can choose tags itself. */
export const BREEZE_AUDIO_TAG_GUIDANCE = ' Breeze audio tags (use only when the active provider is Breeze, and only in this tool\'s text argument, never in a normal chat reply): '
  + BREEZE_AUDIO_TAG_GROUPS.map(group => `${group.label} ${group.zh.join(' ')} / ${group.en.join(' ')}`).join('; ')
  + '. Chinese text uses the bracketed Chinese tag and English text the parenthesized English tag; never mix forms. Add only a few tags where the emotion or action naturally occurs, keep the exact spelling, and never read a tag aloud as words.'

/** Prepare Breeze text while preserving only the documented audio-tag vocabulary. */
export function prepareBreezeTtsText(value: string): string {
  return normalizeSpeech(value, (text, save) => text.replace(/\[[^\]\r\n]+\]|\([^()\r\n]+\)/gu, tag =>
    BREEZE_AUDIO_TAGS.has(tag) ? save(tag) : tag.startsWith('[') ? ' ' : tag), tag => BREEZE_AUDIO_TAGS.has(tag))
}

/** Remove documented Breeze audio tags for surfaces that cannot synthesize them, such as browser speech. */
export function stripBreezeAudioTags(value: string): string {
  return value.replace(/\[[^\]\r\n]+\]|\([^()\r\n]+\)/gu, tag => BREEZE_AUDIO_TAGS.has(tag) ? ' ' : tag)
}

export interface TtsSentenceSplit {
  sentences: string[]
  remainder: string
  /** How many characters of the input were consumed (sentences plus skipped code blocks). */
  consumed: number
  /** True when the remainder is an unclosed code block that must not be read aloud. */
  inCode: boolean
}

function blankMarkup(value: string): string {
  return value.replace(/[^\r\n]/gu, character => ' '.repeat(character.length))
}

export function maskCode(value: string, regions: readonly [number, number][]): string {
  let result = ''
  let offset = 0
  for (const [start, end] of regions) {
    result += value.slice(offset, start) + blankMarkup(value.slice(start, end))
    offset = end
  }
  return removeIndentedCode(result + value.slice(offset), true)
}

/** Hold unfinished syntax in raw deltas so subsequent tokens cannot retract spoken text. */
export function stableSpeechMarkdown(value: string): string {
  const { regions, pendingStart } = findFencedCodeRegions(value)
  const source = maskCode(value.slice(0, pendingStart ?? value.length), regions)
    .replace(MARKDOWN_REFERENCE_DEFINITION_RE, blankMarkup)
  let end = findSpeechMarkup(source, true, tag => isKnownXiaomiAudioTag(tag) || BREEZE_AUDIO_TAGS.has(tag)).pending
  const lineStart = source.lastIndexOf('\n', end - 1) + 1
  if (/^[ \t]{0,3}(?:[~`*_=-][ \t]*)+$/u.test(source.slice(lineStart, end))) end = lineStart
  // A trailing bang can still become the first character of `![` or `!=`.
  if (source[end - 1] === '!' && end === value.length
    && (end === 1 || /[\s\w]/u.test(source[end - 2]!))) end -= 1
  return value.slice(0, end)
}

/** Split an accumulated model delta at completed sentence-ending punctuation, skipping fenced code blocks whole. */
export function splitCompletedTtsSentences(value: string, prepared = false): TtsSentenceSplit {
  const { regions, pendingStart } = prepared ? { regions: [], pendingStart: null } : findFencedCodeRegions(value)
  const limit = pendingStart ?? value.length
  const source = prepared ? value : maskCode(value, regions)
  const masked = source.split('')
  const hide = (start: number, end: number): void => { masked.fill('\u0000', start, end) }
  for (const tag of source.matchAll(XIAOMI_AUDIO_TAG_PATTERN)) hide(tag.index, tag.index + tag[0].length)
  for (const entity of source.matchAll(HTML_ENTITY)) hide(entity.index, entity.index + entity[0].length)
  if (!prepared) {
    const { spans } = findSpeechMarkup(source.slice(0, limit), false, tag => isKnownXiaomiAudioTag(tag) || BREEZE_AUDIO_TAGS.has(tag))
    for (const { start, end } of spans) hide(start, end)
    for (const pattern of [MARKDOWN_REFERENCE_DEFINITION_RE, ...ADDRESS_PATTERNS]) {
      for (const match of source.matchAll(pattern)) {
        const start = match.index + (pattern === MARKDOWN_REFERENCE_DEFINITION_RE ? match[1]!.length : 0)
        hide(start, match.index + (pattern === MARKDOWN_REFERENCE_DEFINITION_RE ? match[0].length : addressEnd(match[0])))
      }
    }
  }
  const boundaryText = masked.join('').replace(/!(?==)/gu, '\u0000')
  const boundary = /[。！？!?；;.\r\n]+[”’）】》〕\]}'"]*(?:[ \t]*\r?\n)*(?:(?<![\r\n])[ \t]*)?/gu
  const sentences: string[] = []
  let sentenceStart = 0
  let consumed = 0

  const splitSegment = (from: number, to: number): void => {
    boundary.lastIndex = from
    let match: RegExpExecArray | null
    while ((match = boundary.exec(boundaryText)) !== null) {
      const end = match.index + match[0].length
      if (end > to) {
        // Trailing whitespace in the boundary can reach into the indentation of
        // a following code block. Keep the text up to the block instead of
        // dropping the sentence because the match crossed the region start.
        if (match.index < to) {
          const sentence = source.slice(sentenceStart, to)
          if (sentence.trim().length > 0) sentences.push(sentence)
          sentenceStart = to
          consumed = to
        }
        break
      }
      // A trailing digit and period may still grow into a decimal in the next update.
      if (match[0] === '.' && /\d/u.test(value[match.index - 1] ?? '')
        && (/\d/u.test(value[end] ?? '') || end === value.length)) continue
      // A boundary match that is only whitespace (e.g. a lone newline after a code
      // fence) must not become a sentence of its own, or TTS would read a stray dot.
      const sentence = source.slice(sentenceStart, end)
      if (sentence.trim().length > 0) sentences.push(sentence)
      sentenceStart = end
      consumed = end
    }
  }

  let pos = 0
  for (const [start, end] of regions) {
    if (start >= limit) break
    if (pos < start) splitSegment(pos, Math.min(start, limit))
    sentenceStart = Math.max(sentenceStart, end)
    consumed = Math.max(consumed, end)
    pos = end
  }
  if (pos < limit) splitSegment(pos, limit)

  if (pendingStart !== null) {
    // An unclosed fence must stay buffered until it closes; never read it aloud.
    return { sentences, remainder: value.slice(pendingStart), consumed: pendingStart, inCode: true }
  }
  return { sentences, remainder: source.slice(consumed), consumed, inCode: false }
}
