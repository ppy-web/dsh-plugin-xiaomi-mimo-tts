import { useEffect, useRef, useState } from 'react'

/** Shared disclosure behavior for the Xiaomi preset menus. */
export function usePresetDropdown(minimal: boolean, disabled: boolean) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (minimal || !open) return
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer)
  }, [minimal, open])

  useEffect(() => {
    if (!minimal && disabled) setOpen(false)
  }, [disabled, minimal])

  return { open, setOpen, rootRef }
}
