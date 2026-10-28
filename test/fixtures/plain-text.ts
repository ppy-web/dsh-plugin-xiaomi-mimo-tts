import { createElement } from 'react'
import type { ButtonHTMLAttributes } from 'react'

export function extractMarkdownPlainText(value: string): string { return value }

/** Preserve the native button contract at the browser UI boundary in component tests. */
export function Button({ variant, size, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) {
  return createElement('button', props)
}
