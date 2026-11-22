import type { ChangeEvent, CSSProperties, DragEvent, ReactElement } from 'react'
import { useRef, useState } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  TTS_EXTERNAL_PROVIDER_CHARACTER_ASSET_ROUTE,
  TTS_PROVIDER_CHARACTER_ASSET_ROUTES,
  TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE,
  TTS_TOGGLE_CHARACTER_ASSET_ROUTE,
} from '../../constants.js'
import {
  PORTRAIT_IMAGE_TYPES,
  PORTRAIT_MAX_BYTES,
  PORTRAIT_SCALE_MAX,
  PORTRAIT_SCALE_MIN,
  PORTRAIT_SLOTS,
} from '../../types/portrait.js'
import type { PortraitSlot } from '../../types/portrait.js'
import type { TtsProvider } from '../../types/providers.js'
import type { LocaleKey, Translate } from '../localization.js'
import { hostRoute } from '../host-route.js'
import { useSettingsSearch } from './settings-search-context.js'
import { LensSlider } from './controls/lens-slider.js'
import { portraitView, previewPortraitScale, resetPortrait, setPortraitScale, uploadPortrait, usePortraitManifest } from '../portraits/store.js'

const SLOT_LABELS: Record<PortraitSlot, LocaleKey> = {
  voice: 'settings.portraitSlotVoice',
  autoplay: 'settings.portraitSlotAutoPlay',
  sound: 'settings.portraitSlotSound',
  provider: 'settings.portraitSlotProvider',
}
const ACCEPT = Object.keys(PORTRAIT_IMAGE_TYPES).join(',')
const IMAGE_FILE = /\.(png|jpe?g|webp|gif)$/iu

function defaultThumb(slot: PortraitSlot, provider: TtsProvider): CSSProperties {
  if (slot === 'provider') {
    return {
      backgroundImage: `url(${hostRoute(TTS_PROVIDER_CHARACTER_ASSET_ROUTES[provider] ?? TTS_EXTERNAL_PROVIDER_CHARACTER_ASSET_ROUTE)})`,
      backgroundSize: 'contain',
      backgroundPosition: 'center',
    }
  }
  if (slot === 'sound') {
    return { backgroundImage: `url(${hostRoute(TTS_SOUND_EFFECTS_CHARACTER_ASSET_ROUTE)})`, backgroundSize: '200% 100%', backgroundPosition: 'left center' }
  }
  return {
    backgroundImage: `url(${hostRoute(TTS_TOGGLE_CHARACTER_ASSET_ROUTE)})`,
    backgroundSize: '200% 200%',
    backgroundPosition: slot === 'voice' ? 'left top' : 'left bottom',
  }
}

function validateImage(file: File): LocaleKey | null {
  const typed = Object.prototype.hasOwnProperty.call(PORTRAIT_IMAGE_TYPES, file.type)
  if (!typed && !IMAGE_FILE.test(file.name)) return 'settings.portraitInvalidType'
  if (file.size > PORTRAIT_MAX_BYTES) return 'settings.portraitTooLarge'
  return null
}

export interface PortraitCardsProps {
  t: Translate
  provider: TtsProvider
  writable: boolean
}

