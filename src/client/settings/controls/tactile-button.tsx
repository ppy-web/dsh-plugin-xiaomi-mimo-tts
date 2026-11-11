import type { ComponentPropsWithRef, ReactElement } from 'react'

export function TactileButton({ children, className, type = 'button', ...props }: ComponentPropsWithRef<'button'>): ReactElement {
  return <button {...props} type={type} className={className ? `xmimo-tactile-control ${className}` : 'xmimo-tactile-control'}>
    <span className="xmimo-tactile-face">{children}</span>
  </button>
}
