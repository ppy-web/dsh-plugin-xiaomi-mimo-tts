import { BooleanActivity } from './plugin-activity.js'

const ACTIVE_HOST_READ_ALOUD = '[data-read-aloud="loading"], [data-read-aloud="playing"]'
const HOST_READ_ALOUD = '[data-read-aloud]'

/**
 * Watches the host's native read-aloud button phase (`data-read-aloud`) so
 * plugin playback yields automatically whenever host read-aloud is active.
 */
export class HostReadAloudActivity extends BooleanActivity {
  private observer: MutationObserver | null = null
  private enabled = false

  constructor(private readonly document: Document) {
    super()
  }

  private sync(): void {
    this.publish(this.enabled && this.document.querySelector(ACTIVE_HOST_READ_ALOUD) !== null)
  }

  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return
    this.enabled = enabled
    if (!enabled) {
      this.observer?.disconnect()
      this.observer = null
      this.publish(false)
      return
    }
    const observer = new MutationObserver(records => {
      if (this.observer !== observer) return
      const changed = records.some(record => record.type === 'attributes'
        || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => {
          if (node.nodeType !== 1) return false
          const element = node as Element
          return element.matches(HOST_READ_ALOUD) || element.querySelector(HOST_READ_ALOUD) !== null
        }))
      if (changed) this.sync()
    })
    this.observer = observer
    observer.observe(this.document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-read-aloud'],
    })
    this.sync()
  }

  dispose(): void {
    this.enabled = false
    this.observer?.disconnect()
    this.observer = null
    this.publish(false)
  }
}
