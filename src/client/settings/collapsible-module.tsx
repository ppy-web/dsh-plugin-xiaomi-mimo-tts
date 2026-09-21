import type { ReactElement, ReactNode } from 'react'
import { ModuleShell } from './module-shell.js'

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

  return <ModuleShell
    className={className}
    title={title}
    summary={summary}
    action={action}
    collapsible
    open={open}
    onToggle={onToggle}
    toggleClassName={toggleClassName}
    headingClassName={headingClassName}
    ariaLabel={ariaLabel}
  >
    <div className={collapseClass} aria-hidden={!open} {...inertProps}>
      {children}
    </div>
  </ModuleShell>
}
