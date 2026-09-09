import type { SoundCue } from './types.js'

export function classifyClick(target: EventTarget | null): SoundCue | null {
  if (!(target instanceof Element)) return null
  if (target.closest('[data-xmimo-sound-preview]') !== null) return null
  const element = target.closest<HTMLElement>("button, a, [role='button'], [role='switch'], [role='checkbox'], [aria-pressed]")
  if (element === null || element instanceof HTMLButtonElement && element.disabled || element.getAttribute('aria-disabled') === 'true') return null

  const label = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''}`.toLowerCase()
  const className = typeof element.className === 'string' ? element.className.toLowerCase() : ''
  if (/关闭|取消|close|cancel/.test(label)) return 'close'
  if (/发送|提交|send|submit|go/.test(label)) return 'send'
  if (/删除|清空|移除|delete|clear|trash|remove/.test(label)) return 'delete'
  if (element.getAttribute('role') === 'switch' || element.getAttribute('role') === 'checkbox' || element.hasAttribute('aria-pressed')) return 'toggle-on'
  if (element.tagName === 'A' || element.getAttribute('role') === 'link') return 'open'
  if (/primary|accent|send/.test(className)) return 'select'
  return 'press'
}
