import type { ReactElement } from 'react'
import { useState } from 'react'
import { SOUND_PACKS, TTS_SOUND_EFFECT_CUES_ASSET_ROUTE, TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE, resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { Translate } from '../localization.js'
import type { SettingsScopeCompat } from '../dsh-compat.js'
import { useSettingsSnapshot } from '../settings-scope.js'
import { EnergyVolumeSlider } from '../energy-volume-slider.js'
import type { SoundEffectsController, SoundCue } from './types.js'

interface SoundEffectsPanelProps {
  scope: SettingsScopeCompat<TtsSettings>
  t: Translate
  controller: SoundEffectsController
}

const PREVIEW_CUES = [
  { cue: 'start', position: '0%' },
  { cue: 'complete', position: '25%' },
  { cue: 'error', position: '50%' },
  { cue: 'notification', position: '75%' },
  { cue: 'press', position: '100%' },
] as const satisfies readonly { cue: SoundCue, position: string }[]

function hostRoute(path: string): string {
  const relative = path.replace(/^\/+/, '')
  return typeof document === 'undefined' ? `/${relative}` : new URL(relative, document.baseURI).pathname
}

/** A settings module rendered directly below the Broadcast Studio preview. */
export function SoundEffectsPanel({ scope, t, controller }: SoundEffectsPanelProps): ReactElement | null {
  const snapshot = useSettingsSnapshot(scope)
  const [open, setOpen] = useState(false)
  const settings = resolveTtsSettings(snapshot.value)
  const sound = {
    enabled: settings.soundEnabled,
    volume: settings.soundVolume,
    pack: settings.soundPack,
  }

  if (snapshot.status === 'unavailable') return null

  const set = (field: keyof TtsSettings, value: unknown): void => { void scope.set(field, value) }
  const setEnabled = async (enabled: boolean): Promise<void> => {
    await scope.set('soundEnabled', enabled)
    await scope.set('taskSounds', enabled)
    await scope.set('clickSounds', enabled)
  }
  const previewLabel = (cue: SoundCue): string => t(`settings.soundEffectsPreview.${cue}` as Parameters<Translate>[0])
  const inertProps: Record<string, string> = open ? {} : { inert: '' }

  return <section className="xmimo-tts-settings-module xmimo-tts-sound-effects xmimo-ui-module">
    <button
      type="button"
      className="xmimo-tts-sound-toggle xmimo-ui-module-toggle"
      aria-expanded={open}
      aria-label={`${t(open ? 'settings.collapse' : 'settings.expand')}: ${t('settings.soundEffectsTitle')}`}
      onClick={() => { setOpen((current) => !current) }}
    >
      <span className="xmimo-tts-sound-heading xmimo-ui-module-head">
        <strong>{t('settings.soundEffectsTitle')}</strong>
        <span className="xmimo-tts-sound-summary xmimo-ui-summary">
          <span>{t(sound.enabled ? 'settings.soundEffectsOn' : 'settings.soundEffectsOff')}</span>
          <span>{t('settings.soundEffectsVolume')} {Math.round(sound.volume * 100)}%</span>
          <span>{sound.pack}</span>
          <span>{t('settings.soundEffectsSynced')}</span>
        </span>
      </span>
    </button>
    <button
      type="button"
      className="xmimo-tts-sound-whale-button"
      aria-pressed={sound.enabled}
      aria-label={t(sound.enabled ? 'settings.soundEffectsTurnOff' : 'settings.soundEffectsTurnOn')}
      disabled={!snapshot.writable}
      onClick={() => { void setEnabled(!sound.enabled) }}
    >
      <span
        className={sound.enabled ? 'xmimo-tts-sound-whale xmimo-tts-sound-whale-on' : 'xmimo-tts-sound-whale xmimo-tts-sound-whale-off'}
        style={{ backgroundImage: `url(${hostRoute(TTS_SOUND_EFFECTS_WHALE_ASSET_ROUTE)})` }}
        aria-hidden="true"
      />
    </button>
    <div className={open ? 'xmimo-tts-sound-collapse xmimo-tts-sound-collapse-open' : 'xmimo-tts-sound-collapse'} aria-hidden={!open} {...inertProps}>
      <div className="xmimo-tts-sound-body xmimo-ui-module-body">
        <label className="xmimo-tts-sound-volume">
          <span>{t('settings.soundEffectsVolume')} {Math.round(sound.volume * 100)}%</span>
          <EnergyVolumeSlider value={sound.volume} label={t('settings.soundEffectsVolume')} disabled={!snapshot.writable || !sound.enabled} onChange={(value) => { set('soundVolume', value) }} />
        </label>
        <div className="xmimo-tts-sound-pack">
          <span id="xmimo-tts-sound-pack-label">{t('settings.soundEffectsPack')}</span>
          <div className="xmimo-tts-sound-pack-grid" role="radiogroup" aria-labelledby="xmimo-tts-sound-pack-label">
            {SOUND_PACKS.map((pack) => <button
              key={pack}
              type="button"
              role="radio"
              aria-checked={sound.pack === pack}
              className={sound.pack === pack ? 'xmimo-tts-sound-pack-option xmimo-tts-sound-pack-option-selected' : 'xmimo-tts-sound-pack-option'}
              disabled={!snapshot.writable || !sound.enabled}
              onClick={() => { set('soundPack', pack) }}
            >{pack}</button>)}
          </div>
        </div>
        <div className="xmimo-tts-sound-previews" role="group" aria-label={t('settings.soundEffectsPreviewLabel')}>
          {PREVIEW_CUES.map(({ cue, position }) => <button
            key={cue}
            type="button"
            data-xmimo-sound-preview="true"
            disabled={!sound.enabled}
            aria-label={previewLabel(cue)}
            onClick={() => { controller.preview(cue) }}
          >
            <span className="xmimo-tts-sound-preview-character" style={{ backgroundImage: `url(${hostRoute(TTS_SOUND_EFFECT_CUES_ASSET_ROUTE)})`, backgroundPosition: `${position} center` }} aria-hidden="true" />
            <span>{previewLabel(cue)}</span>
          </button>)}
        </div>
        {!snapshot.writable ? <small>{t('settings.readOnly')}</small> : null}
      </div>
    </div>
  </section>
}
