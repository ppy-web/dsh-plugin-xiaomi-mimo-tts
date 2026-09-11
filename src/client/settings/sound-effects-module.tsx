import type { KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useEffect, useRef, useState } from 'react'
import { SOUND_PACKS, TTS_SOUND_EFFECT_CUES_ASSET_ROUTE, TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE } from '../../shared.js'
import type { SoundPack } from '../../shared.js'
import type { Translate } from '../localization.js'
import { EnergyVolumeSlider } from './controls/energy-volume-slider.js'
import type { SoundEffectsController, SoundCue } from '../sound-effects/types.js'
import { CollapsibleModule } from './collapsible-module.js'
import { hostRoute } from '../host-route.js'

interface SoundEffectsPanelProps {
  t: Translate
  controller: SoundEffectsController
  enabled: boolean
  volume: number
  pack: SoundPack
  taskSounds: boolean
  clickSounds: boolean
  writable: boolean
  open: boolean
  onToggle: () => void
  onEnabledChange: (enabled: boolean) => void
  onVolumeChange: (volume: number) => void
  onPackChange: (pack: SoundPack) => void
}

const PREVIEW_CUES = [
  { cue: 'start', position: '0%' },
  { cue: 'complete', position: '25%' },
  { cue: 'error', position: '50%' },
  { cue: 'notification', position: '75%' },
  { cue: 'press', position: '100%' },
] as const satisfies readonly { cue: SoundCue, position: string }[]

type SoundPackTone = 'neutral' | 'calm' | 'cool' | 'bright'

const SOUND_PACK_TONES: Record<SoundPack, SoundPackTone> = {
  minimal: 'neutral',
  soft: 'calm',
  glass: 'cool',
  arcade: 'bright',
  mechanical: 'bright',
  organic: 'calm',
  dreamy: 'calm',
  scifi: 'cool',
  rubber: 'bright',
  cinematic: 'cool',
  studio: 'neutral',
  zen: 'neutral',
}

