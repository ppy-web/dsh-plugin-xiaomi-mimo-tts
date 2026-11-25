import {
  STUDIO_DEFAULT_PAUSE_MS,
  STUDIO_MAX_LINE_CHARACTERS,
  STUDIO_MAX_LINES_PER_SCRIPT,
  STUDIO_MAX_PAUSE_MS,
  normalizeStudioPauseMs,
  pickStudioRoleColor,
} from '../types/studio.js'
import type { StudioLine, StudioRole } from '../types/studio.js'

export interface ParsedStudioScriptLine {
  roleName: string
  roleId?: string
  text: string
  speechInstruction?: string
  pauseAfterMs: number
}

export interface MaterializedStudioScript {
  lines: StudioLine[]
  createdRoles: StudioRole[]
}

const SPEAKER_LINE_PATTERN = /^("(?:[^"\\]|\\.)*"|[^":：()（）[\]【】{}]{1,32}?)(?:\s*\{([a-zA-Z0-9_-]{1,80})\})?(?:\s*[（(]("(?:[^"\\]|\\.)*"|[^()（）]+)[)）])?(?:\s*(?:\[([^\][\n]{1,60})\]|【([^】【\n]{1,60})】))?\s*[:：]\s*(.+)$/u
const FLEX_STAGE_TOKEN_PATTERN = /\s*(?:[（(]("(?:[^"\\]|\\.)*"|[^()（）]+)[)）]|\[([^\][\n]{1,60})\]|【([^】【\n]{1,60})】)/yu
const MARKDOWN_LINE_PREFIX_PATTERN = /^(?:>\s*|[-*+•]\s+|\d+[.)、]\s+)/u
const ROLE_SEPARATOR_PATTERN = /(?:\s*[·•・∙⋅‧|｜/／—]+\s*|\s+[-–]\s+)/gu
const PAUSE_TOKEN_PATTERN = /^(?:停顿|间隔|留白|pause|wait)?\s*(\d+(?:\.\d+)?)\s*(ms|毫秒|s|sec|秒)$/iu
const TRAILING_PAUSE_PATTERN = /\s*(?:\[(?:停顿|间隔|留白|pause|wait)\s*(\d+(?:\.\d+)?)\s*(ms|毫秒|s|sec|秒)\]|【(?:停顿|间隔|留白|pause|wait)\s*(\d+(?:\.\d+)?)\s*(ms|毫秒|s|sec|秒)】)\s*$/iu
const QUOTED_DIALOGUE_PREFIX = '@"'
const NARRATOR_ALIAS_KEYS = new Set(['旁白', 'narrator'])

export class StudioScriptParseError extends Error {
  readonly status: number

  constructor(readonly code: 'text-too-long' | 'studio-line-limit-exceeded' | 'invalid-role-name', readonly lineNumber: number) {
    const message = code === 'text-too-long' ? 'Dialogue exceeds the character limit.'
      : code === 'studio-line-limit-exceeded' ? 'Script exceeds the line limit.'
      : 'Speaker name must be 1..32 characters.'
    super('Line ' + lineNumber + '. ' + message)
    this.status = code === 'invalid-role-name' ? 400 : 413
  }
}

function quotedText(value: string): string | undefined {
  if (!value.startsWith('"') || !value.endsWith('"')) return
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed === 'string') return parsed
  } catch { /* ordinary text with a quotation mark */ }
}

function parsePauseToken(raw: string): number | null {
  const match = raw.trim().match(PAUSE_TOKEN_PATTERN)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount) || amount < 0) return null
  const unit = match[2]!.toLowerCase()
  const ms = unit === 'ms' || unit === '毫秒' ? amount : amount * 1000
  return Math.min(STUDIO_MAX_PAUSE_MS, Math.max(0, Math.round(ms)))
}

function splitStageNotes(notes: readonly { kind: 'paren' | 'bracket'; raw: string }[]): { speechInstruction?: string; pauseAfterMs: number } {
  let pauseAfterMs = STUDIO_DEFAULT_PAUSE_MS
  const instructionParts: string[] = []

  for (const item of notes) {
    const raw = item.raw
    if (!raw) continue
    if (item.kind === 'paren') {
      const literalInstruction = quotedText(raw)
      if (literalInstruction !== undefined) {
        if (literalInstruction) instructionParts.push(literalInstruction)
        continue
      }
    }
    const tokens = raw.split(/[,，;|｜/]+/u).map(part => part.trim()).filter(Boolean)
    for (const token of tokens) {
      const parsedPause = parsePauseToken(token)
      if (parsedPause !== null) pauseAfterMs = parsedPause
      else instructionParts.push(token)
    }
  }

  const speechInstruction = instructionParts.join('，').trim()
  return {
    ...(speechInstruction ? { speechInstruction } : {}),
    pauseAfterMs,
  }
}

