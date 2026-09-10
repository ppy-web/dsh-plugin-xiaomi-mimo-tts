import type { ReactElement, ReactNode } from 'react'

export interface CollapsibleModuleProps {
  className: string
  toggleClassName: string
  headingClassName: string
  collapseClassName: string
  collapseOpenClassName: string
  title: ReactNode
  summary?: ReactNode
  open: boolean
  onToggle: () => void
  ariaLabel?: string
  action?: ReactNode
  children: ReactNode
}

export function CollapsibleModule({ className, toggleClassName, headingClassName, collapseClassName, collapseOpenClassName, title, summary, open, onToggle, ariaLabel, action, children }: CollapsibleModuleProps): ReactElement {
  const inertProps: Record<string, string> = open ? {} : { inert: '' }
  const collapseClass = open ? `${collapseClassName} ${collapseOpenClassName}` : collapseClassName

  return <section className={className}>
    <button
      type="button"
      className={`${toggleClassName} xmimo-ui-module-toggle`}
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={onToggle}
    >
      <span className={`${headingClassName} xmimo-ui-module-head`}>
        <strong>{title}</strong>
        {summary}
      </span>
    </button>
    {action}
    <div className={collapseClass} aria-hidden={!open} {...inertProps}>
      {children}
    </div>
  </section>
}
