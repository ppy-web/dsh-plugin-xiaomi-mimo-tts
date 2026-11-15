import { BooleanActivity } from './plugin-activity.js'

// The official voice-input UI exposes capture phases through this attribute.
// Keep this optional adapter independent of its CSS, translated labels and bundle.
const ACTIVE_VOICE_INPUT = '[data-voice-activity="requesting"], [data-voice-activity="recording"], [data-voice-activity="transcribing"]'
const VOICE_INPUT = '[data-voice-activity]'

/** Blocks audio while the official composer requests, records or transcribes speech. */
export class VoiceInputActivity extends BooleanActivity {
  private observer: MutationObserver | null = null

  constructor(private readonly document: Document) { super() }

  start(): void {
    if (this.observer !== null) return
    this.observer = new MutationObserver(records => {
      // Chat text streams produce many unrelated child mutations. Only rescan
      // when a voice row changes, mounts or disappears with its composer.
      if (records.some(record => record.type === 'attributes' || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => {
        if (node.nodeType !== 1) return false
        const element = node as Element
        return element.matches(VOICE_INPUT) || element.querySelector(VOICE_INPUT) !== null
      }))) this.refresh()
    })
    this.observer.observe(this.document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-voice-activity'],
    })
    this.refresh()
  }

  dispose(): void {
    this.observer?.disconnect()
    this.observer = null
    this.publish(false)
  }

  private refresh = (): void => {
    // A queued callback after disposal must not reclaim audio permission.
    if (this.observer !== null) this.publish(this.document.querySelector(ACTIVE_VOICE_INPUT) !== null)
  }
}
