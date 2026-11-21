/** Inject one named stylesheet tag idempotently inside browser environments. */
export function ensureClientStyle(id: string, css: string): () => void {
  if (typeof document === 'undefined' || document.head === null) return () => {}
  const existing = document.head.querySelector(`style[data-plugin="xiaomi-mimo-tts"][data-xmimo-style="${id}"]`)
  if (existing !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'xiaomi-mimo-tts'
  style.dataset.xmimoStyle = id
  style.textContent = css
  document.head.appendChild(style)
  return () => style.remove()
}
