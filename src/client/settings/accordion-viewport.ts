import { useEffect, useLayoutEffect, useRef } from 'react'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' && typeof document !== 'undefined' && typeof document.createElement === 'function' ? useLayoutEffect : useEffect

/** Keep the clicked panel anchored while its siblings collapse. */
export function useAccordionViewport(open: boolean, onToggle: () => void) {
  const panel = useRef<HTMLDivElement | null>(null)
  const anchor = useRef<number | null>(null)

  useIsomorphicLayoutEffect(() => {
    const region = panel.current
    const section = region?.closest<HTMLElement>('.xmimo-ui-accordion')
    const content = region?.firstElementChild as HTMLElement | null
    if (!open || !region || !section || !content) return
    const scrollers: HTMLElement[] = []
    for (let parent = section.parentElement; parent; parent = parent.parentElement) {
      if (parent !== document.scrollingElement && /auto|scroll/.test(getComputedStyle(parent).overflowY)) scrollers.push(parent)
    }
    const page = document.scrollingElement as HTMLElement | null
    if (page && !/hidden|clip/.test(getComputedStyle(page).overflowY)) scrollers.push(page)
    const header = section.querySelector<HTMLElement>('.xmimo-ui-module-header')
    const siblings = Array.from(section.parentElement?.querySelectorAll<HTMLElement>('.xmimo-ui-accordion-collapse') ?? [])
    let cachedBounds = { top: 12, bottom: window.innerHeight - 12 }
    const measureBounds = () => {
      const viewport = window.visualViewport
      let top = viewport?.offsetTop ?? 0
      let bottom = top + (viewport?.height ?? window.innerHeight)
      for (const scroller of scrollers) {
        if (scroller === page) continue
        const rect = scroller.getBoundingClientRect()
        top = Math.max(top, rect.top + scroller.clientTop)
        bottom = Math.min(bottom, rect.top + scroller.clientTop + scroller.clientHeight)
      }
      cachedBounds = { top: top + 12, bottom: bottom - 12 }
      return cachedBounds
    }
    const sizeContent = () => {
      const { top, bottom } = measureBounds()
      const headerHeight = header?.offsetHeight ?? 0
      content.style.maxHeight = `${Math.max(0, bottom - top - headerHeight - 2)}px`
    }
    sizeContent()
    let frame = 0
    let cancelled = false
    const startedAt = performance.now()
    const cancel = () => { cancelled = true; cancelAnimationFrame(frame) }
    const align = (now: number) => {
      if (cancelled || anchor.current === null) return
      const { top, bottom } = cachedBounds
      const rect = section.getBoundingClientRect()
      const target = Math.max(top, Math.min(anchor.current, bottom - rect.height))
      let remaining = rect.top - target
      if (Math.abs(remaining) >= 1) {
        for (const scroller of scrollers) {
          if (Math.abs(remaining) < 1) break
          const maxScroll = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
          const current = scroller.scrollTop
          const next = Math.max(0, Math.min(maxScroll, current + remaining))
          const applied = next - current
          if (Math.abs(applied) >= 0.5) {
            scroller.scrollTo({ top: next, behavior: 'instant' })
            remaining -= applied
          }
        }
      }
      if (now - startedAt < 450 && siblings.some(element => element.getAnimations().some(animation => animation.playState === 'running'))) {
        frame = requestAnimationFrame(align)
      }
    }
    frame = requestAnimationFrame(align)
    window.addEventListener('resize', sizeContent)
    window.visualViewport?.addEventListener('resize', sizeContent)
    // A deliberate user gesture takes precedence over automatic positioning.
    const gestures = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const
    for (const event of gestures) window.addEventListener(event, cancel, { passive: true })
    // Updating a child's height during observer delivery can resize its observed parent.
    let sizeFrame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(sizeFrame)
      sizeFrame = requestAnimationFrame(sizeContent)
    })
    for (const scroller of scrollers) if (scroller !== page) observer.observe(scroller)
    return () => {
      cancel()
      observer.disconnect()
      cancelAnimationFrame(sizeFrame)
      window.removeEventListener('resize', sizeContent)
      window.visualViewport?.removeEventListener('resize', sizeContent)
      for (const event of gestures) window.removeEventListener(event, cancel)
    }
  }, [open])

  return { panel, toggle: () => {
    anchor.current = open ? null : panel.current?.closest('.xmimo-ui-accordion')?.getBoundingClientRect().top ?? null
    onToggle()
  } }
}
