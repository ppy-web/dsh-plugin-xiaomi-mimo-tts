import type { ReactElement } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { previewDocumentSectionId } from './preview-copy.js'

export interface ManualCopy {
  title: string
  intro: string
  toc: string
  sections: Array<{
    id: string
    title: string
    summary: string
    items: Array<{ label: string, detail: string }>
    steps?: Array<{ title: string, detail: string, command?: string }>
    table?: { caption: string, headers: string[], rows: string[][] }
    links?: Array<{ label: string, href: string }>
  }>
  notes: Array<{ title: string, body: string }>
}

export function DocumentPage({ copy }: { copy: ManualCopy }): ReactElement {
  const manualRef = useRef<HTMLElement | null>(null)
  const [activeSection, setActiveSection] = useState(() => copy.sections.find(section => window.location.hash === `#${section.id}`)?.id ?? copy.sections[0]?.id ?? '')
  const title = (value: string): string => value.replace(/^\d+\s*·\s*/, '')

  useLayoutEffect(() => {
    const navigate = (): void => {
      const sectionId = previewDocumentSectionId(window.location.hash)
      const section = copy.sections.find(section => section.id === sectionId)
      setActiveSection(section?.id ?? copy.sections[0]?.id ?? '')
      if (section) manualRef.current?.querySelector<HTMLElement>(`#${section.id}`)?.scrollIntoView()
      else window.scrollTo({ top: 0 })
    }
    navigate()
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [copy.sections])

  useEffect(() => {
    const root = manualRef.current
    if (root === null || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      const section = visible[0]?.target
      if (section instanceof HTMLElement) setActiveSection(section.id)
    }, { rootMargin: '-100px 0px -55% 0px', threshold: 0 })
    root.querySelectorAll('.preview-manual-section').forEach(section => observer.observe(section))
    return () => observer.disconnect()
  }, [copy.sections])

  return <article className="preview-manual" ref={manualRef} aria-label={copy.title}>
    <nav className="preview-manual-toc" aria-label={copy.toc}>
      <strong>{copy.toc}</strong>
      {copy.sections.map(section => <a key={section.id} href={`#${section.id}`}
        aria-current={activeSection === section.id ? 'location' : undefined}>{title(section.title)}</a>)}
    </nav>
    <div className="preview-manual-article">
      <header className="preview-manual-intro"><h2>{copy.title}</h2><p>{copy.intro}</p></header>
      {copy.sections.map(section => <section className="preview-manual-section" id={section.id} key={section.id}>
        <h2>{title(section.title)}</h2><p className="preview-manual-summary">{section.summary}</p>
        {section.steps ? <ol className="preview-manual-steps">{section.steps.map(step => <li key={step.title}>
          <h3>{step.title}</h3><p>{step.detail}</p>
          {step.command ? <pre tabIndex={0}><code>{step.command}</code></pre> : null}
        </li>)}</ol> : null}
        {section.table ? <div className="preview-manual-table"><table>
          <caption>{section.table.caption}</caption>
          <thead><tr>{section.table.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead>
          <tbody>{section.table.rows.map(row => <tr key={row[0] + row[1]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
        </table></div> : null}
        <dl>{section.items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.detail}</dd></div>)}</dl>
        {section.links ? <ul>{section.links.map(link => <li key={link.href}><a href={link.href}
          target={link.href.startsWith('#') ? undefined : '_blank'} rel={link.href.startsWith('#') ? undefined : 'noopener noreferrer'}>{link.label}</a></li>)}</ul> : null}
      </section>)}
      <div className="preview-manual-notes">{copy.notes.map(note => <div key={note.title}>
        <strong>{note.title}</strong><p>{note.body}</p>
      </div>)}</div>
    </div>
  </article>
}
