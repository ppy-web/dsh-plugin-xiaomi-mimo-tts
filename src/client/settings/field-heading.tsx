import type { ReactElement, ReactNode } from 'react'

export interface SettingFieldHeadingProps {
  label: ReactNode
  suffix?: ReactElement
  overriddenLabel: string
  resetLabel?: string
  overridden: boolean
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
      {overridden ? <span className="xmimo-tts-field-badges">
        <small className="xmimo-tts-overridden">{overriddenLabel}</small>
        {resettable && onReset !== undefined && resetLabel !== undefined ? <button type="button" className="xmimo-tts-reset" disabled={disabled} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onReset() }}>{resetLabel}</button> : null}
      </span> : null}
    </span>
  )
}
