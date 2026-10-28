import { ICON_SYMBOLS } from '@deepseek-ai/dsh-client-ui-primitives'

/** ui-theme supplies these symbols in DSH; the standalone preview has no theme service. */
export function installPreviewHostIcons(): () => void {
  const namespace = 'http://www.w3.org/2000/svg'
  const sprite = document.createElementNS(namespace, 'svg')
  sprite.setAttribute('aria-hidden', 'true')
  sprite.setAttribute('width', '0')
  sprite.setAttribute('height', '0')
  sprite.style.position = 'absolute'
  sprite.style.pointerEvents = 'none'
  const omitted = new Set(['width', 'height', 'xmlns', 'class', 'aria-hidden'])
  for (const [id, markup] of Object.entries(ICON_SYMBOLS)) {
    const root = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement
    const symbol = document.createElementNS(namespace, 'symbol')
    symbol.id = id
    for (const { name, value } of Array.from(root.attributes)) if (!omitted.has(name)) symbol.setAttribute(name, value)
    for (const child of Array.from(root.childNodes)) symbol.appendChild(child.cloneNode(true))
    sprite.appendChild(symbol)
  }
  document.body.appendChild(sprite)
  return () => sprite.remove()
}
