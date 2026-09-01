#!/usr/bin/env node
/**
 * Interactive filter test server.
 *
 * Usage:
 *   pnpm text
 *   # or: node test/filter-test-server.mjs
 *
 * Opens http://localhost:3081 in the default browser automatically.
 */
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareTtsText } from '../lib/shared.js'

const PORT = 3081
const __dirname = dirname(fileURLToPath(import.meta.url))

const htmlPath = resolve(__dirname, 'filter-test.html')
const fixturePath = resolve(__dirname, 'fixtures', 'full-markdown.md')

const html = readFileSync(htmlPath, 'utf8')
const fixture = existsSync(fixturePath)
  ? readFileSync(fixturePath, 'utf8').replace(/\r\n/g, '\n')
  : '(no fixture found)'

// Parse sections from fixture markers: <!-- ===== Title ===== -->
const parts = fixture.split(/^<!-- ===== (.+?) ===== -->\n?/m)
const sections = []
for (let i = 1; i < parts.length; i += 2) {
  const title = parts[i]?.trim()
  const content = parts[i + 1]
  if (content === undefined) continue
  sections.push({ title, content })
}
if (sections.length === 0 && fixture.trim()) {
  sections.push({ title: '全文', content: fixture })
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  if (url.pathname === '/api/fixture' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ sections }))
    return
  }

  if (url.pathname === '/api/filter-batch' && req.method === 'POST') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      try {
        const { texts } = JSON.parse(body)
        if (!Array.isArray(texts)) throw new Error('texts must be an array')
        const results = texts.map(t => (typeof t === 'string' ? prepareTtsText(t) : ''))
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ results }))
      } catch (e) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  // Serve the static test page
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(html)
})

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`
  console.log(`\n  🧪 TTS 过滤器测试面板\n`)
  console.log(`  打开浏览器访问: ${url}\n`)
  console.log(`  按 Ctrl+C 停止服务器\n`)

  // Auto-open the page in the default browser
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [url], { stdio: 'ignore' }).unref()
    }
  } catch {
    // Browser auto-open is best-effort; the URL above still works.
  }
})
