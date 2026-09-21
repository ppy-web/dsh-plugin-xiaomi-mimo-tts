import type { ReactElement, ReactNode } from 'react'

export interface ModuleShellProps {
  className: string
  title: ReactNode
  summary?: ReactNode
  action?: ReactNode
  children: ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
  toggleClassName?: string
  headingClassName?: string
  ariaLabel?: string | undefined
}

/** Shared DOM frame for settings cards. Content modules only own their body. */
export function ModuleShell({ className, title, summary, action, children, collapsible = false, open = false, onToggle, toggleClassName = '', headingClassName = '', ariaLabel }: ModuleShellProps): ReactElement {
  const heading = <span className={`xmimo-ui-module-head xmimo-ui-module-heading ${headingClassName}`.trim()}>
    <strong>{title}</strong>
    {summary}
  </span>

  return <section className={`xmimo-ui-module ${className}`.trim()}>
    <header className="xmimo-ui-module-header">
      {collapsible
        ? <button type="button" className={`xmimo-ui-module-toggle ${toggleClassName}`.trim()} aria-expanded={open} aria-label={ariaLabel} onClick={onToggle}>{heading}</button>
        : <div className="xmimo-ui-module-toggle xmimo-ui-module-toggle-static">{heading}</div>}
      {action ? <div className="xmimo-ui-module-decoration">{action}</div> : null}
    </header>
    <div className="xmimo-ui-module-body">{children}</div>
  </section>
}
