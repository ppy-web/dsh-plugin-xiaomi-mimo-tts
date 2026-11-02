import { createElement } from 'react'
import type { ButtonHTMLAttributes, ChangeEvent, ReactElement, ReactNode } from 'react'

export function extractMarkdownPlainText(value: string): string { return value }

/** Preserve the native button contract at the browser UI boundary in component tests. */
export function Button({ variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return createElement('button', props)
}

/** Server-render the closed selector without mounting the Host's portaled menu. */
export function Menu({ anchor }: { anchor: ReactElement }) { return anchor }
export function IconChevronDownOutlineRegular() { return null }

/** Keep informational tags readable without importing the host stylesheet. */
export function Tag({ tone, className, children }: { tone?: string; className?: string; children?: ReactNode }) {
  return createElement('span', { 'data-tone': tone, className }, children)
}

/** Keep checked, disabled and accessible-label semantics for Host switches. */
export function Switch({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: (checked: boolean) => void }) {
  return createElement('input', { type: 'checkbox', role: 'switch', checked, disabled, 'aria-label': label,
    onChange: (event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.checked) })
}
