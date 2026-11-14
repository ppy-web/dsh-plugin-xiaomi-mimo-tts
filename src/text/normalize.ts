import { findFencedCodeRegions, removeFencedCode, removeIndentedCode } from './fenced-code.js'
import { XIAOMI_AUDIO_TAG_PATTERN } from './xiaomi-audio-tags.js'

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
const TTS_COMPARISON_OPERATOR = /(?<=[\p{L}\p{N}])\s*([<>])\s*(?=[\p{L}\p{N}])/gu
/** Ellipses and wave dashes carry a sentence-level pause, so keep that cue as a period. */
const TTS_SENTENCE_PAUSE_PUNCTUATION = /[…⋯〜～]+/gu
const TTS_PAUSE_MARKER = ''

const TTS_URL_PATTERN = /\b(?:https?|ftp):\/\/[^\s<>()]+|\bwww\.[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|cn|net|org|io|ai|dev|me|co|edu|gov|xyz|tech|info|app|site|link)(?:[/:?#][^\s<>()]*)?/giu
const TTS_WINDOWS_PATH_PATTERN = /(?:\b[A-Za-z]:[\\/]|\\\\)(?:[A-Za-z0-9._ -]+[\\/])+(?:[A-Za-z0-9._ -]+)/gu
const TTS_UNIX_PATH_PATTERN = /\/(?:[A-Za-z0-9._-]+\/)+(?:[A-Za-z0-9._-]+)/gu
const TTS_RELATIVE_PATH_PATTERN = /(?:\.\.?[\\/])(?:[A-Za-z0-9._-]+[\\/])*(?:[A-Za-z0-9._-]+(?:\.[A-Za-z0-9_-]+)?)/gu
const TTS_PROJECT_PATH_PATTERN = /\b(?:[A-Za-z0-9_-]+[\\/])+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gu

/** Combined Markdown syntax and path removal in a single pass. */
const MARKDOWN_REFERENCE_DEFINITION_RE = /(^|\n)(?:[ \t]*>[ \t]?)*[ \t]*\[[^\]\r\n]+\]:[^\r\n]*(?=\r?\n|$)/g
const MARKDOWN_HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const MARKDOWN_UNCLOSED_HTML_COMMENT_RE = /(^|\n)[ \t]{0,3}<!--[\s\S]*$/g
const MARKDOWN_RAW_HTML_RE = /<(script|style|pre)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const MARKDOWN_IMAGE_REFERENCE_RE = /!\[[^\]\r\n]*\]\[[^\]\r\n]*\]/g
const MARKDOWN_LINK_REFERENCE_RE = /\[([^\]\r\n]*)\]\[[^\]\r\n]*\]/g
const MARKDOWN_FOOTNOTE_REFERENCE_RE = /\[\^[^\]\r\n]+\]/g
const MARKDOWN_IMAGE_RE = /!\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g
const MARKDOWN_LINK_RE = /\[([^\]\r\n]*)\]\([^\)\r\n]*\)/g
/** Only tag-shaped angle brackets are markup; comparisons such as 3<4 survive. */
const MARKDOWN_HTML_TAG_RE = /<\/?[A-Za-z][^<>]*>/g
const MARKDOWN_HEADING_RE = /(^|\n)[ \t]{0,3}#+/g
const MARKDOWN_LIST_RE = /(^|\n)\s*(?:[-*+]|\d+[.)])\s+/g
const MARKDOWN_BLOCKQUOTE_RE = /(^|\n)\s*>\s?/g
const MARKDOWN_TASK_MARKER_RE = /(^|\s)\[[ xX]\](?=\s|$)/g
const MARKDOWN_RULE_RE = /(^|\n)[ \t]{0,3}(?:(?:=[ \t]*)+|(?:-[ \t]*)+|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})[ \t]*(?=\r?\n|$)/g
const MARKDOWN_TABLE_DELIMITER_RE = /(^|\n)[ \t]{0,3}(?=[^\r\n]*\|)[|:\- \t]+(?=\r?\n|$)/g
const MARKDOWN_INLINE_FORMAT_RE = /`+|[*_~]{1,3}/g
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

function removeTtsPaths(value: string): string {
  return value
    .replace(TTS_WINDOWS_PATH_PATTERN, ' ')
    .replace(TTS_RELATIVE_PATH_PATTERN, ' ')
    .replace(TTS_PROJECT_PATH_PATTERN, ' ')
    .replace(TTS_UNIX_PATH_PATTERN, ' ')
}

function removeTtsMarkup(value: string, protect?: (text: string) => string): string {
  let text = removeFencedCode(value)
    .replace(MARKDOWN_REFERENCE_DEFINITION_RE, '$1')
  text = decodeHtmlEntities(removeIndentedCode(text))
    .replace(MARKDOWN_HTML_COMMENT_RE, ' ')
    .replace(MARKDOWN_UNCLOSED_HTML_COMMENT_RE, '$1')
    .replace(MARKDOWN_RAW_HTML_RE, ' ')
    .replace(MARKDOWN_IMAGE_REFERENCE_RE, ' ')
    .replace(MARKDOWN_LINK_REFERENCE_RE, '$1')
    .replace(MARKDOWN_FOOTNOTE_REFERENCE_RE, ' ')
    .replace(MARKDOWN_IMAGE_RE, ' ')
    .replace(MARKDOWN_LINK_RE, '$1')
    .replace(MARKDOWN_HTML_TAG_RE, ' ')
  text = (protect?.(text) ?? text)
    .replace(MARKDOWN_BLOCKQUOTE_RE, '$1')
    .replace(MARKDOWN_RULE_RE, '$1')
    .replace(MARKDOWN_HEADING_RE, '$1')
    .replace(MARKDOWN_LIST_RE, '$1')
    .replace(MARKDOWN_TASK_MARKER_RE, '$1')
    .replace(MARKDOWN_TABLE_DELIMITER_RE, '$1')
  text = stripMarkdownInlineFormat(text).replace(MARKDOWN_TABLE_SEP_RE, ' ')

  text = text.replace(TTS_URL_PATTERN, ' ')
  return removeTtsPaths(text)
}

function removeTtsSymbols(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁠-⁤⁦-⁯﻿]/g, ' ')
    .replace(/(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\p{So}|︎|️|‍|⃣)/gu, ' ')
}

function normalizeTtsComparisons(value: string): string {
  if (!/[<>]/u.test(value)) return value
  const chinese = /\p{Script=Han}/u.test(value)
  return value.replace(TTS_COMPARISON_OPERATOR, (_match, operator: string) => {
    if (operator === '<') return chinese ? ' 小于 ' : ' less than '
    return chinese ? ' 大于 ' : ' greater than '
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
  if (value.length === 0) return ''

  const text = normalizeTtsPunctuation(
    removeTtsSymbols(
      stripBreezeAudioTags(
        removeTtsMarkup(value)
          .replace(/\\[rn]|\/n/gi, ' ')
          .replace(/\r\n?|\n/g, '.'),
      ),
    ),
  )

  return text.replace(/\s+/g, ' ').trim()
}

/** Generic external cleanup preserves only tags explicitly declared by the selected model. */
export function prepareExternalTtsText(value: string, allowedTags: readonly string[] = []): string {
  let text = removeFencedCode(value.replace(/[\uE000-\uE002]/gu, ' '))
  const protectedTags: string[] = []
  for (const tag of [...allowedTags].sort((a, b) => b.length - a.length)) {
    if (!tag) continue
    const marker = `\uE001${protectedTags.length}\uE002`
    protectedTags.push(tag)
    text = text.split(tag).join(marker)
  }
  text = normalizeTtsPunctuation(removeTtsSymbols(removeTtsMarkup(text).replace(/\\[rn]|\/n/gi, ' ').replace(/\r\n?|\n/g, '.')))
    .replace(/\s+/gu, ' ').trim()
  return text.replace(/\uE001(\d+)\uE002/gu, (_match, index: string) => protectedTags[Number(index)] ?? '')
}

/** Preserve MiMo's open tag vocabulary after removing code, links and paths. */
export function prepareXiaomiTtsText(value: string): string {
  const tags: string[] = []
  const protectedText = removeTtsMarkup(value.replace(/[\uE000-\uE002]/gu, ' '), text =>
    text.replace(XIAOMI_AUDIO_TAG_PATTERN, tag => {
      tags.push(tag)
      return `${tags.length - 1}`
    }))
  return prepareTtsText(protectedText).replace(/(\d+)/gu, (_match, index: string) => tags[Number(index)] ?? '')
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
  const tags: string[] = []
  // User text must never forge the private markers used to protect tags.
  const protectedText = value.replace(/[\uE000-\uE002]/gu, ' ').replace(/\[[^\]\r\n]+\]|\([^()\r\n]+\)/gu, tag => {
    if (!BREEZE_AUDIO_TAGS.has(tag)) return tag
    const token = `${tags.length}`
    tags.push(tag)
    return token
  })
  // An unsupported tag would otherwise be spoken as literal words.
  const cleaned = prepareTtsText(protectedText.replace(/\[[^\]\r\n]+\]/gu, ' '))
  return cleaned.replace(/(\d+)/gu, (_match, index: string) => tags[Number(index)] ?? '')
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

/** Split an accumulated model delta at completed sentence-ending punctuation, skipping fenced code blocks whole. */
export function splitCompletedTtsSentences(value: string): TtsSentenceSplit {
  const { regions, pendingStart } = findFencedCodeRegions(value)
  const limit = pendingStart ?? value.length
  const tags = [...value.matchAll(XIAOMI_AUDIO_TAG_PATTERN)]
  const boundary = /[。！？!?；;.\n]+(?:[”’）】》〕\]}'"]*\s*)/gu
  const sentences: string[] = []
  let sentenceStart = 0
  let consumed = 0

  const splitSegment = (from: number, to: number): void => {
    boundary.lastIndex = from
    let match: RegExpExecArray | null
    while ((match = boundary.exec(value)) !== null) {
      if (tags.some(tag => match!.index >= tag.index && match!.index < tag.index + tag[0].length)) continue
      const end = match.index + match[0].length
      if (end > to) {
        // Trailing whitespace in the boundary can reach into the indentation of
        // a following code block. Keep the text up to the block instead of
        // dropping the sentence because the match crossed the region start.
        if (match.index < to) {
          const sentence = value.slice(sentenceStart, to)
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
      const sentence = value.slice(sentenceStart, end)
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
  return { sentences, remainder: value.slice(consumed), consumed, inCode: false }
}
