import type { ReactElement } from 'react'
import { useRef, useState } from 'react'
import { Button, IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ButtonVariant } from '@deepseek-ai/dsh-client-ui-primitives'

interface VoiceReadingSelectProps {
  /** Accessible name of the control (the row title). */
  label: string
  /** Currently selected option id. */
  value: string
  /** Shown when the value matches no option (a stored custom id). */
  fallbackLabel?: string
  options: readonly { id: string; label: string }[]
  disabled: boolean
  /** Use a standard Host button instead of the settings-row capsule. */
  buttonVariant?: ButtonVariant
  onSelect: (id: string) => void
}

/**
 * Capsule selector pill plus anchored menu, mirroring the Host settings rows
 * (`packages/client/ui-chat/src/client/settings/PreferenceRow.tsx` and
 * `packages/client/locale/src/client/LanguageRow.tsx` in the harness source): a
 * borderless 36px pill on the module surface that opens the shared `Menu` with
 * a check on the selected row. Choosing returns focus to the pill before the
 * value is published, exactly like the Host rows.
 */
export function VoiceReadingSelect({ label, value, fallbackLabel, options, disabled, buttonVariant, onSelect }: VoiceReadingSelectProps): ReactElement {
  const [open, setOpen] = useState(false)
  const selectorRef = useRef<HTMLButtonElement>(null)
  const closeMenu = (): void => {
    setOpen(false)
  }
  const choose = (id: string): void => {
    selectorRef.current?.focus({ preventScroll: true })
    closeMenu()
    onSelect(id)
  }
  const selectedLabel = options.find((option) => option.id === value)?.label ?? fallbackLabel ?? value
  const Trigger = buttonVariant ? Button : 'button'
  const selector = <Trigger
    ref={selectorRef}
    type="button"
    {...(buttonVariant ? { variant: buttonVariant, size: 'sm' as const } : {})}
    className={buttonVariant ? 'xmimo-voice-reading-button-selector' : 'xmimo-voice-reading-selector'}
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    disabled={disabled}
    onClick={() => {
      setOpen((current) => !current)
    }}
  >
    <span className="xmimo-voice-reading-selector-label">{selectedLabel}</span>
    <IconChevronDownOutlineRegular className="xmimo-voice-reading-chevron" />
  </Trigger>

  return <Menu
    open={open && !disabled}
    anchor={selector}
    items={options}
    selectedId={value}
    onSelect={choose}
    onClose={closeMenu}
    align="end"
    portal
    // The list is portaled to document.body, outside our subtree, so this class
    // is the only style hook that reaches the dropdown card (Menu.tsx
    // `listClassName`). voice-reading.css caps its height at 300px there.
    listClassName="xmimo-voice-reading-menu"
  />
}
