import { useLayoutEffect, useRef } from 'react'

/** Keep the clicked panel anchored while its siblings collapse. */
export function useAccordionViewport(open: boolean, onToggle: () => void) {
  const panel = useRef<HTMLDivElement>(null)
  const anchor = useRef<number | null>(null)

  useLayoutEffect(() => {
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
    const bounds = () => {
      const viewport = window.visualViewport
      let top = viewport?.offsetTop ?? 0
      let bottom = top + (viewport?.height ?? window.innerHeight)
      for (const scroller of scrollers) {
        if (scroller === page) continue
        const rect = scroller.getBoundingClientRect()
        top = Math.max(top, rect.top + scroller.clientTop)
        bottom = Math.min(bottom, rect.top + scroller.clientTop + scroller.clientHeight)
      }
      return { top: top + 12, bottom: bottom - 12 }
    }
    const sizeContent = () => {
      const { top, bottom } = bounds()
      const header = section.querySelector<HTMLElement>('.xmimo-ui-module-header')!
      content.style.maxHeight = `${Math.max(0, bottom - top - header.offsetHeight - 2)}px`
    }
    sizeContent()
    let frame = 0
    let cancelled = false
    const cancel = () => { cancelled = true; cancelAnimationFrame(frame) }
    const align = () => {
      if (cancelled || anchor.current === null) return
      const { top, bottom } = bounds()
      const rect = section.getBoundingClientRect()
      const target = Math.max(top, Math.min(anchor.current, bottom - rect.height))
      for (const scroller of scrollers) {
        const delta = section.getBoundingClientRect().top - target
        if (Math.abs(delta) < 1) break
        scroller.scrollTo({ top: scroller.scrollTop + delta, behavior: 'instant' })
      }
      const siblings = section.parentElement?.querySelectorAll<HTMLElement>('.xmimo-ui-accordion-collapse') ?? []
      if (Array.from(siblings).some(element => element.getAnimations().some(animation => animation.playState === 'running'))) {
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
