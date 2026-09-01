#!/usr/bin/env node
/**
 * Markdown filter demo — runs prepareTtsText on every section of the fixture
 * file and prints input vs. output side by section.
 *
 * Usage:
 *   node test/filter-demo.mjs
 *
 * Optionally filter a custom file:
 *   node test/filter-demo.mjs path/to/your.md
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { prepareTtsText } from '../lib/shared.js'

const fixturePath = new URL('./fixtures/full-markdown.md', import.meta.url)
const customPath = process.argv[2] ? resolve(process.argv[2]) : null

const raw = readFileSync(customPath ?? fixturePath, 'utf8').replace(/\r\n/g, '\n')

// Split by section markers: <!-- ===== Title ===== -->
const parts = raw.split(/^<!-- ===== (.+?) ===== -->\n?/m)

const sections = []
for (let i = 1; i < parts.length; i += 2) {
  const title = parts[i]?.trim()
  const content = parts[i + 1]
  if (content === undefined) continue
  sections.push({ title, content })
}

// If no sections found (no markers or custom file), treat the whole file as one section.
if (sections.length === 0 && raw.trim().length > 0) {
  sections.push({ title: '全文', content: raw })
}

let totalIn = 0
let totalOut = 0
const allOutputs = []

for (const { title, content } of sections) {
  const out = prepareTtsText(content)
  totalIn += content.length
  totalOut += out.length
  allOutputs.push(out)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`【${title}】`)
  console.log('-'.repeat(60))
  console.log('原始输入:')
  const lines = content.split('\n')
  for (const line of lines) {
    // Show trailing whitespace visually
    const display = line.replace(/ /g, '·').replace(/\t/g, '→')
    console.log(`  | ${display}`)
  }
  console.log('过滤输出:')
  console.log(`  | ${out}`)
  if (out.length === 0) {
    console.log('  (empty — all content was removed)')
  }
}

// Overall summary
console.log(`\n${'='.repeat(60)}`)
console.log(`统计: ${sections.length} 段, 输入 ${totalIn} 字符 → 输出 ${totalOut} 字符`)
if (totalIn > 0) {
  const reduction = ((1 - totalOut / totalIn) * 100).toFixed(1)
  console.log(`精简率: ${reduction}%`)
}

// Full combined output as one TTS text
console.log(`\n${'='.repeat(60)}`)
console.log('【整体合并输出（模拟完整消息发送给TTS）】')
console.log('-'.repeat(60))
const combined = allOutputs.join(' ').replace(/\s+/g, ' ').trim()
console.log(combined || '(empty)')
console.log(`整体长度: ${combined.length} 字符`)