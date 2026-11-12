import type { ReactElement, ReactNode } from 'react'

export interface ModuleShellProps {
  className: string
  title: ReactNode
  summary?: ReactNode
  interactiveSummary?: boolean
  action?: ReactNode
  children: ReactNode
  collapsible?: boolean
  open?: boolean
  onToggle?: () => void
  toggleClassName?: string
  headingClassName?: string
  ariaLabel?: string | undefined
  toggleId?: string
  controlsId?: string
  hidden?: boolean
}

/** Shared DOM frame for settings cards. Content modules only own their body. */
export function ModuleShell({ className, title, summary, interactiveSummary = false, action, children, collapsible = false, open = false, onToggle, toggleClassName = '', headingClassName = '', ariaLabel, toggleId, controlsId, hidden }: ModuleShellProps): ReactElement {
  const toggleProps = {
    type: 'button' as const,
    id: toggleId,
    'aria-controls': controlsId,
    'aria-expanded': open,
    'aria-label': ariaLabel ?? (typeof title === 'string' ? title : undefined),
    onClick: onToggle,
  }
  const heading = <span className={`xmimo-ui-module-head xmimo-ui-module-heading ${headingClassName}`.trim()}>
    <strong>{title}</strong>
    {summary}
  </span>

  return <section className={`xmimo-ui-module ${className}`.trim()} hidden={hidden}>
    <header className="xmimo-ui-module-header">
      {collapsible && interactiveSummary
        ? <div className={`xmimo-ui-module-toggle ${toggleClassName}`.trim()}>
          <div className={`xmimo-ui-module-head xmimo-ui-module-heading ${headingClassName}`.trim()}>
            <h3 className="xmimo-ui-accordion-heading xmimo-ui-interactive-heading">
              <button {...toggleProps} className="xmimo-ui-module-title-toggle"><strong>{title}</strong></button>
            </h3>
            {summary}
          </div>
        </div>
        : collapsible
        ? <h3 className="xmimo-ui-accordion-heading"><button {...toggleProps}
          className={`xmimo-ui-module-toggle ${toggleClassName}`.trim()}>
          {heading}
        </button></h3>
        : <div className="xmimo-ui-module-toggle xmimo-ui-module-toggle-static">{heading}</div>}
      {action ? <div className="xmimo-ui-module-decoration">{action}</div> : null}
    </header>
    <div className="xmimo-ui-module-body">{children}</div>
  </section>
}
