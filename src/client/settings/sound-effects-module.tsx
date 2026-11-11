import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement } from 'react'
import { useRef } from 'react'
import { RiDiscLine } from 'react-icons/ri'
import { resolveSoundEffectsMode, resolveSoundEffectsScope, SOUND_PACKS, SOUND_EFFECTS_SCOPES } from '../../shared.js'
import type { SoundEffectsMode, SoundEffectsScope, SoundPack } from '../../shared.js'
import type { Translate } from '../localization.js'
import { LensSlider } from './controls/lens-slider.js'
import type { SoundEffectsController, SoundCue } from '../sound-effects/types.js'
import { CollapsibleModule } from './collapsible-module.js'
import { SoundEffectIcon } from '../sound-effects/sound-effect-icon.js'
import { SoundPackIcon } from '../sound-effects/sound-pack-icon.js'

interface SoundEffectsPanelProps {
  t: Translate
  controller: SoundEffectsController
  enabled: boolean
  volume: number
  pack: SoundPack
  taskSounds: boolean
  clickSounds: boolean
  writable: boolean
  minimal: boolean
  open: boolean
  onToggle: () => void
  onScopeChange: (scope: SoundEffectsScope) => void
  onVolumeChange: (volume: number) => void
  onPackChange: (pack: SoundPack) => void
}

const PREVIEW_CUES = ['start', 'complete', 'success', 'error', 'notification', 'press', 'select', 'toggle-on', 'toggle-off', 'send', 'open', 'close', 'delete', 'stop', 'queued'] as const satisfies readonly SoundCue[]

const SOUND_PACK_COLORS: Record<SoundPack, string> = {
  minimal: '#8793a6',
  soft: '#4fb7a5',
  glass: '#6c8de7',
  arcade: '#e58d4f',
  mechanical: '#c97465',
  organic: '#72ad61',
  dreamy: '#b27fd0',
  scifi: '#5d9bd4',
  rubber: '#d2a044',
  cinematic: '#7c77c6',
  studio: '#71808e',
  zen: '#58a6b0',
}

/** Collapsible sound library, followed by the Broadcast Desk. */
export function SoundEffectsPanel({ t, controller, enabled, volume, pack, taskSounds, clickSounds, writable, minimal, open, onToggle, onScopeChange, onVolumeChange, onPackChange }: SoundEffectsPanelProps): ReactElement {
  const packOptionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const mode: SoundEffectsMode = resolveSoundEffectsMode(enabled, taskSounds, clickSounds)
  const modeLabel = mode === 'all'
    ? t('settings.soundEffectsOn')
    : mode === 'off'
      ? t('settings.soundEffectsOff')
      : mode === 'click'
        ? t('settings.soundEffectsClickOnly')
        : t('settings.soundEffectsTaskOnly')
  const scope = resolveSoundEffectsScope(taskSounds, clickSounds)

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
  return <CollapsibleModule
    className="xmimo-tts-settings-module xmimo-tts-sound-effects xmimo-ui-module"
    title={<span className="xmimo-ui-module-title"><RiDiscLine size={14} aria-hidden="true" focusable="false" />{t('settings.soundEffectsTitle')}</span>}
    ariaLabel={t('settings.soundEffectsTitle')}
    summary={<span className="xmimo-tts-sound-summary xmimo-ui-summary">
      <span>{modeLabel}</span>
      <span>{t('settings.soundEffectsVolume')} {Math.round(volume * 100)}%</span>
      <span>{pack}</span>
    </span>}
    open={open}
    onToggle={onToggle}
  >
    <div className="xmimo-tts-sound-body xmimo-ui-module-body">
      <div className="xmimo-tts-sound-scope-section">
        <span>{t('settings.soundEffectsScope')}</span>
        <SegmentedControl
          id="xmimo-tts-sound-scope"
          value={scope}
          options={SOUND_EFFECTS_SCOPES.map(value => ({ value, label: t(value === 'all' ? 'settings.soundEffectsOn' : value === 'click' ? 'settings.soundEffectsClickOnly' : 'settings.soundEffectsTaskOnly') }))}
          label={t('settings.soundEffectsScope')}
          disabled={!writable}
          onChange={onScopeChange}
          className="xmimo-tts-settings-segmented xmimo-tts-sound-scope"
        />
      </div>
      <label className="xmimo-tts-sound-volume">
        <span>{t('settings.soundEffectsVolume')} {Math.round(volume * 100)}%</span>
        <LensSlider
          value={volume}
          label={t('settings.soundEffectsVolume')}
          minimal={minimal}
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
            style={{ '--xmimo-sound-pack-accent': SOUND_PACK_COLORS[option] } as CSSProperties}
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
            <SoundPackIcon pack={option} />
            <span className="xmimo-tts-sound-pack-name">{option}</span>
          </button>)}
        </div>
      </div>
      <div className="xmimo-tts-sound-preview-section">
        <span id="xmimo-tts-sound-preview-label">{t('settings.soundEffectsPreviewLabel')}</span>
        <div className="xmimo-tts-sound-previews" role="group" aria-labelledby="xmimo-tts-sound-preview-label">
          {PREVIEW_CUES.map(cue => <button
            key={cue}
            type="button"
            data-xmimo-sound-preview="true"
            disabled={!enabled}
            aria-label={previewLabel(cue)}
            onClick={() => { controller.preview(cue) }}
          >
            <SoundEffectIcon cue={cue} />
            <span>{previewLabel(cue)}</span>
          </button>)}
        </div>
      </div>
      {!writable ? <small>{t('settings.readOnly')}</small> : null}
    </div>
  </CollapsibleModule>
}
