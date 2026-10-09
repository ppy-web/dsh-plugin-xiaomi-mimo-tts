import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const skill = await readFile(new URL('../skills/whale-girl/SKILL.md', import.meta.url), 'utf8')
const memoryReadme = await readFile(new URL('../skills/whale-girl/memory/README.md', import.meta.url), 'utf8')
const diary = await readFile(new URL('../skills/whale-girl/memory/diary.md', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('ships the whale-girl preset and its local skill resources', () => {
  assert.ok(packageJson.files.includes('skills'))
  assert.equal(packageJson.icon, './assets/plugin-icons/avatar.png')
  assert.match(patch, /id: preset-whale-girl/u)
  assert.match(patch, /id: whale-girl/u)
  assert.match(patch, /name: '鲸鱼娘'/u)
  assert.match(patch, /includeRuntimeContext: true/u)
  assert.match(patch, /dsh-tool-fs-search/u)
  assert.equal((patch.match(/sampleOverCapGlobResults: false/gu) ?? []).length, 1)
  assert.match(patch, /dsh-tool-fs/u)
  assert.match(patch, /dsh-tool-pwsh/u)
  assert.equal(packageJson.dependencies?.['dsh-meme'], undefined)
  assert.equal(patch.includes('dsh-meme'), false)
  assert.match(patch, /process\.platform !== 'win32'/u)
})
