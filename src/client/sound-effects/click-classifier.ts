import type { SoundCue } from './types.js'

export function classifyClick(target: EventTarget | null): SoundCue | null {
  if (!(target instanceof Element)) return null
  if (target.closest('[data-xmimo-sound-toggle]') !== null) return null
  if (target.closest('[data-xmimo-sound-preview]') !== null) return null
  if (target.closest('[data-xmimo-sound-pack-option]') !== null) return null
  const selectOption = target.closest<HTMLElement>('[data-xmimo-select-option]')
  if (selectOption !== null) {
    const radio = selectOption.querySelector<HTMLInputElement>('input[type="radio"]')
    if (radio?.disabled) return null
    return 'select'
  }
  const element = target.closest<HTMLElement>("button, a, [role='button'], [role='switch'], [role='checkbox'], [aria-checked], [aria-pressed]")
  if (element === null || element instanceof HTMLButtonElement && element.disabled || element.getAttribute('aria-disabled') === 'true') return null

  const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''} ${element.textContent ?? ''}`.toLowerCase()
  const className = typeof element.className === 'string' ? element.className.toLowerCase() : ''
  const role = element.getAttribute('role')
  const isToggle = role === 'switch' || role === 'checkbox' || element.hasAttribute('aria-checked') || element.hasAttribute('aria-pressed')
  if (/(?:停止(?:生成|任务|语音|朗读)|中断(?:生成|语音|朗读)|取消(?:语音)?生成|\bstop\b|\babort\b|\bcancel(?:\s+\w+){0,2}\s+generation\b)/.test(label)) return 'stop'
  if (isToggle) {
    const currentState = element.getAttribute('aria-checked') ?? element.getAttribute('aria-pressed')
    if (currentState?.toLowerCase() === 'true') return 'toggle-off'
    return 'toggle-on'
  }
  if (/关闭|取消|close|cancel/.test(label)) return 'close'
  if (/发送|提交|send|submit|go/.test(label)) return 'send'
  if (/删除|清空|移除|delete|clear|trash|remove/.test(label)) return 'delete'
  if (element.tagName === 'A' || element.getAttribute('role') === 'link') return 'open'
  if (/primary|accent|send/.test(className)) return 'select'
  return 'press'
}
