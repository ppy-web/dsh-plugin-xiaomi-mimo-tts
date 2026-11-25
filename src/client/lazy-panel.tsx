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

export interface LazyPanelComponent<Props extends PanelProps> {
  (props: Props): ReactElement
  preload: () => void
}

export function lazyPanel<Props extends PanelProps>(load: () => Promise<ComponentType<Props>>, options?: LazyPanelOptions): LazyPanelComponent<Props> {
  let resolved: ComponentType<Props> | null = null
  let inFlight: Promise<ComponentType<Props>> | null = null
  let sharedLazy: ReturnType<typeof createLazy> | null = null

  const loadOnce = (): Promise<ComponentType<Props>> => {
    if (resolved !== null) return Promise.resolve(resolved)
    if (inFlight !== null) return inFlight
    inFlight = load().then(Loaded => {
      resolved = Loaded
      inFlight = null
      return Loaded
    }, error => {
      inFlight = null
      throw error
    })
    return inFlight
  }

  function createLazy() {
    return lazy(async () => {
      try {
        const Loaded = await loadOnce()
        return { default: ({ panelProps }: { panelProps: Props; onRetry: () => void }) => <Loaded {...panelProps} /> }
      } catch {
        return {
          default: ({ panelProps, onRetry }: { panelProps: Props; onRetry: () => void }) => (
            <PanelStatus {...panelProps} failed onRetry={onRetry} />
          ),
        }
      }
    })
  }

  function DeferredPanel(props: Props): ReactElement {
    const [attempt, setAttempt] = useState(0)
    // Once a deferred chunk has resolved, render synchronously on revisit to avoid
    // flashing the loading view every time the user switches panels.
    const Panel = useMemo(() => {
      if (resolved !== null) return null
      if (attempt === 0) {
        sharedLazy ??= createLazy()
        return sharedLazy
      }
      return createLazy()
    }, [attempt])

    if (resolved !== null) {
      const Loaded = resolved
      return <Loaded {...props} />
    }

    const retry = (): void => {
      sharedLazy = null
      setAttempt(current => current + 1)
    }

    const ActivePanel = Panel!
    return <Suspense fallback={options?.silentLoading ? null : <PanelStatus {...props} />}><ActivePanel panelProps={props} onRetry={retry} /></Suspense>
  }

  DeferredPanel.preload = (): void => {
    if (resolved === null && inFlight === null) {
      void loadOnce().catch(() => {})
    }
  }

  return DeferredPanel
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
