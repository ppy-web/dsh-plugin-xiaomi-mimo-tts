import type { ReactElement, SVGAttributes } from 'react'

const BARS = [
  { x: 4, height: 8, delayMs: 0 },
  { x: 8, height: 16, delayMs: 50 },
  { x: 12, height: 10, delayMs: 200 },
  { x: 16, height: 14, delayMs: 330 },
  { x: 20, height: 8, delayMs: 440 },
] as const

export function AnimatedAudioLines({ size = 16, ...props }: SVGAttributes<SVGSVGElement> & { size?: number }): ReactElement {
  return <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    {BARS.map(({ x, height, delayMs }) => <line
      key={x}
      className="xmimo-tts-audio-line"
      x1={x}
      x2={x}
      y1={12 - height / 2}
      y2={12 + height / 2}
      style={{ animationDelay: `${delayMs}ms` }}
    />)}
  </svg>
}
