export interface FencedCodeRegions {
  regions: Array<[number, number]>
  pendingStart: number | null
}

interface SourceLine {
  start: number
  /** Exclusive end offset, including a trailing carriage return but excluding the line feed. */
  end: number
  text: string
}

const BLOCKQUOTE_PREFIX = /^[ \t]{0,3}>[ \t]?/
const FENCE_LINE = /^([ \t]*)(`{3,}|~{3,})([^\r\n]*)/
const LIST_ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/
const THEMATIC_BREAK = /^[ \t]{0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/
const ATX_HEADING = /^[ \t]{0,3}#{1,6}(?:[ \t]|$)/

function sourceLines(value: string): SourceLine[] {
  const lines: SourceLine[] = []
  let start = 0
  for (let index = 0; index <= value.length; index += 1) {
    if (index === value.length || value[index] === '\n') {
      const textEnd = index > start && value[index - 1] === '\r' ? index - 1 : index
      lines.push({ start, end: index, text: value.slice(start, textEnd) })
      start = index + 1
    }
  }
  return lines
}

function indentWidth(value: string): number {
  let width = 0
  for (const character of value) {
    if (character === ' ') width += 1
    else if (character === '\t') width += 4 - (width % 4)
    else break
  }
  return width
}

/** Remove up to `limit` blockquote markers so nested containers can be measured. */
function stripBlockquote(value: string, limit = Number.POSITIVE_INFINITY): { content: string; depth: number } {
  let content = value
  let depth = 0
  while (depth < limit) {
    const match = BLOCKQUOTE_PREFIX.exec(content)
    if (match === null) break
    content = content.slice(match[0].length)
    depth += 1
  }
  return { content, depth }
}

function listItem(value: string): { indent: number; contentIndent: number } | null {
  if (THEMATIC_BREAK.test(value)) return null
  const match = LIST_ITEM.exec(value)
  if (match === null) return null
  const indent = indentWidth(match[1]!)
  const spaces = indentWidth(match[3]!)
  return { indent, contentIndent: indent + match[2]!.length + Math.min(spaces, 4) }
}

/** Track the content indentation of open list items so nested fences are not mistaken for top-level ones. */
class ListContext {
  private indents: number[] = []
  private depth = 0

  reset(depth: number): void {
    if (depth === this.depth) return
    this.depth = depth
    this.indents = []
  }

  close(indent: number): void {
    while (this.indents.length > 0 && this.indents[this.indents.length - 1]! > indent) this.indents.pop()
  }

  open(indent: number, contentIndent: number): void {
    this.close(indent)
    this.indents.push(contentIndent)
  }

  get contentIndent(): number {
    return this.indents[this.indents.length - 1] ?? 0
  }

  get inside(): boolean {
    return this.indents.length > 0
  }
}

interface OpenFence {
  start: number
  marker: string
  /** Blockquote depth the fence belongs to. */
  depth: number
  /** List content indentation the fence belongs to; 0 at the document level. */
  listIndent: number
  /** End offset of the last line still inside the fence, used when its container closes first. */
  lastEnd: number
}

/** Preserve raw Markdown boundaries until complete and unfinished code have been excluded. */
export function findFencedCodeRegions(value: string): FencedCodeRegions {
  const regions: Array<[number, number]> = []
  const lists = new ListContext()
  let open: OpenFence | null = null

  for (const line of sourceLines(value)) {
    if (open !== null) {
      const stripped = stripBlockquote(line.text, open.depth)
      if (stripped.content.trim() === '') {
        // Blank lines do not close a blockquote or a list container.
        open.lastEnd = line.end
        continue
      }
      const indent = indentWidth(stripped.content)
      if (stripped.depth < open.depth || indent < open.listIndent) {
        // The quote or list item that contained this fence has ended, so the
        // unfinished fence must not swallow the rest of the document.
        regions.push([open.start, open.lastEnd])
        open = null
      } else {
        const fence = FENCE_LINE.exec(stripped.content)
        if (fence !== null && fence[2]![0] === open.marker[0] && fence[2]!.length >= open.marker.length && fence[3]!.trim().length === 0) {
          regions.push([open.start, line.end])
          open = null
          continue
        }
        open.lastEnd = line.end
        continue
      }
    }

    const stripped = stripBlockquote(line.text)
    if (stripped.content.trim() === '') continue
    lists.reset(stripped.depth)
    const item = listItem(stripped.content)
    if (item !== null) {
      lists.open(item.indent, item.contentIndent)
      continue
    }
    const indent = indentWidth(stripped.content)
    lists.close(indent)
    const fence = FENCE_LINE.exec(stripped.content)
    if (fence === null) continue
    if (!(indent <= 3 || (lists.inside && indent >= lists.contentIndent))) continue
    const marker = fence[2]!
    if (marker[0] === '`' && fence[3]!.includes('`')) continue
    open = {
      start: line.start,
      marker,
      depth: stripped.depth,
      listIndent: lists.inside ? lists.contentIndent : 0,
      lastEnd: line.end,
    }
  }

  return { regions, pendingStart: open?.start ?? null }
}

export function removeFencedCode(value: string): string {
  const { regions, pendingStart } = findFencedCodeRegions(value)
  let text = ''
  let start = 0
  for (const [from, to] of regions) {
    text += `${value.slice(start, from)} `
    start = to
  }
  return text + value.slice(start, pendingStart ?? value.length)
}

/**
 * Remove indented code while keeping indented list content and paragraph
 * continuations. A real indented code block needs four columns beyond the
 * current list container and cannot interrupt a paragraph.
 */
export function removeIndentedCode(value: string): string {
  const output: string[] = []
  const lists = new ListContext()
  let inCode = false
  let codeIndent = 0
  let previousBlank = true

  for (const line of sourceLines(value)) {
    const stripped = stripBlockquote(line.text)
    if (inCode) {
      if (stripped.content.trim() === '') {
        output.push('')
        continue
      }
      if (indentWidth(stripped.content) >= codeIndent) {
        output.push('')
        continue
      }
      inCode = false
    }
    if (stripped.content.trim() === '') {
      output.push('')
      previousBlank = true
      continue
    }
    lists.reset(stripped.depth)
    const indent = indentWidth(stripped.content)
    lists.close(indent)
    if (previousBlank && indent >= lists.contentIndent + 4) {
      inCode = true
      codeIndent = lists.contentIndent + 4
      output.push('')
      continue
    }
    const item = listItem(stripped.content)
    if (item !== null) lists.open(item.indent, item.contentIndent)
    output.push(line.text)
    // A heading or thematic break ends any paragraph, so indented code may
    // start on the next line without a blank separator.
    previousBlank = ATX_HEADING.test(stripped.content) || THEMATIC_BREAK.test(stripped.content)
  }

  return output.join('\n')
}
