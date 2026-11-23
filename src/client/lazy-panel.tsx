import { lazy, Suspense, useMemo, useState } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { hostRoute } from './host-route.js'
import type { Translate } from './localization.js'
import { TTS_HISTORY_EMPTY_ASSET_ROUTE } from './shared.js'

interface PanelProps {
  t: Translate
  onBack?: (() => void) | undefined
}

export interface LazyPanelOptions {
  silentLoading?: boolean
}

export interface PanelStatusViewProps {
  message: string
  failed?: boolean
  compact?: boolean
  retryLabel?: string
  backLabel?: string
  onRetry?: (() => void) | undefined
  onBack?: (() => void) | undefined
}

export function PanelStatusView({ message, failed = false, compact = false, retryLabel, backLabel, onRetry, onBack }: PanelStatusViewProps): ReactElement {
  return <div
    className={compact ? 'xmimo-ui-scope xmimo-tts-panel-state xmimo-tts-panel-state-compact' : 'xmimo-ui-scope xmimo-tts-panel-state'}
    data-state={failed ? 'failed' : 'loading'}
    aria-busy={failed ? undefined : true}
  >
    <div className="xmimo-tts-panel-state-icon" aria-hidden="true">
      <span className="xmimo-tts-panel-state-aura" />
      <span className="xmimo-tts-panel-state-badge">
        <img src={hostRoute(TTS_HISTORY_EMPTY_ASSET_ROUTE)} width={56} height={56} alt="" />
      </span>
    </div>
    {!failed ? <span className="xmimo-tts-panel-state-wave" aria-hidden="true">
      <span /><span /><span /><span /><span />
    </span> : null}
    <p className="xmimo-tts-panel-state-text" role={failed ? 'alert' : 'status'} aria-live={failed ? undefined : 'polite'}>{message}</p>
    {(failed && onRetry && retryLabel) || (onBack && backLabel) ? <div className="xmimo-tts-panel-state-actions">
      {failed && onRetry && retryLabel ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>{retryLabel}</Button> : null}
      {onBack && backLabel ? <Button type="button" variant="ghost" size="sm" onClick={onBack}>{backLabel}</Button> : null}
    </div> : null}
  </div>
}

export function lazyPanel<Props extends PanelProps>(load: () => Promise<ComponentType<Props>>, options?: LazyPanelOptions): (props: Props) => ReactElement {
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
    return <Suspense fallback={options?.silentLoading ? null : <PanelStatus {...props} />}><Panel panelProps={props} /></Suspense>
  }
}

function PanelStatus({ t, onBack, failed = false, onRetry }: PanelProps & { failed?: boolean; onRetry?: () => void }): ReactElement {
  return <PanelStatusView
    message={t(failed ? 'panel.loadFailed' : 'panel.loading')}
    failed={failed}
    retryLabel={t('panel.retry')}
    backLabel={t('history.backToSettings')}
    onRetry={onRetry}
    onBack={onBack}
  />
}
