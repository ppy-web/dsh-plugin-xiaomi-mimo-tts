import { BooleanActivity } from './plugin-activity.js'

// The official voice-input UI exposes capture phases through this attribute.
// Keep this optional adapter independent of its CSS, translated labels and bundle.
const RECORDING_VOICE_INPUT = '[data-voice-activity="recording"]'
const ACTIVE_VOICE_INPUT = `[data-voice-activity="requesting"], ${RECORDING_VOICE_INPUT}, [data-voice-activity="transcribing"]`
const VOICE_INPUT = '[data-voice-activity]'
const COMPOSER_VOICE_INPUT = '[data-composer-card] [data-slot="conversation.input.activity"]'
const RECORDING_METER = `${COMPOSER_VOICE_INPUT} ${RECORDING_VOICE_INPUT} > svg[role="img"][viewBox="0 0 640 40"] > line:last-of-type`
const MICROPHONE_BUTTON = 'button:has(svg[data-icon="dsw-icon-microphone-outline-regular"])'
const STOP_RECORDING_BUTTON = 'button:has(svg[data-icon="dsw-icon-stop-fill-regular"])'

/** Recording controls get their cue from the host phase, including keyboard activation. */
export function isComposerRecordingControl(element: Element): boolean {
  return element.matches('.xmimo-caption-voice-button') || (element.closest(COMPOSER_VOICE_INPUT) !== null
    && (element.matches(MICROPHONE_BUTTON) || element.closest(RECORDING_VOICE_INPUT) !== null))
}

/** DSH owns capture, transcribing and draft insertion. Use its control in this composer. */
export function readComposerVoiceInput(seat: Element | null) {
  const slot = seat?.querySelector(COMPOSER_VOICE_INPUT)
  const row = slot?.querySelector(VOICE_INPUT)
  const phase = row?.getAttribute('data-voice-activity') ?? 'idle'
  const controls = phase === 'idle' ? slot : phase === 'recording' || phase === 'feedback' ? row : null
  const button = controls?.querySelector<HTMLButtonElement>(phase === 'recording' ? STOP_RECORDING_BUTTON : MICROPHONE_BUTTON) ?? null
  const label = button?.getAttribute('aria-label') ?? null
  const disabled = button === null || button.matches(':disabled, [aria-disabled="true"]') || button.closest('[hidden], [inert]') !== null
  return { phase, button, label, disabled }
}

/** DSH v0.2.2-rc.4 draws its newest RMS sample in the rightmost bar. */
export function readComposerRecordingLevel(seat: Element | null): number | undefined {
  const line = seat?.querySelector(RECORDING_METER)
  const start = line?.getAttribute('y1')?.trim()
  const end = line?.getAttribute('y2')?.trim()
  if (!start || !end) return undefined
  // The host draws a 2-unit dot at silence and a bar up to 36 units tall.
  const height = Number(end) - Number(start)
  if (!Number.isFinite(height) || height < 2 || height > 36) return undefined
  return (height - 2) / 34
}

/** Blocks audio while the official composer requests, records or transcribes speech. */
export class VoiceInputActivity extends BooleanActivity {
  private observer: MutationObserver | null = null

  constructor(private readonly document: Document) { super() }

  start(onRecordingChange?: (recording: boolean) => void): void {
    if (this.observer !== null) return
    const isRecording = (): boolean => this.document.querySelector(RECORDING_VOICE_INPUT) !== null
    let recording = onRecordingChange !== undefined && isRecording()
    const observer = new MutationObserver(records => {
      if (this.observer !== observer) return
      // Chat text streams produce many unrelated child mutations. Only rescan
      // when a voice row changes, mounts or disappears with its composer.
      const voiceChanged = records.some(record => record.type === 'attributes' || [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node => {
        if (node.nodeType !== 1) return false
        const element = node as Element
        return element.matches(VOICE_INPUT) || element.querySelector(VOICE_INPUT) !== null
      }))
      if (!voiceChanged) return
      this.publish(this.document.querySelector(ACTIVE_VOICE_INPUT) !== null)
      if (onRecordingChange === undefined || this.observer !== observer) return
      const next = isRecording()
      if (next === recording) return
      recording = next
      onRecordingChange(recording)
    })
    this.observer = observer
    observer.observe(this.document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-voice-activity'],
    })
    this.publish(this.document.querySelector(ACTIVE_VOICE_INPUT) !== null)
  }

  dispose(): void {
    this.observer?.disconnect()
    this.observer = null
    this.publish(false)
  }
}
