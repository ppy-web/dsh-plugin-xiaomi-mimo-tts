import { BooleanActivity } from './plugin-activity.js'

/** Observe only the Host composer; plugin forms and unrelated editors never hold this gate. */
export class ComposerInputActivity extends BooleanActivity {
  private enabled = false
  private editor: Element | null = null
  private observer: MutationObserver | null = null

  constructor(private readonly document: Document) { super() }

  configure(enabled: boolean): void {
    if (!enabled) { this.dispose(); return }
    if (this.enabled) return
    this.enabled = true
    this.document.addEventListener('focusin', this.onFocus)
    this.document.addEventListener('focusout', this.onFocus)
    this.document.addEventListener('input', this.refresh)
    this.document.defaultView?.addEventListener('focus', this.refresh)
    this.document.defaultView?.addEventListener('blur', this.refresh)
    this.observer = new MutationObserver(records => {
      const editor = this.editor
      if (editor && (!editor.isConnected || records.some(record => editor.contains(record.target)))) this.refresh()
    })
    this.observer.observe(this.document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['contenteditable', 'aria-disabled'] })
    this.refresh()
  }

  dispose(): void {
    this.enabled = false
    this.observer?.disconnect()
    this.observer = null
    this.document.removeEventListener('focusin', this.onFocus)
    this.document.removeEventListener('focusout', this.onFocus)
    this.document.removeEventListener('input', this.refresh)
    this.document.defaultView?.removeEventListener('focus', this.refresh)
    this.document.defaultView?.removeEventListener('blur', this.refresh)
    this.editor = null
    this.publish(false)
  }

  private onFocus = (): void => { queueMicrotask(this.refresh) }

  private refresh = (): void => {
    if (!this.enabled) return
    this.editor = this.document.activeElement?.closest('[data-composer-input]') ?? null
    this.publish(this.document.hasFocus() && this.editor !== null && this.editor.isConnected
      && this.editor.getAttribute('contenteditable') !== 'false' && this.editor.getAttribute('aria-disabled') !== 'true'
      && (this.editor.textContent ?? '').trim().length > 0)
  }
}
