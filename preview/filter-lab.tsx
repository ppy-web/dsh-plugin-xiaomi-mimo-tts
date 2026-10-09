import { useMemo, useState } from 'react'
import { prepareTtsText } from '../src/shared.js'

type PreviewLocale = 'zh' | 'en'

interface FixtureSection {
  title: string
  content: string
}

const fixtureModules = import.meta.glob<string>('../test/fixtures/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
})

const fixturePaths = Object.keys(fixtureModules).sort()

function parseSections(raw: string): FixtureSection[] {
  const parts = raw.replace(/\r\n/g, '\n').split(/^<!-- ===== (.+?) ===== -->\n?/m)
  const sections: FixtureSection[] = []
  for (let index = 1; index < parts.length; index += 2) {
    const content = parts[index + 1]
    if (content !== undefined) sections.push({ title: parts[index]!.trim(), content })
  }
  if (sections.length === 0 && raw.trim()) sections.push({ title: '全文', content: raw })
  return sections
}

export function FilterLab({ locale }: { locale: PreviewLocale }) {
  const [fixturePath, setFixturePath] = useState(fixturePaths[0] ?? '')
  const [draft, setDraft] = useState('')
  const fixture = fixtureModules[fixturePath] ?? ''
  const sections = useMemo(() => parseSections(fixture), [fixture])
  const results = useMemo(() => sections.map((section) => prepareTtsText(section.content)), [sections])
  const draftResult = useMemo(() => prepareTtsText(draft), [draft])
  const inputLength = sections.reduce((total, section) => total + section.content.length, 0)
  const outputLength = results.reduce((total, result) => total + result.length, 0)
  const reduction = inputLength > 0 ? ((1 - outputLength / inputLength) * 100).toFixed(1) : '0.0'
  const zh = locale === 'zh'

  return <section className="preview-filter-lab" aria-label={zh ? '文本过滤测试' : 'Text filter lab'}>
    <header className="preview-filter-heading">
      <div>
        <h1>{zh ? '文本过滤测试' : 'Text filter lab'}</h1>
        <p>{zh ? '直接运行当前源码的 prepareTtsText；修改源码或 Markdown fixture 后自动更新。' : 'Runs prepareTtsText from the current source. Source and Markdown fixture edits update automatically.'}</p>
      </div>
      <label>
        <span>{zh ? '测试文件' : 'Fixture'}</span>
        <select value={fixturePath} onChange={(event) => setFixturePath(event.target.value)}>
          {fixturePaths.map((path) => <option value={path} key={path}>{path.split('/').at(-1)}</option>)}
        </select>
      </label>
    </header>

    <div className="preview-filter-summary" role="status">
      {zh
        ? `${sections.length} 段 · 输入 ${inputLength} 字 → 输出 ${outputLength} 字 · 精简 ${reduction}%`
        : `${sections.length} sections · ${inputLength} input chars → ${outputLength} output chars · ${reduction}% shorter`}
    </div>

    <section className="preview-filter-custom" aria-label={zh ? '自定义文本' : 'Custom text'}>
      <div className="preview-filter-section-title">
        <strong>{zh ? '实时输入' : 'Live input'}</strong>
        <span>{draft.length} → {draftResult.length}</span>
      </div>
      <div className="preview-filter-columns">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={zh ? '在这里粘贴或输入 Markdown，即时查看过滤结果…' : 'Paste or type Markdown here to see the filtered result…'}
          aria-label={zh ? '待过滤文本' : 'Text to filter'}
          spellCheck={false}
        />
        <pre aria-label={zh ? '过滤结果' : 'Filtered result'}>{draftResult || (zh ? '（全部移除或尚未输入）' : '(empty or not entered yet)')}</pre>
      </div>
    </section>

    {sections.map((section, index) => <section className="preview-filter-fixture" key={`${fixturePath}:${index}`}>
      <div className="preview-filter-section-title">
        <strong>{index + 1}. {section.title}</strong>
        <span>{section.content.length} → {results[index]?.length ?? 0}</span>
        <button type="button" onClick={() => setDraft(section.content)}>{zh ? '复制到实时输入' : 'Copy to live input'}</button>
      </div>
      <div className="preview-filter-columns">
        <pre aria-label={zh ? '原始文本' : 'Original text'}>{section.content}</pre>
        <pre aria-label={zh ? '过滤结果' : 'Filtered result'}>{results[index] || (zh ? '（全部移除）' : '(all removed)')}</pre>
      </div>
    </section>)}
  </section>
}
