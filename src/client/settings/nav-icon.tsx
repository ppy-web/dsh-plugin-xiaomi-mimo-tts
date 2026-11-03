import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { ReactElement } from 'react'
import { RiVoiceAiFill } from 'react-icons/ri'

/** Section id shared by the Voice reading page and its navigation icon. */
export const VOICE_READING_SECTION_ID = 'voice-reading'

/** Owner props the settings shell passes to a section icon. */
export interface VoiceReadingNavIconProps {
  size: number
}

/**
 * Nav glyph for the Voice reading section.
 *
 * The settings shell renders `settings.section.icon` for the nav cell of the
 * section with the same id and falls back to its settings gear only when no
 * icon is registered. Registering here replaces that fallback instead of
 * painting a second glyph beside it.
 */
export function VoiceReadingNavIcon({ size }: VoiceReadingNavIconProps): ReactElement {
  return <RiVoiceAiFill size={size} aria-hidden="true" focusable="false" />
}

/** Register the nav icon the settings shell binds to the Voice reading section. */
export function registerVoiceReadingNavIcon(ctx: Context): () => void {
  return ctx.slots.register({
    name: 'settings.section.icon',
    id: VOICE_READING_SECTION_ID,
  }, VoiceReadingNavIcon)
}