/** Four upload slots that replace the top cards' character art with the user's own images. */
export function PortraitCards({ t, provider, writable }: PortraitCardsProps): ReactElement {
  const { hide } = useSettingsSearch()
  const manifest = usePortraitManifest()
  const [busy, setBusy] = useState<PortraitSlot | null>(null)
  const [dragging, setDragging] = useState<PortraitSlot | null>(null)
  const [error, setError] = useState<{ slot: PortraitSlot; message: LocaleKey } | null>(null)
  const inputs = useRef<Partial<Record<PortraitSlot, HTMLInputElement | null>>>({})

  const committedScale = useRef<Partial<Record<PortraitSlot, number>>>({})

  const pick = (slot: PortraitSlot): void => {
    if (!writable || busy !== null) return
    inputs.current[slot]?.click()
  }

  const apply = async (slot: PortraitSlot, file: File): Promise<void> => {
    const problem = validateImage(file)
    if (problem !== null) { setError({ slot, message: problem }); return }
    setError(null)
    setBusy(slot)
    try {
      await uploadPortrait(slot, file)
    } catch {
      setError({ slot, message: 'settings.portraitUploadFailed' })
    } finally {
      setBusy(null)
    }
  }

  const reset = async (slot: PortraitSlot): Promise<void> => {
    if (!writable || busy !== null) return
    setError(null)
    setBusy(slot)
    try {
      await resetPortrait(slot)
    } catch {
      setError({ slot, message: 'settings.portraitResetFailed' })
    } finally {
      setBusy(null)
    }
  }

  const onPick = (slot: PortraitSlot, event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file !== undefined) void apply(slot, file)
  }

  const onDrop = (slot: PortraitSlot, event: DragEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    setDragging(null)
    if (!writable || busy !== null) return
    const file = event.dataTransfer.files?.[0]
    if (file !== undefined) void apply(slot, file)
  }

  return <div className="xmimo-tts-portrait-cards" hidden={hide('portraitCards')}>
    <div className="xmimo-tts-portrait-cards-head">
      <span className="xmimo-tts-portrait-cards-title">{t('settings.portraitCardsTitle')}</span>
      <span className="xmimo-tts-portrait-cards-hint">{t('settings.portraitCardsHint')}</span>
    </div>
    <div className="xmimo-tts-portrait-grid">
      {PORTRAIT_SLOTS.map(slot => {
        const view = portraitView(manifest, slot)
        const isBusy = busy === slot
        return <div key={slot} className={`xmimo-tts-portrait-slot${dragging === slot ? ' xmimo-tts-portrait-slot-dragging' : ''}`}>
          <div className="xmimo-tts-portrait-slot-head">
            <span>{t(SLOT_LABELS[slot])}</span>
            <span className="xmimo-tts-portrait-slot-tools">
              <span className={view === null ? 'xmimo-tts-portrait-badge xmimo-tts-portrait-badge-default' : 'xmimo-tts-portrait-badge'}>
                {t(view === null ? 'settings.portraitDefault' : 'settings.portraitCustom')}
              </span>
              {view === null ? null : <button type="button" className="xmimo-tts-portrait-restore" disabled={!writable || busy !== null} onClick={() => { void reset(slot) }}>
                {t('settings.portraitReset')}
              </button>}
            </span>
          </div>
          <Tooltip label={t('settings.portraitDropHint')} side="top" gap={4} portal>
            <button
              type="button"
              className="xmimo-tts-portrait-drop"
              disabled={!writable || isBusy}
              aria-label={`${t('settings.portraitDropHint')} · ${t(SLOT_LABELS[slot])}`}
              onClick={() => { pick(slot) }}
              onDragOver={(event) => { event.preventDefault(); if (writable && busy === null) setDragging(slot) }}
              onDragLeave={() => { setDragging(current => current === slot ? null : current) }}
              onDrop={(event) => { onDrop(slot, event) }}
            >
              {view === null
                ? <span className="xmimo-tts-portrait-thumb" style={defaultThumb(slot, provider)} aria-hidden="true" />
                : <span className="xmimo-tts-portrait-thumb xmimo-tts-portrait-thumb-custom" aria-hidden="true">
                  <img className="xmimo-tts-portrait-thumb-img" src={view.url} alt="" style={{ transform: `scale(${view.scale})` }} />
                </span>}
            </button>
          </Tooltip>
          {view === null ? null : <LensSlider
            value={view.scale}
            label={`${t('settings.portraitScale')} · ${t(SLOT_LABELS[slot])}`}
            min={PORTRAIT_SCALE_MIN}
            max={PORTRAIT_SCALE_MAX}
            step={0.05}
            formatValue={(value) => `${Math.round(value * 100)}%`}
            disabled={!writable || busy !== null}
            commitOnEnd
            onInteractionStart={() => { committedScale.current[slot] = view.scale }}
            onPreviewChange={(value) => { previewPortraitScale(slot, value) }}
            onInteractionCancel={() => {
              const previous = committedScale.current[slot]
              if (previous !== undefined) previewPortraitScale(slot, previous)
            }}
            onInteractionEnd={(value) => {
              const previous = committedScale.current[slot]
              if (previous !== undefined && value === previous) return
              void setPortraitScale(slot, value).catch(() => {
                if (previous !== undefined) previewPortraitScale(slot, previous)
                setError({ slot, message: 'settings.portraitUploadFailed' })
              })
            }}
            onChange={() => {}}
          />}
          <input ref={node => { inputs.current[slot] = node }} type="file" accept={ACCEPT} hidden onChange={(event) => { onPick(slot, event) }} />
          {error?.slot === slot ? <span className="xmimo-tts-portrait-error" role="alert">{t(error.message)}</span> : null}
        </div>
      })}
    </div>
    {writable ? null : <small className="xmimo-tts-portrait-readonly">{t('settings.portraitReadOnly')}</small>}
  </div>
}
