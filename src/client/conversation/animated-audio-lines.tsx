import { domAnimation, LazyMotion, m } from 'motion/react'
import type { ReactElement, SVGAttributes } from 'react'

const BARS = [
  { x: 4, height: 8, delay: 0 },
  { x: 8, height: 16, delay: 0.05 },
  { x: 12, height: 10, delay: 0.2 },
  { x: 16, height: 14, delay: 0.33 },
  { x: 20, height: 8, delay: 0.44 },
] as const

export function AnimatedAudioLines({ size = 16, ...props }: SVGAttributes<SVGSVGElement> & { size?: number }): ReactElement {
  return <LazyMotion features={domAnimation}><svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    {BARS.map(({ x, height, delay }) => <m.line
      key={x}
      x1={x}
      x2={x}
      y1={12 - height / 2}
      y2={12 + height / 2}
      animate={{ scaleY: [0.44, 1, 0.44] }}
      transition={{ duration: 0.88, delay, repeat: Infinity, ease: 'easeInOut' }}
      style={{ originY: '50%' }}
    />)}
  </svg></LazyMotion>
}
