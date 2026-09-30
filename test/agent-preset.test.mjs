import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const skill = await readFile(new URL('../skills/whale-girl/SKILL.md', import.meta.url), 'utf8')
const memoryReadme = await readFile(new URL('../skills/whale-girl/memory/README.md', import.meta.url), 'utf8')
const diary = await readFile(new URL('../skills/whale-girl/memory/diary.md', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const zhLocale = JSON.parse(await readFile(new URL('../locale/zh.json', import.meta.url), 'utf8'))
const enLocale = JSON.parse(await readFile(new URL('../locale/en.json', import.meta.url), 'utf8'))

test('ships the whale-girl preset and its local skill resources', () => {
  assert.ok(packageJson.files.includes('skills'))
  assert.equal(packageJson.icon, './assets/plugin-icons/avatar.png')
  assert.equal(zhLocale.presets.whaleGirl.name, '鲸鱼娘')
  assert.equal(enLocale.presets.whaleGirl.name, 'Whale Maid')
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

test('whale-girl skill defines language-aware companionship without former occupational persona', () => {
  for (const marker of ['陪伴', '女仆', '幽默', '表情包', 'storage.supabase.co', '![表情描述](URL)', '结束语义', 'diary.md', '晚安', '安全边界', '明确说“记住这个”']) assert.ok(skill.includes(marker), marker)
  for (const forbidden of ['陈列师', 'FILA', '株洲', '上海市', '中南民族大学']) {
    assert.equal(skill.includes(forbidden), false, forbidden)
    assert.equal(patch.includes(forbidden), false, forbidden)
  }
  assert.ok(memoryReadme.includes('明确要求记住'))
  assert.ok(memoryReadme.includes('密码'))
  assert.ok(memoryReadme.includes('每次对话最多追加一条'))
  assert.match(diary, /会话日记/u)
})
