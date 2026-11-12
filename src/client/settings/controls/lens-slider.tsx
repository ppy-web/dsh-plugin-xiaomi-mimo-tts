import type { CSSProperties, ReactElement } from 'react'
import type { SettingsRangeProps } from './use-settings-range.js'
import { useSettingsRange } from './use-settings-range.js'

export function LensSlider({ minimal = false, ...props }: SettingsRangeProps & { minimal?: boolean }): ReactElement {
  const { inputProps, dragging, pointerFocused, progress } = useSettingsRange(props)
  const style: CSSProperties & { '--slider-progress': number } = { '--slider-progress': progress }

  return <span
    className={minimal ? 'xmimo-tts-slider xmimo-tts-slider-minimal' : 'xmimo-tts-slider'}
    data-dragging={dragging}
    data-disabled={inputProps.disabled}
    data-pointer-focused={pointerFocused}
    style={style}
  >
    <span className="xmimo-tts-slider-rail" aria-hidden="true"><span className="xmimo-tts-slider-track" /></span>
    {minimal ? null : <span className="xmimo-tts-slider-lens" aria-hidden="true"><span className="xmimo-tts-slider-track" /></span>}
    <span className="xmimo-tts-slider-knob" aria-hidden="true">
      <span className="xmimo-tts-slider-value">{inputProps['aria-valuetext']}</span>
    </span>
    <input {...inputProps} />
  </span>
}
