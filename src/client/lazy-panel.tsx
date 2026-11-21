import { lazy, Suspense, useMemo, useState } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { Translate } from './localization.js'

interface PanelProps {
  t: Translate
  onBack?: (() => void) | undefined
}

export function lazyPanel<Props extends PanelProps>(load: () => Promise<ComponentType<Props>>): (props: Props) => ReactElement {
  return function DeferredPanel(props) {
    const [attempt, setAttempt] = useState(0)
    const Panel = useMemo(() => lazy(async () => {
      try {
        const Loaded = await load()
        return { default: ({ panelProps }: { panelProps: Props }) => <Loaded {...panelProps} /> }
      } catch {
        return {
          default: ({ panelProps }: { panelProps: Props }) => (
            <PanelStatus {...panelProps} failed onRetry={() => setAttempt(current => current + 1)} />
          ),
        }
      }
    }), [attempt])
    return <Suspense fallback={<PanelStatus {...props} />}><Panel panelProps={props} /></Suspense>
  }
}

function PanelStatus({ t, onBack, failed = false, onRetry }: PanelProps & { failed?: boolean; onRetry?: () => void }): ReactElement {
  return <div className="xmimo-ui-scope xmimo-tts-plugin-status">
    <p role={failed ? 'alert' : 'status'}>{t(failed ? 'panel.loadFailed' : 'panel.loading')}</p>
    {failed && onRetry ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>{t('panel.retry')}</Button> : null}
    {onBack ? <Button type="button" variant="ghost" size="sm" onClick={onBack}>{t('history.backToSettings')}</Button> : null}
  </div>
}
