import { startTransition, useEffect, useId, useState, type ReactElement, type ReactNode } from 'react'
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
  const [mounted, setMounted] = useState(() => expanded || typeof document === 'undefined')
  if (expanded && !mounted) setMounted(true)

  // Warm up collapsed accordion panels during browser idle time so their first
  // open transition glides immediately instead of stalling on initial mount.
  useEffect(() => {
    if (mounted || typeof window === 'undefined') return
    let cancelled = false
    const warm = (): void => {
      if (!cancelled) startTransition(() => setMounted(true))
    }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm, { timeout: 900 })
      return () => { cancelled = true; window.cancelIdleCallback(handle) }
    }
    const timer = window.setTimeout(warm, 420)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [mounted])

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
      <div className="xmimo-ui-accordion-content">{mounted ? children : null}</div>
    </div>
  </ModuleShell>
}
