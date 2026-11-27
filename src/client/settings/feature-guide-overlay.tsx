import { useEffect, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import type { PluginActivationOwnerProps } from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { lazyPanel } from '../lazy-panel.js'
import type { SnapshotSource } from '../plugin-activity.js'
import type { ActivationGuideProps } from './activation-guide.js'
import type { FeatureGuideController } from './feature-guide.js'
import { useSettingsTranslation } from './scope.js'

const ActivationGuide = lazyPanel<ActivationGuideProps>(() => import('./activation-guide.js').then(module => module.ActivationGuide), { silentLoading: true })

interface FeatureGuideOverlayProps extends Pick<ActivationGuideProps, 't' | 'scope' | 'changes' | 'onOpenWorkbench'> {
  guide: FeatureGuideController
  localeRevision: SnapshotSource<number>
}

/** Stays mounted across panel navigation, including installations completed outside the Plugins page. */
export function FeatureGuideOverlay({ guide, localeRevision, t: translate, ...props }: FeatureGuideOverlayProps): ReactElement | null {
  const t = useSettingsTranslation(translate, localeRevision)
  const open = useSyncExternalStore(guide.subscribe, guide.getSnapshot, guide.getSnapshot)
  return open ? <ActivationGuide {...props} t={t} packageName="dsh-xiaomi-tts" onDismiss={guide.dismiss} onOpenDetails={props.onOpenWorkbench} /> : null
}

/** Hand off Host activation to the same guide so startup and enablement cannot render two dialogs. */
export function FeatureGuideActivation({ guide, onDismiss }: PluginActivationOwnerProps & { guide: FeatureGuideController }): null {
  useEffect(() => {
    guide.requestActivation()
    onDismiss()
  }, [guide, onDismiss])
  return null
}
