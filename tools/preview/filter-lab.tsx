import { useMemo, useState } from 'react'
import { en, zh as zhCopy } from '../../src/client/localization.js'
import { readScopeHintKey, readScopeLabelKey } from '../../src/client/settings/voice-reading-options.js'
import { applyTtsPlaybackScope, DEFAULT_TTS_SETTINGS, prepareTtsText, TTS_READ_SCOPES } from '../../src/shared.js'
import type { TtsReadScope } from '../../src/shared.js'

type PreviewLocale = 'zh' | 'en'

interface FixtureSection {
  title: string
  content: string
}

const fixtureModules = import.meta.glob<string>('./fixtures/*.md', {
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

function previewSpeechText(content: string, readScope: TtsReadScope, automatic: boolean): string {
  // Use the same closing cue on every pass so comparisons stay consistent.
  return applyTtsPlaybackScope(readScope === 'concise' ? content : prepareTtsText(content), readScope, automatic, () => 0)
}

export function FilterLab({ locale }: { locale: PreviewLocale }) {
  const [fixturePath, setFixturePath] = useState(fixturePaths[0] ?? '')
  const [draft, setDraft] = useState('')
  const [readScope, setReadScope] = useState<TtsReadScope>(DEFAULT_TTS_SETTINGS.readScope)
  const [automatic, setAutomatic] = useState(true)
  const fixture = fixtureModules[fixturePath] ?? ''
  const sections = useMemo(() => parseSections(fixture), [fixture])
  const results = useMemo(() => sections.map((section) => previewSpeechText(section.content, readScope, automatic)), [sections, readScope, automatic])
  const draftResult = useMemo(() => previewSpeechText(draft, readScope, automatic), [draft, readScope, automatic])
  const inputLength = sections.reduce((total, section) => total + section.content.length, 0)
  const outputLength = results.reduce((total, result) => total + result.length, 0)
  const reduction = inputLength > 0 ? ((1 - outputLength / inputLength) * 100).toFixed(1) : '0.0'
  const zh = locale === 'zh'
  const labels = zh ? zhCopy : en

  return <section className="preview-filter-lab" aria-label={zh ? '文本过滤测试' : 'Text filter lab'}>
    <header className="preview-filter-heading">
      <div>
        <h2>{zh ? '文本过滤测试' : 'Text filter lab'}</h2>
        <p>{zh ? '对照同一段回复在不同朗读范围下的输出。' : 'Compare the spoken text for the same reply across read-aloud ranges.'}</p>
      </div>
      <label>
        <span>{zh ? '测试文件' : 'Fixture'}</span>
        <select value={fixturePath} onChange={(event) => setFixturePath(event.target.value)}>
          {fixturePaths.map((path) => <option value={path} key={path}>{path.split('/').at(-1)}</option>)}
        </select>
      </label>
    </header>

    <div className="preview-filter-controls">
      <label>
        <span>{labels['settings.readScope']}</span>
        <select value={readScope} aria-describedby="preview-filter-range-hint" onChange={(event) => setReadScope(event.currentTarget.value as TtsReadScope)}>
          {TTS_READ_SCOPES.map((scope) => <option value={scope} key={scope}>{labels[readScopeLabelKey(scope)]}</option>)}
        </select>
      </label>
      <label>
        <span>{zh ? '触发方式' : 'Playback trigger'}</span>
        <select value={automatic ? 'automatic' : 'manual'} onChange={(event) => setAutomatic(event.currentTarget.value === 'automatic')}>
          <option value="automatic">{labels['settings.autoPlay']}</option>
          <option value="manual">{zh ? '手动朗读' : 'Manual playback'}</option>
        </select>
      </label>
      <p id="preview-filter-range-hint">{labels[readScopeHintKey(readScope)]}</p>
    </div>

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
