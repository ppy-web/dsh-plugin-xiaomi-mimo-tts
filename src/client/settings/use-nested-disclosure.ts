import { useEffect, useRef } from 'react'

/** Native More settings disclosures reset when their containing accordion closes. */
export function useNestedDisclosure(parentOpen: boolean) {
  const ref = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (!parentOpen && ref.current) ref.current.open = false }, [parentOpen])
  return ref
}
