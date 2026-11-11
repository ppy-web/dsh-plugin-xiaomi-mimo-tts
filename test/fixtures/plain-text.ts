import { createElement } from 'react'
import type { ButtonHTMLAttributes, ChangeEvent, InputHTMLAttributes, ReactElement, ReactNode } from 'react'

export function extractMarkdownPlainText(value: string): string { return value }

/** Preserve the native button contract at the browser UI boundary in component tests. */
export function Button({ variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return createElement('button', props)
}

/** Server-render the closed selector without mounting the Host's portaled menu. */
export function Menu({ anchor }: { anchor: ReactElement }) { return anchor }
export function IconChevronDownOutlineRegular() { return null }
export function IconChevronDownOutlineMedium() { return null }
export function IconRefreshOutlineMedium() { return null }
export function IconCloseOutlineRegular() { return null }

/** Preserve shortcut children while leaving portaled positioning to browser checks. */
export function Tooltip({ children }: { children: ReactNode }) { return children }

/** Closed overlays have no outside-pointer work during server rendering. */
export function useDismissOnOutsidePointer() {}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return createElement('input', props) }

export function SegmentedControl({ value, options, label, disabled, onChange }: { value: string; options: readonly { value: string; label: ReactNode }[]; label: string; disabled?: boolean; onChange: (value: string) => void }) {
  return createElement('div', { role: 'group', 'aria-label': label }, options.map(option =>
    createElement('button', { key: option.value, type: 'button', 'aria-pressed': value === option.value, disabled, onClick: () => onChange(option.value) }, option.label)))
}

/** Keep informational tags readable without importing the host stylesheet. */
export function Tag({ tone, className, children }: { tone?: string; className?: string; children?: ReactNode }) {
  return createElement('span', { 'data-tone': tone, className }, children)
}

/** Keep checked, disabled and accessible-label semantics for Host switches. */
export function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return createElement('input', { type: 'checkbox', role: 'switch', checked, disabled, 'aria-label': label,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked) })
}

/** Render modal contents without the host portal in component tests. */
export function Modal({ children }: { children: ReactNode }) { return createElement('div', { role: 'dialog' }, children) }