/** A settings module rendered directly below the Broadcast Studio preview. */
export function SoundEffectsPanel({ t, controller, enabled, volume, pack, taskSounds, clickSounds, writable, open, onToggle, onEnabledChange, onVolumeChange, onPackChange }: SoundEffectsPanelProps): ReactElement {
  const [previewingCue, setPreviewingCue] = useState<SoundCue | null>(null)
  const packOptionRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    controller.update({
      enabled,
      volume,
      pack,
      taskSounds,
      clickSounds,
    })
  }, [clickSounds, controller, enabled, pack, taskSounds, volume])

  const setEnabled = (next: boolean): void => {
    controller.update({ enabled: next, volume, pack, taskSounds: next, clickSounds: next })
    onEnabledChange(next)
  }
  const selectPack = (nextPack: typeof SOUND_PACKS[number]): void => {
    if (!writable || !enabled) return
    if (nextPack === pack) {
      controller.preview('press')
      return
    }

    controller.update({ enabled, volume, pack: nextPack, taskSounds, clickSounds })
    onPackChange(nextPack)
    controller.play('press')
  }

  const focusPackOption = (index: number): void => {
    const normalized = (index + SOUND_PACKS.length) % SOUND_PACKS.length
    requestAnimationFrame(() => packOptionRefs.current[normalized]?.focus())
  }

  const handlePackKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      focusPackOption(index + 1)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      focusPackOption(index - 1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusPackOption(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      focusPackOption(SOUND_PACKS.length - 1)
    }
  }
  const previewLabel = (cue: SoundCue): string => t(`settings.soundEffectsPreview.${cue}` as Parameters<Translate>[0])
  const previewCue = (cue: SoundCue): void => {
    controller.preview(cue)
    setPreviewingCue(null)
    requestAnimationFrame(() => { setPreviewingCue(cue) })
  }

  const whaleAction = <button
    type="button"
    className="xmimo-tts-sound-whale-button"
    aria-pressed={enabled}
    aria-label={t(enabled ? 'settings.soundEffectsTurnOff' : 'settings.soundEffectsTurnOn')}
    disabled={!writable}
    onClick={() => { setEnabled(!enabled) }}
  >
    <span
      className={enabled ? 'xmimo-tts-sound-whale xmimo-tts-sound-whale-on' : 'xmimo-tts-sound-whale xmimo-tts-sound-whale-off'}
      style={{ backgroundImage: `url(${hostRoute(TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE)})` }}
      aria-hidden="true"
    />
    <span className="xmimo-tts-sound-bubble" aria-live="polite">
      {t(enabled ? 'settings.soundEffectsBubbleOn' : 'settings.soundEffectsBubbleOff')}
    </span>
  </button>

  return <CollapsibleModule
    className="xmimo-tts-settings-module xmimo-tts-sound-effects xmimo-ui-module"
    toggleClassName="xmimo-tts-sound-toggle"
    headingClassName="xmimo-tts-sound-heading"
    collapseClassName="xmimo-tts-sound-collapse"
    collapseOpenClassName="xmimo-tts-sound-collapse-open"
    title={t('settings.soundEffectsTitle')}
    summary={<span className="xmimo-tts-sound-summary xmimo-ui-summary">
      <span>{t(enabled ? 'settings.soundEffectsOn' : 'settings.soundEffectsOff')}</span>
      <span>{t('settings.soundEffectsVolume')} {Math.round(volume * 100)}%</span>
      <span>{pack}</span>
      <span>{t('settings.soundEffectsSynced')}</span>
    </span>}
    open={open}
    onToggle={onToggle}
    ariaLabel={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${t('settings.soundEffectsTitle')}`}
    action={whaleAction}
  >
    <div className="xmimo-tts-sound-body xmimo-ui-module-body">
      <label className="xmimo-tts-sound-volume">
        <span>{t('settings.soundEffectsVolume')} {Math.round(volume * 100)}%</span>
        <EnergyVolumeSlider
          value={volume}
          label={t('settings.soundEffectsVolume')}
          disabled={!writable || !enabled}
          onChange={(value) => { controller.setVolume(value); onVolumeChange(value) }}
          onInteractionEnd={() => { controller.previewVolume() }}
        />
      </label>
      <div className="xmimo-tts-sound-pack">
        <span id="xmimo-tts-sound-pack-label">{t('settings.soundEffectsPack')}</span>
        <div className="xmimo-tts-sound-pack-grid" role="radiogroup" aria-labelledby="xmimo-tts-sound-pack-label">
          {SOUND_PACKS.map((option, index) => <button
            key={option}
            ref={(node) => { packOptionRefs.current[index] = node }}
            type="button"
            role="radio"
            data-xmimo-sound-pack-option="true"
            data-tone={SOUND_PACK_TONES[option]}
            aria-checked={pack === option}
            tabIndex={pack === option ? 0 : -1}
            className={[
              'xmimo-tts-sound-pack-option',
              pack === option ? 'xmimo-tts-sound-pack-option-selected' : '',
            ].filter(Boolean).join(' ')}
            disabled={!writable || !enabled}
            onClick={() => { selectPack(option) }}
            onKeyDown={(event) => { handlePackKeyDown(event, index) }}
          >
            <span className="xmimo-tts-sound-pack-name">{option}</span>
            <span className="xmimo-tts-sound-pack-wave" aria-hidden="true"><i /><i /><i /></span>
          </button>)}
        </div>
      </div>
      <div className="xmimo-tts-sound-preview-section">
        <span id="xmimo-tts-sound-preview-label">{t('settings.soundEffectsPreviewLabel')}</span>
        <div className="xmimo-tts-sound-previews" role="group" aria-labelledby="xmimo-tts-sound-preview-label">
          {PREVIEW_CUES.map(({ cue, position }) => <button
            key={cue}
            type="button"
            data-xmimo-sound-preview="true"
            disabled={!enabled}
            aria-label={previewLabel(cue)}
            onClick={() => { previewCue(cue) }}
          >
            <span
              className={previewingCue === cue ? 'xmimo-tts-sound-preview-character xmimo-tts-sound-preview-character-bounce' : 'xmimo-tts-sound-preview-character'}
              style={{ backgroundImage: `url(${hostRoute(TTS_SOUND_EFFECT_CUES_ASSET_ROUTE)})`, backgroundPosition: `${position} center` }}
              onAnimationEnd={() => { setPreviewingCue((current) => current === cue ? null : current) }}
              aria-hidden="true"
            />
            <span>{previewLabel(cue)}</span>
          </button>)}
        </div>
      </div>
      <small className="xmimo-tts-sound-description">{t('settings.soundEffectsDescription')}</small>
      <small className="xmimo-tts-sound-supported">{t('settings.soundEffectsSupported')}</small>
      {!writable ? <small>{t('settings.readOnly')}</small> : null}
    </div>
  </CollapsibleModule>
}
