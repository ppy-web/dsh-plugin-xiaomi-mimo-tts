import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { PluginActivationOwnerProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { LuAudioLines, LuStar } from 'react-icons/lu'
import { TTS_UPDATE_CELEBRATION_ASSET_ROUTE, TTS_VERSION } from '../../shared.js'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { resolveTtsSettings, type TtsSettings } from '../../shared.js'
import { useSettingsSnapshot } from './scope.js'
import type { Translate } from '../localization.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import { hostRoute } from '../host-route.js'
import { SOURCE_URL } from './plugin-links.js'

const HIGHLIGHTS = [
  'onboarding.featureConciseReading',
  'onboarding.featureSubagentAnnouncements',
  'onboarding.featureSettingsSearch',
  'onboarding.featureExternalReading',
  'onboarding.featureVoiceAvatars',
] as const

const CONFETTI = [-116, -90, -60, -28, 28, 60, 90, 116].map((x, index) => ({
  '--confetti-x': `${x}px`,
  '--confetti-y': `${-58 - (index % 3) * 24}px`,
  '--confetti-turn': `${x * 2}deg`,
}) as CSSProperties)

interface ActivationGuideProps extends PluginActivationOwnerProps {
  t: Translate
  scope: ConfigForm<TtsSettings>
  preview?: boolean
  onOpenWorkbench: () => void
  changes?: SnapshotSource<boolean> | undefined
}

/** Displayed by the host only for an explicit activation, with host-owned dismissal. */
export function ActivationGuide({ t, scope, preview = false, onOpenWorkbench, onDismiss, changes = IDLE_PLUGIN_CHANGES }: ActivationGuideProps): ReactElement | null {
  const dismissed = useRef(false)
  const dismiss = (): void => { if (!dismissed.current) { dismissed.current = true; onDismiss() } }
  const [artReady, setArtReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const enabled = resolveTtsSettings(useSettingsSnapshot(scope).value).showFeatureGuide
  useEffect(() => { if (!preview && !enabled) dismiss() }, [preview, enabled, onDismiss])
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const openWorkbench = (): void => { onDismiss(); onOpenWorkbench() }
  const neverRemind = async (): Promise<void> => {
    setSaving(true)
    setFailed(false)
    try {
      if (!await scope.mutate([{ op: 'set', path: ['showFeatureGuide'], value: false }])) throw new Error('host-rejected')
      dismiss()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }
  if (!preview && !enabled) return null
  return <Modal
    open
    title={t('onboarding.title')}
    headless
    onClose={dismiss}
    className="xmimo-ui-scope xmimo-tts-activation-dialog"
  >
    <Button type="button" variant="ghost" size="sm" data-modal-autofocus className="xmimo-tts-activation-close" aria-label={t('onboarding.dismiss')} onClick={dismiss}>
      <IconCloseOutlineRegular size={16} />
    </Button>
    <div className="xmimo-tts-activation-layout">
      <a className="xmimo-tts-activation-art" href={SOURCE_URL} target="_blank" rel="noopener noreferrer" aria-label={t('settings.source')} title={t('settings.source')} data-ready={artReady}>
        <img src={hostRoute(TTS_UPDATE_CELEBRATION_ASSET_ROUTE)} alt="" width={176} height={176} onLoad={() => setArtReady(true)} />
        <div className="xmimo-tts-activation-confetti" aria-hidden="true">
          {CONFETTI.map((style, index) => <i key={index} style={style} />)}
        </div>
      </a>
      <header className="xmimo-tts-activation-heading">
        <h2>{t('onboarding.title')} <span>v{TTS_VERSION}</span></h2>
        <p>{t('onboarding.summary')}</p>
      </header>
      <div className="xmimo-tts-activation-features" role="region" aria-label={t('onboarding.details')} tabIndex={0}>
        <ul>
          {HIGHLIGHTS.map(key => <li key={key}>
            <span aria-hidden="true">🎉</span><span>{t(key)}</span>
          </li>)}
        </ul>
      </div>
      <div className="xmimo-tts-activation-footer">
        <div className="xmimo-tts-activation-actions">
          <Button type="button" variant="outline" onClick={openWorkbench} disabled={changing}><LuAudioLines size={16} aria-hidden="true" />{t('onboarding.configure')}</Button>
          <Button type="button" variant="primary" onClick={() => window.open(SOURCE_URL, '_blank', 'noopener,noreferrer')}><LuStar size={16} aria-hidden="true" />{t('onboarding.github')}</Button>
          <Button type="button" variant="outline" disabled={saving} onClick={() => void neverRemind()}>{t('onboarding.never')}</Button>
        </div>
        {failed ? <div className="xmimo-tts-activation-feedback"><p role="alert">{t('settings.failed')}</p></div> : null}
        {changing ? <div className="xmimo-tts-activation-feedback">
          <p role="status">{t('plugin.changing')}</p>
        </div> : undefined}
      </div>
    </div>
  </Modal>
}
