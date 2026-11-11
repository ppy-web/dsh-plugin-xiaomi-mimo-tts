import { forwardRef } from 'react'
import type { ComponentPropsWithoutRef, ReactElement } from 'react'

export const TactileButton = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<'button'>>(function TactileButton({ children, className, type = 'button', ...props }, ref): ReactElement {
  return <button {...props} ref={ref} type={type} className={className ? `xmimo-tactile-control ${className}` : 'xmimo-tactile-control'}>
    <span className="xmimo-tactile-face">{children}</span>
  </button>
})