function unwrapMarkdownSpeaker(raw: string): string {
  let value = raw.trim()
  for (let i = 0; i < 3; i += 1) {
    const bold = value.match(/^(?:\*\*|__)([\s\S]+?)(?:\*\*|__)$/u)
    if (bold) {
      value = bold[1]!.trim()
      continue
    }
    const bracketed = value.match(/^(?:【([^】【]+)】|\[([^\][]+)\])$/u)
    if (bracketed) {
      value = (bracketed[1] ?? bracketed[2] ?? '').trim()
      continue
    }
    break
  }
  return value.replace(/^(?:\*\*|__)|(?:\*\*|__)$/gu, '').trim()
}

interface MatchedSpeakerLine {
  roleName: string
  roleId?: string
  notes: Array<{ kind: 'paren' | 'bracket'; raw: string }>
  dialogue: string
}

function parseFlexibleSpeakerLine(raw: string): MatchedSpeakerLine | null {
  const cleaned = raw.replace(MARKDOWN_LINE_PREFIX_PATTERN, '').trim()
  if (!cleaned || cleaned.startsWith('"')) return null
  const colonMatch = cleaned.match(/^(.+?)\s*[:：]\s*(.+)$/u)
  if (!colonMatch) return null
  const header = unwrapMarkdownSpeaker(colonMatch[1]!)
  const dialogue = colonMatch[2]!
  if (!header || !dialogue.trim()) return null

  const lead = header.match(/^(?:【([^】【\n]{1,32})】|\[([^\][\n]{1,32})\]|([^":：()（）[\]【】{}]{1,32}?))(?:\s*\{([a-zA-Z0-9_-]{1,80})\})?(?=\s*$|\s*[（([【])/u)
  if (!lead) return null
  const roleName = unwrapMarkdownSpeaker((lead[1] ?? lead[2] ?? lead[3])!)
  if (!roleName || [...roleName].length > 32) return null

  const notes: Array<{ kind: 'paren' | 'bracket'; raw: string }> = []
  let cursor = lead[0].length
  while (cursor < header.length) {
    FLEX_STAGE_TOKEN_PATTERN.lastIndex = cursor
    const token = FLEX_STAGE_TOKEN_PATTERN.exec(header)
    if (!token) return null
    if (token[1] !== undefined) notes.push({ kind: 'paren', raw: token[1] })
    else notes.push({ kind: 'bracket', raw: (token[2] ?? token[3])! })
    cursor = FLEX_STAGE_TOKEN_PATTERN.lastIndex
  }
  return {
    roleName,
    ...(lead[4] ? { roleId: lead[4] } : {}),
    notes,
    dialogue,
  }
}

function matchSpeakerLine(trimmed: string): MatchedSpeakerLine | null {
  const exact = trimmed.match(SPEAKER_LINE_PATTERN)
  if (exact) {
    const rawSpeaker = exact[1]!
    const isQuoted = rawSpeaker.startsWith('"') && rawSpeaker.endsWith('"')
    const decoded = isQuoted ? (quotedText(rawSpeaker) ?? rawSpeaker).trim() : unwrapMarkdownSpeaker(rawSpeaker.replace(MARKDOWN_LINE_PREFIX_PATTERN, ''))
    if (decoded) {
      const notes: Array<{ kind: 'paren' | 'bracket'; raw: string }> = []
      if (exact[3] !== undefined) notes.push({ kind: 'paren', raw: exact[3] })
      if ((exact[4] ?? exact[5]) !== undefined) notes.push({ kind: 'bracket', raw: (exact[4] ?? exact[5])! })
      return {
        roleName: decoded,
        ...(exact[2] ? { roleId: exact[2] } : {}),
        notes,
        dialogue: exact[6]!,
      }
    }
  }
  return parseFlexibleSpeakerLine(trimmed)
}

/** Normalize whitespace, width, casing, and common title separators so role lookups stay stable across minor typography differences. */
export function normalizeStudioRoleName(name: string): string {
  return name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(ROLE_SEPARATOR_PATTERN, '·')
    .toLowerCase()
}

function splitStudioRoleSegments(name: string): string[] {
  return normalizeStudioRoleName(name)
    .split('·')
    .map(part => part.trim())
    .filter(Boolean)
}

export interface MatchStudioRoleOptions {
  /** Allow unambiguous primary-name / subtitle / narrator alias matches (default true). */
  allowAliasMatch?: boolean
}

/**
 * Resolve a speaker label against existing Studio roles, preferring exact matches first,
 * then typography-normalized full names, then unambiguous `主名 · 标签` or narrator aliases.
 */
export function findMatchingStudioRole(
  roles: readonly StudioRole[],
  rawSpeakerName: string,
  explicitRoleId?: string,
  options?: MatchStudioRoleOptions,
): StudioRole | undefined {
  if (explicitRoleId) {
    const byId = roles.find(role => role.id === explicitRoleId)
    if (byId) return byId
  }

  const exactKey = rawSpeakerName.trim().toLowerCase()
  if (!exactKey) return undefined

  const exactMatch = roles.find(role => role.name.trim().toLowerCase() === exactKey)
  if (exactMatch) return exactMatch

  const normalizedKey = normalizeStudioRoleName(rawSpeakerName)
  const normalizedMatch = roles.find(role => normalizeStudioRoleName(role.name) === normalizedKey)
  if (normalizedMatch) return normalizedMatch

  if (options?.allowAliasMatch === false) return undefined

  const roleSegments = roles.map(role => ({ role, segments: splitStudioRoleSegments(role.name) }))

  const primaryMatches = roleSegments.filter(entry => entry.segments.length > 1 && entry.segments[0] === normalizedKey)
  if (primaryMatches.length === 1) return primaryMatches[0]!.role

  const tagMatches = roleSegments.filter(entry => entry.segments.length > 1 && entry.segments.slice(1).includes(normalizedKey))
  if (tagMatches.length === 1) return tagMatches[0]!.role

  const speakerSegments = splitStudioRoleSegments(rawSpeakerName)
  if (speakerSegments.length > 1) {
    const speakerPrimary = speakerSegments[0]!
    const speakerRest = speakerSegments.slice(1).join('·')
    const compoundMatches = roleSegments.filter(entry => {
      if (entry.segments.length <= 1 || entry.segments[0] !== speakerPrimary) return false
      const roleRest = entry.segments.slice(1).join('·')
      return roleRest.includes(speakerRest) || speakerRest.includes(roleRest)
    })
    if (compoundMatches.length === 1) return compoundMatches[0]!.role
  }

  if (NARRATOR_ALIAS_KEYS.has(normalizedKey)) {
    const builtinNarrator = roles.find(role => role.id === 'builtin-narrator')
    if (builtinNarrator) return builtinNarrator
    const narratorMatches = roleSegments.filter(entry => entry.segments.some(part => part.includes('旁白') || part.includes('narrator')))
    if (narratorMatches.length === 1) return narratorMatches[0]!.role
  }

  return undefined
}

function extractTrailingPause(text: string): { cleanText: string; pauseAfterMs?: number } {
  const literal = text.startsWith(QUOTED_DIALOGUE_PREFIX) ? quotedText(text.slice(1)) : undefined
  if (literal !== undefined) return { cleanText: literal.trim() }
  const match = text.match(TRAILING_PAUSE_PATTERN)
  if (!match) return { cleanText: text.trim() }
  const numberPart = match[1] ?? match[3]
  const unitPart = match[2] ?? match[4]
  const parsed = numberPart && unitPart ? parsePauseToken(`${numberPart}${unitPart}`) : null
  const cleanText = text.slice(0, match.index).trim()
  return parsed !== null && cleanText ? { cleanText, pauseAfterMs: parsed } : { cleanText: text.trim() }
}

/**
 * Parse raw multi-role script text into structured speaker lines.
 * Supports `角色（情绪）[停顿 0.8s]：台词`, multi-line continuations, and plain narration lines.
 */
export function parseStudioScriptLines(rawText: string, defaultNarratorName = '旁白'): ParsedStudioScriptLine[] {
  const rawLines = rawText.replace(/\r\n?/gu, '\n').split('\n')
  const result: ParsedStudioScriptLine[] = []

  const validateText = (text: string, lineNumber: number): void => {
    if ([...text].length > STUDIO_MAX_LINE_CHARACTERS) throw new StudioScriptParseError('text-too-long', lineNumber)
  }
  const appendLine = (line: ParsedStudioScriptLine, lineNumber: number): void => {
    if (!line.roleName || [...line.roleName].length > 32) throw new StudioScriptParseError('invalid-role-name', lineNumber)
    validateText(line.text, lineNumber)
    if (result.length >= STUDIO_MAX_LINES_PER_SCRIPT) throw new StudioScriptParseError('studio-line-limit-exceeded', lineNumber)
    result.push(line)
  }

  for (const [index, rawLine] of rawLines.entries()) {
    const lineNumber = index + 1
    const trimmed = rawLine.trim()
    if (!trimmed || /^#+\s+/u.test(trimmed) || /^[-=]{3,}$/u.test(trimmed)) continue

    const matched = matchSpeakerLine(trimmed)
    if (matched) {
      const stage = splitStageNotes(matched.notes)
      const trailing = extractTrailingPause(matched.dialogue)
      if (!trailing.cleanText) continue
      appendLine({
        roleName: matched.roleName,
        ...(matched.roleId ? { roleId: matched.roleId } : {}),
        text: trailing.cleanText,
        ...(stage.speechInstruction ? { speechInstruction: stage.speechInstruction } : {}),
        pauseAfterMs: trailing.pauseAfterMs ?? stage.pauseAfterMs,
      }, lineNumber)
      continue
    }

    const trailing = extractTrailingPause(trimmed)
    if (!trailing.cleanText) continue
    const previous = result.at(-1)
    if (previous) {
      const combined = `${previous.text}\n${trailing.cleanText}`
      validateText(combined, lineNumber)
      previous.text = combined
      if (trailing.pauseAfterMs !== undefined) previous.pauseAfterMs = trailing.pauseAfterMs
      continue
    }

    appendLine({
      roleName: defaultNarratorName.trim(),
      text: trailing.cleanText,
      pauseAfterMs: trailing.pauseAfterMs ?? STUDIO_DEFAULT_PAUSE_MS,
    }, lineNumber)
  }

  return result
}

/**
 * Bind parsed lines to existing roles by name, creating fallback roles for any new character names.
 */
export function materializeStudioScript(
  rawText: string,
  existingRoles: readonly StudioRole[],
  createRole: (name: string, color: string, index: number) => StudioRole,
  createLineId: () => string,
  defaultNarratorName = '旁白',
): MaterializedStudioScript {
  const parsed = parseStudioScriptLines(rawText, defaultNarratorName)
  const pool: StudioRole[] = [...existingRoles]
  const createdRoles: StudioRole[] = []
  const lines: StudioLine[] = []

  for (const item of parsed) {
    let role = findMatchingStudioRole(pool, item.roleName, item.roleId)
    if (!role) {
      const nextIndex = pool.length
      role = createRole(item.roleName.trim(), pickStudioRoleColor(nextIndex), nextIndex)
      pool.push(role)
      createdRoles.push(role)
    }
    lines.push({
      id: createLineId(),
      roleId: role.id,
      text: item.text,
      ...(item.speechInstruction ? { speechInstruction: item.speechInstruction } : {}),
      pauseAfterMs: normalizeStudioPauseMs(item.pauseAfterMs),
    })
  }

  return { lines, createdRoles }
}

/**
 * Format structured Studio lines back into editable script text.
 */
export function formatStudioScriptText(
  lines: readonly StudioLine[],
  roles: readonly StudioRole[],
  fallbackRoleName = '旁白',
): string {
  const roleMap = new Map(roles.map(role => [role.id, role]))
  const nameCounts = new Map<string, number>()
  for (const role of roles) {
    const key = normalizeStudioRoleName(role.name)
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1)
  }
  return lines.map(line => {
    const role = roleMap.get(line.roleId)
    const speaker = role?.name ?? fallbackRoleName
    const speakerLabel = /^#+\s|[":：()（）[\]【】{}\r\n]/u.test(speaker) ? JSON.stringify(speaker) : speaker
    const roleId = role && (nameCounts.get(normalizeStudioRoleName(role.name)) ?? 0) > 1 ? `{${role.id}}` : ''
    const note = line.speechInstruction?.trim() ?? ''
    const noteLabel = /[()（）\r\n]/u.test(note) || splitStageNotes([{ kind: 'paren', raw: note }]).speechInstruction !== note
      ? JSON.stringify(note)
      : note
    const instruction = note ? `（${noteLabel}）` : ''
    const pause = line.pauseAfterMs !== STUDIO_DEFAULT_PAUSE_MS
      ? line.pauseAfterMs % 1000 === 0
        ? `[停顿 ${line.pauseAfterMs / 1000}s]`
        : `[停顿 ${line.pauseAfterMs}ms]`
      : ''
    const text = /[\r\n]/u.test(line.text) || TRAILING_PAUSE_PATTERN.test(line.text) || line.text.startsWith(QUOTED_DIALOGUE_PREFIX)
      ? '@' + JSON.stringify(line.text)
      : line.text
    return `${speakerLabel}${roleId}${instruction}${pause}：${text}`
  }).join('\n')
}
