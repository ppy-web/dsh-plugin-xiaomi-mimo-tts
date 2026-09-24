import type { ReactElement, ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'

export interface SettingFieldHeadingProps {
  label: ReactNode
  suffix?: ReactElement
  overriddenLabel?: string
  resetLabel?: string
  overridden?: boolean
  resettable: boolean
  disabled: boolean
  onReset?: () => void
}

export function SettingFieldHeading({ label, suffix, overriddenLabel, resetLabel, overridden, resettable, disabled, onReset }: SettingFieldHeadingProps): ReactElement {
  return (
    <span className="xmimo-tts-field-heading">
      <span className="xmimo-tts-field-label">
        <span>{label}</span>
        {suffix}
      </span>
      {overridden && overriddenLabel !== undefined ? <span className="xmimo-tts-field-badges">
        <small className="xmimo-tts-overridden">{overriddenLabel}</small>
        {resettable && onReset !== undefined && resetLabel !== undefined ? <Button type="button" variant="ghost" size="sm" className="xmimo-tts-reset" disabled={disabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReset() }}>{resetLabel}</Button> : null}
      </span> : null}
    </span>
  )
}
