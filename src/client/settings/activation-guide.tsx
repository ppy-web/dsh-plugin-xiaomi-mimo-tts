import { useState, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import type { PluginActivationOwnerProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { LuAudioLines, LuStar } from 'react-icons/lu'
import { TTS_UPDATE_CELEBRATION_ASSET_ROUTE, TTS_VERSION } from '../../shared.js'
import type { Translate } from '../localization.js'
import { IDLE_PLUGIN_CHANGES, type SnapshotSource } from '../plugin-activity.js'
import { hostRoute } from '../host-route.js'
import { SOURCE_URL } from './plugin-links.js'

const HIGHLIGHTS = [
  'onboarding.featureExternalSpeech',
  'onboarding.featureExternalVoices',
  'onboarding.featureExternalSwitch',
] as const

const CONFETTI = [-116, -90, -60, -28, 28, 60, 90, 116].map((x, index) => ({
  '--confetti-x': `${x}px`,
  '--confetti-y': `${-58 - (index % 3) * 24}px`,
  '--confetti-turn': `${x * 2}deg`,
}) as CSSProperties)

interface ActivationGuideProps extends PluginActivationOwnerProps {
  t: Translate
  onOpenWorkbench: () => void
  changes?: SnapshotSource<boolean> | undefined
}

/** Displayed by the host only for an explicit activation, with host-owned dismissal. */
export function ActivationGuide({ t, onOpenWorkbench, onDismiss, changes = IDLE_PLUGIN_CHANGES }: ActivationGuideProps): ReactElement {
  const [artReady, setArtReady] = useState(false)
  const changing = useSyncExternalStore(changes.subscribe, changes.getSnapshot, changes.getSnapshot)
  const openWorkbench = (): void => { onDismiss(); onOpenWorkbench() }
  const dismiss = (): void => { onDismiss() }
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
          <Button type="button" variant="primary" onClick={() => window.open(SOURCE_URL, '_blank', 'noopener,noreferrer')}><LuStar size={16} aria-hidden="true" />{t('onboarding.github')}</Button>
          <Button type="button" variant="outline" className="xmimo-tts-activation-workbench" onClick={openWorkbench} disabled={changing}><LuAudioLines size={16} aria-hidden="true" />{t('onboarding.configure')}</Button>
          <Button type="button" variant="ghost" onClick={dismiss}>{t('onboarding.dismiss')}</Button>
        </div>
        {changing ? <div className="xmimo-tts-activation-feedback">
          <p role="status">{t('plugin.changing')}</p>
        </div> : undefined}
      </div>
    </div>
  </Modal>
}
