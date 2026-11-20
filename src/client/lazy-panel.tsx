import { lazy, Suspense } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './localization.js'

interface PanelProps {
  t: Translate
  onBack?: () => void
}

export function lazyPanel<Props extends PanelProps>(load: () => Promise<ComponentType<Props>>): (props: Props) => ReactElement {
  const Panel = lazy(async () => {
    try {
      const Loaded = await load()
      return { default: ({ panelProps }: { panelProps: Props }) => <Loaded {...panelProps} /> }
    } catch {
      return { default: ({ panelProps }: { panelProps: Props }) => <PanelStatus {...panelProps} failed /> }
    }
  })
  return function DeferredPanel(props) {
    return <Suspense fallback={<PanelStatus {...props} />}><Panel panelProps={props} /></Suspense>
  }
}

function PanelStatus({ t, onBack, failed = false }: PanelProps & { failed?: boolean }): ReactElement {
  return <div className="xmimo-ui-scope xmimo-tts-plugin-status">
    <p role={failed ? 'alert' : 'status'}>{t(failed ? 'panel.loadFailed' : 'panel.loading')}</p>
    {onBack ? <Button type="button" variant="ghost" size="sm" onClick={onBack}>{t('history.backToSettings')}</Button> : null}
  </div>
}
