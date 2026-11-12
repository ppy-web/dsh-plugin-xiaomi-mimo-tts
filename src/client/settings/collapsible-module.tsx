import { useId, type ReactElement, type ReactNode } from 'react'
import { ModuleShell } from './module-shell.js'
import { useAccordionViewport } from './accordion-viewport.js'
import { useSettingsSearch } from './settings-search-context.js'
import type { SearchGroup } from './settings-search.js'

export interface CollapsibleModuleProps {
  className: string
  title: ReactNode
  summary?: ReactNode
  interactiveSummary?: boolean
  open: boolean
  onToggle: () => void
  ariaLabel?: string
  searchGroups?: readonly SearchGroup[]
  children: ReactNode
}

export function CollapsibleModule({ className, title, summary, interactiveSummary = false, open, onToggle, ariaLabel, searchGroups, children }: CollapsibleModuleProps): ReactElement {
  const id = useId()
  const { result } = useSettingsSearch()
  const filtering = result !== null && searchGroups !== undefined
  const hidden = filtering && !searchGroups.some(group => result.groups.has(group))
  const expanded = filtering ? !hidden : open
  const { panel, toggle } = useAccordionViewport(!filtering && open, onToggle)

  return <ModuleShell
    className={`xmimo-ui-accordion ${className}`}
    title={title}
    summary={filtering ? null : summary}
    interactiveSummary={interactiveSummary}
    collapsible={!filtering}
    open={open}
    onToggle={toggle}
    toggleId={`${id}-trigger`}
    controlsId={`${id}-panel`}
    ariaLabel={ariaLabel}
    hidden={hidden}
  >
    <div id={`${id}-panel`} role="region" aria-labelledby={filtering ? undefined : `${id}-trigger`} aria-label={filtering ? ariaLabel : undefined}
      className={`xmimo-ui-accordion-collapse${expanded ? ' xmimo-ui-accordion-collapse-open' : ''}`}
      aria-hidden={!expanded} ref={element => { panel.current = element; if (element) element.inert = !expanded }}>
      <div className="xmimo-ui-accordion-content">{children}</div>
    </div>
  </ModuleShell>
}
