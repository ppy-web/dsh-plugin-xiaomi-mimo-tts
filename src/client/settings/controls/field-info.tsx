import type { ReactElement } from 'react'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function' ? useLayoutEffect : useEffect

export function FieldInfo({ label, text }: { label: string; text: string }): ReactElement {
  const id = useId()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const tooltip = useRef<HTMLSpanElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  useIsomorphicLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      if (button.current === null || tooltip.current === null) return
      const anchor = button.current.getBoundingClientRect()
      const box = tooltip.current.getBoundingClientRect()
      setPosition({
        left: Math.max(16, Math.min(anchor.left, window.innerWidth - box.width - 16)),
        top: anchor.bottom + box.height + 6 <= window.innerHeight - 16 ? anchor.bottom + 6 : Math.max(16, anchor.top - box.height - 6),
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, text])
  return <span className="xmimo-tts-field-info" onMouseEnter={() => setOpen(true)} onMouseLeave={() => { if (document.activeElement !== button.current) setOpen(false) }}>
    <button
      ref={button}
      type="button"
      className="xmimo-tts-field-info-button"
      aria-label={label}
      aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen(true)}
      onKeyDown={event => {
        if (event.key === 'Escape') { setOpen(false); event.stopPropagation() }
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7h.01" />
      </svg>
    </button>
    {open && typeof document !== 'undefined' ? createPortal(
      <span ref={tooltip} id={id} role="tooltip" className="xmimo-ui-scope xmimo-tts-field-info-tooltip" style={position}>{text}</span>,
      document.body,
    ) : null}
  </span>
}
