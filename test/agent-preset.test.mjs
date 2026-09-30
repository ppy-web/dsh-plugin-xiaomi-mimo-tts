import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const patch = await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const skill = await readFile(new URL('../skills/whale-girl/SKILL.md', import.meta.url), 'utf8')
const liangSkill = await readFile(new URL('../skills/liang-wenfeng/SKILL.md', import.meta.url), 'utf8')
const memoryReadme = await readFile(new URL('../skills/whale-girl/memory/README.md', import.meta.url), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const liangBlock = patch.split('- insert:').slice(1).find((block) => block.includes('id: preset-liang-wenfeng')) ?? ''

test('ships the whale-girl preset and its local skill resources', () => {
  assert.ok(packageJson.files.includes('skills'))
  assert.match(patch, /id: preset-whale-girl/u)
  assert.match(patch, /id: whale-girl/u)
  assert.match(patch, /name: '鲸鱼娘'/u)
  assert.match(patch, /includeRuntimeContext: true/u)
  assert.match(patch, /dsh-tool-fs-search/u)
  assert.match(patch, /dsh-tool-fs/u)
  assert.match(patch, /dsh-tool-pwsh/u)
  assert.match(patch, /process\.platform !== 'win32'/u)
})

test('whale-girl skill defines language-aware companionship without former occupational persona', () => {
  for (const marker of ['陪伴', '女仆', '幽默', '安全边界', '明确说“记住这个”']) assert.ok(skill.includes(marker), marker)
  for (const forbidden of ['陈列师', 'FILA', '株洲', '上海市', '中南民族大学']) {
    assert.equal(skill.includes(forbidden), false, forbidden)
    assert.equal(patch.includes(forbidden), false, forbidden)
  }
  assert.ok(memoryReadme.includes('明确要求记住'))
  assert.ok(memoryReadme.includes('密码'))
})

test('ships the liang-wenfeng preset with a persona path and three local tools', () => {
  assert.ok(packageJson.files.includes('skills'))
  assert.ok(liangBlock.length > 0, 'liang-wenfeng preset block should exist')
  assert.match(liangBlock, /id: liang-wenfeng/u)
  assert.match(liangBlock, /name: '梁文峰'/u)
  assert.match(liangBlock, /'skills', 'liang-wenfeng', 'SKILL\.md'/u)
  assert.match(liangBlock, /complete: true/u)
  assert.match(liangBlock, /includeRuntimeContext: true/u)
  for (const tool of ['dsh-tool-fs-search', 'dsh-tool-fs', 'dsh-tool-pwsh']) assert.ok(liangBlock.includes(tool), tool)
  assert.match(liangBlock, /disabled: !!js process\.platform !== 'win32'/u)
})

test('liang-wenfeng skill defines a research-engineering persona with evidence and safety boundaries', () => {
  for (const marker of ['公开资料', '代码', '证据', '安全边界', '开源', '长期', '模型训练', '推理']) {
    assert.ok(liangSkill.includes(marker), marker)
  }
  for (const forbidden of ['湛江', '吴川', '广东', '杭州', '北京', '上海', '大学', '学校', '学院', '父亲', '母亲', '妻子', '子女', '孩子']) {
    assert.equal(liangSkill.includes(forbidden), false, `skill should not mention ${forbidden}`)
    assert.equal(liangBlock.includes(forbidden), false, `preset should not mention ${forbidden}`)
  }
})
