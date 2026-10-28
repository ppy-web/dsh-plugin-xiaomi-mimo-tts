import { useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { PluginActivationOwnerProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { resolveTtsSettings } from '../../shared.js'
import type { TtsSettings } from '../../shared.js'
import type { Translate } from '../localization.js'
import { PreviewPlayer } from '../playback/preview-player.js'
import type { PreviewView } from '../playback/preview-player.js'
import type { AudioFocus } from '../playback/tab-audio-focus.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'

interface ActivationGuideProps extends PluginActivationOwnerProps {
  t: Translate
  scope: ConfigForm<TtsSettings>
  audioFocus: AudioFocus
  beforePreview: () => void
  changes?: SnapshotSource<boolean> | undefined
}

/** Displayed by the host only for an explicit activation, with host-owned dismissal. */
export function ActivationGuide({ t, scope, audioFocus, beforePreview, onOpenDetails, onDismiss, changes = IDLE_PLUGIN_CHANGES }: ActivationGuideProps): ReactElement {
  const [view, setView] = useState<PreviewView>({ status: 'idle', source: null, error: null })
  const [player] = useState(() => new PreviewPlayer(setView))
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  useEffect(() => () => { void player.dispose() }, [player])
  useEffect(() => audioFocus.subscribe(() => { if (!audioFocus.canPlay()) player.stop() }), [audioFocus, player])
  const playing = view.status === 'playing' || view.status === 'loading'
  const openDetails = (): void => { player.stop(); onOpenDetails() }
  const dismiss = (): void => { player.stop(); onDismiss() }
  const preview = (): void => {
    if (playing) { player.stop(); return }
    audioFocus.claim()
    if (!audioFocus.canPlay()) return
    beforePreview()
    const settings = resolveTtsSettings(scope.getSnapshot().value)
    void player.playBrowserPreview(t('onboarding.sample'), settings)
  }
  return <section className="xmimo-ui-scope xmimo-tts-activation" aria-label={t('onboarding.title')}>
    <h2>{t('onboarding.title')}</h2>
    <p>{t('onboarding.description')}</p>
    <div className="xmimo-tts-activation-actions">
      <Button type="button" variant="primary" onClick={openDetails} disabled={changing}>{t('onboarding.configure')}</Button>
      <Button type="button" variant="outline" onClick={preview} disabled={changing}>{t(playing ? 'action.stop' : 'onboarding.preview')}</Button>
      <Button type="button" variant="toolbar" onClick={dismiss}>{t('onboarding.dismiss')}</Button>
    </div>
    {view.status === 'error' ? <p className="xmimo-tts-failed" role="alert">{t(view.error === 'autoplay-blocked' ? 'settings.previewErrorAutoplay' : 'settings.previewErrorLocalUnavailable')}</p> : null}
    {changing ? <p role="status">{t('plugin.changing')}</p> : null}
  </section>
}
