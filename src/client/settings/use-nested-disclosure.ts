import { useEffect, useState, type ReactEventHandler } from 'react'

/** Native More settings disclosures reset when their containing accordion closes. */
export function useNestedDisclosure(parentOpen: boolean, forceOpen: boolean) {
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { if (!parentOpen) setExpanded(false) }, [parentOpen])
  const onToggle: ReactEventHandler<HTMLDetailsElement> = event => {
    if (!forceOpen && parentOpen) setExpanded(event.currentTarget.open)
  }
  return { open: forceOpen || (parentOpen && expanded), onToggle }
}
