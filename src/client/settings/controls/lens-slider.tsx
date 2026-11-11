import type { CSSProperties, ReactElement } from 'react'
import type { SettingsRangeProps } from './use-settings-range.js'
import { useSettingsRange } from './use-settings-range.js'

const LENS_TRACK = <>
  <span className="xmimo-tts-slider-rail" aria-hidden="true"><span className="xmimo-tts-slider-track" /></span>
  <span className="xmimo-tts-slider-lens" aria-hidden="true"><span className="xmimo-tts-slider-track" /></span>
  <span className="xmimo-tts-slider-knob" aria-hidden="true" />
</>

export function LensSlider({ minimal = false, ...props }: SettingsRangeProps & { minimal?: boolean }): ReactElement {
  const { inputProps, dragging, progress } = useSettingsRange(props)
  const style: CSSProperties & { '--slider-progress': number } = { '--slider-progress': progress }

  return <span
    className={minimal ? 'xmimo-tts-slider xmimo-tts-slider-minimal' : 'xmimo-tts-slider'}
    data-dragging={dragging}
    data-disabled={inputProps.disabled}
    style={style}
  >
    {minimal ? null : LENS_TRACK}
    <input {...inputProps} />
  </span>
}
