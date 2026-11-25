import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import { Button, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiArrowLeftSLine, RiFileTextLine, RiSparkling2Line } from 'react-icons/ri'
import { TTS_STUDIO_PREVIEW_ROUTE } from '../../constants.js'
import type { ResolvedTtsSettings, StudioLine, StudioRole, StudioRoleProvider } from '../../shared.js'
import type { SpeechActivity } from '../announcements/speech-activity.js'
import { isSpeechBusy } from '../announcements/speech-activity.js'
import type { Translate } from '../localization.js'
import { PreviewPlayer } from '../playback/preview-player.js'
import { STUDIO_PAGE_STYLES } from '../style/studio-styles.js'
import { useClientStyle } from '../style/inject.js'
import { useWarningToast } from '../use-warning-toast.js'
import { refreshStudioState, studioErrorMessage, useStudioState } from './studio-client-store.js'
import { StudioDirectorPromptModal } from './studio-director-prompt-modal.js'
import { StudioRolesTab } from './studio-roles-tab.js'
import { StudioScriptsTab } from './studio-scripts-tab.js'
import { StudioTasksTab } from './studio-tasks-tab.js'
import type { StudioTabId } from './studio-workspace-store.js'
import { useStudioProviderKeyStatuses } from './use-studio-provider-statuses.js'

export interface StudioPageProps {
  t: Translate
  volume: number
  settings: ResolvedTtsSettings
  savedMossEnabled?: boolean
  sampleText?: string | undefined
  tab?: StudioTabId
  initialTab?: StudioTabId
  onTabChange?: (tab: StudioTabId) => void
  onWriteWithDsh?: (() => Promise<boolean> | boolean | void) | undefined
  onConfigureProvider: (provider: StudioRoleProvider) => void
  speechActivity?: SpeechActivity | undefined
  beforePlayback: () => boolean
  onBack: () => void
}

export function StudioPage({
  t,
  volume,
  settings,
  savedMossEnabled = settings.mossEnabled,
  sampleText,
  tab: controlledTab,
  initialTab = 'scripts',
  onTabChange,
  onWriteWithDsh,
  onConfigureProvider,
  speechActivity,
  beforePlayback,
  onBack,
}: StudioPageProps): ReactElement {
  useClientStyle('studio-page', STUDIO_PAGE_STYLES)
  const studio = useStudioState()
  const keyStatuses = useStudioProviderKeyStatuses(true)
  const [uncontrolledTab, setUncontrolledTab] = useState<StudioTabId>(initialTab)
  const tab = controlledTab ?? uncontrolledTab
  const tabsId = useId()
  const [focusedTaskId, setFocusedTaskId] = useState<string | undefined>()
  const setTab = useCallback((next: StudioTabId): void => {
    if (next !== 'tasks') setFocusedTaskId(undefined)
    if (onTabChange) onTabChange(next)
    else setUncontrolledTab(next)
  }, [onTabChange])
  const [promptModalOpen, setPromptModalOpen] = useState(false)
  const [launchingDirector, setLaunchingDirector] = useState(false)
  const [directorNotice, setDirectorNotice] = useState<string | null>(null)
  const [showDeleteError, deleteErrorToast] = useWarningToast()
  const [rehearsingLineId, setRehearsingLineId] = useState<string | null>(null)
  const [rehearsingSequence, setRehearsingSequence] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const rehearsalRunRef = useRef(0)

  const [player] = useState(() => new PreviewPlayer(view => setPreviewFailed(view.status === 'error')))

  useEffect(() => { player.setVolume(volume) }, [player, volume])

  const stopRehearsal = useCallback(() => {
    rehearsalRunRef.current += 1
    player.stop()
    setRehearsingLineId(null)
    setRehearsingSequence(false)
  }, [player])

  useEffect(() => speechActivity?.register(
    () => isSpeechBusy(player.getView().status) || rehearsingSequence,
    stopRehearsal,
  ), [speechActivity, player, rehearsingSequence, stopRehearsal])

  useEffect(() => () => {
    rehearsalRunRef.current += 1
    void player.dispose()
  }, [player])

  const roleMap = useMemo(() => new Map(studio.roles.map(r => [r.id, r])), [studio.roles])

  const playOneUtterance = useCallback((text: string, role: StudioRole, speechInstruction?: string): Promise<void> => (
    player.playWavRequest(TTS_STUDIO_PREVIEW_ROUTE, { roleId: role.id, text, speechInstruction })
  ), [player])

  const handleSampleRole = useCallback((role: StudioRole): void => {
    stopRehearsal()
    if (!beforePlayback()) return
    const sample = sampleText?.trim() || t('settings.previewDefaultText')
    void playOneUtterance(sample, role)
  }, [stopRehearsal, beforePlayback, sampleText, t, playOneUtterance])

  const handlePreviewLine = useCallback((line: StudioLine, role: StudioRole): void => {
    if (rehearsingLineId === line.id && !rehearsingSequence) {
      stopRehearsal()
      return
    }
    stopRehearsal()
    if (!beforePlayback()) return
    const runId = rehearsalRunRef.current
    setRehearsingLineId(line.id)
    void playOneUtterance(line.text, role, line.speechInstruction).finally(() => {
      if (rehearsalRunRef.current === runId) setRehearsingLineId(null)
    })
  }, [rehearsingLineId, rehearsingSequence, stopRehearsal, beforePlayback, playOneUtterance])

  const handleToggleRehearseAll = useCallback((lines: readonly StudioLine[]): void => {
    if (rehearsingSequence) {
      stopRehearsal()
      return
    }
    stopRehearsal()
    if (!beforePlayback()) return
    const runId = rehearsalRunRef.current
    setRehearsingSequence(true)
    void (async () => {
      for (const line of lines) {
        if (rehearsalRunRef.current !== runId) break
        const role = roleMap.get(line.roleId)
        if (!role || !line.text.trim()) continue
        setRehearsingLineId(line.id)
        await playOneUtterance(line.text, role, line.speechInstruction)
        if (rehearsalRunRef.current !== runId || player.getView().status === 'error') break
        if (line.pauseAfterMs > 0) {
          await new Promise<void>(resolve => window.setTimeout(resolve, line.pauseAfterMs))
        }
      }
      if (rehearsalRunRef.current === runId) {
        setRehearsingLineId(null)
        setRehearsingSequence(false)
      }
    })()
  }, [rehearsingSequence, stopRehearsal, beforePlayback, roleMap, playOneUtterance, player])

  const writeWithDsh = async (): Promise<void> => {
    if (launchingDirector) return
    stopRehearsal()
    setDirectorNotice(null)
    if (!onWriteWithDsh) {
      setDirectorNotice(t('studio.writeWithDshUnavailable'))
      return
    }
    setLaunchingDirector(true)
    try {
      const launched = await onWriteWithDsh()
      if (launched === false) setDirectorNotice(t('studio.writeWithDshUnavailable'))
    } catch {
      setDirectorNotice(t('studio.writeWithDshUnavailable'))
    } finally {
      setLaunchingDirector(false)
    }
  }

  return (
    <div className="xmimo-ui-scope xmimo-studio-page">
      <div className="xmimo-studio-header">
        <div className="xmimo-studio-header-row">
          <h2 className="xmimo-studio-title" aria-label={t('studio.title')}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="xmimo-studio-title-back"
              aria-label={t('studio.back')}
              title={t('studio.back')}
              onClick={() => { stopRehearsal(); onBack() }}
            >
              <RiArrowLeftSLine size={18} aria-hidden="true" focusable="false" />
              <span>{t('studio.title')}</span>
            </Button>
          </h2>
          {tab === 'scripts' ? (
            <div className="xmimo-studio-writing-actions">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={studio.status === 'loading' && studio.revision === 0}
                title={t('studio.directorPrompt.tooltip')}
                onClick={() => setPromptModalOpen(true)}
              >
                <RiFileTextLine size={15} aria-hidden="true" />
                <span>{t('studio.copyDirectorPrompt')}</span>
              </Button>
              <Button type="button" variant="primary" size="sm" disabled={launchingDirector} onClick={() => { void writeWithDsh() }}>
                <RiSparkling2Line size={15} aria-hidden="true" />
                <span>{t(launchingDirector ? 'studio.writingWithDsh' : 'studio.writeWithDsh')}</span>
              </Button>
            </div>
          ) : null}
        </div>
        <SegmentedControl<StudioTabId>
          id={tabsId}
          value={tab}
          options={[
            { value: 'scripts', label: t('studio.tab.scripts') },
            { value: 'roles', label: t('studio.tab.roles') },
            { value: 'tasks', label: t('studio.tab.tasks') },
          ]}
          label={t('studio.title')}
          onChange={setTab}
          className="xmimo-tts-settings-segmented xmimo-studio-main-tabs"
        />
      </div>

      {directorNotice ? (
        <div className="xmimo-studio-banner" role="status">{directorNotice}</div>
      ) : null}
      {studio.status === 'demo' ? (
        <div className="xmimo-studio-banner" role="status">{t('studio.previewDemoBanner')}</div>
      ) : null}
      {studio.status === 'loading' ? <p role="status">{t('studio.state.loading')}</p> : null}
      {studio.status === 'error' ? (
        <div className="xmimo-studio-banner" role="status">
          <span>{studio.errorCode === 'studio-store-busy' || studio.errorCode === 'studio-store-corrupt'
            ? studioErrorMessage(studio.errorCode, t)
            : t('studio.state.unavailable')}</span>{' '}
          <Button type="button" variant="outline" size="sm" onClick={() => { void refreshStudioState() }}>
            {t('studio.state.retry')}
          </Button>
        </div>
      ) : null}
      {previewFailed ? <p className="xmimo-tts-failed" role="alert">{t('studio.error.preview')}</p> : null}
      {deleteErrorToast}

      {studio.revision === 0 ? null : <div role="tabpanel" id={tabsId + '-' + tab + '-panel'} aria-labelledby={tabsId + '-' + tab}>
        {tab === 'scripts' ? <StudioScriptsTab
          t={t}
          roles={studio.roles}
          scripts={studio.scripts}
          keyStatuses={keyStatuses}
          mossEnabled={savedMossEnabled}
          rehearsingLineId={rehearsingLineId}
          rehearsingSequence={rehearsingSequence}
          onPreviewLine={handlePreviewLine}
          onToggleRehearseAll={handleToggleRehearseAll}
          onTaskStarted={id => { setFocusedTaskId(id); setTab('tasks') }}
          onConfigureProvider={provider => { stopRehearsal(); onConfigureProvider(provider) }}
          onDeleteError={showDeleteError}
        /> : tab === 'roles' ? <StudioRolesTab
          t={t}
          roles={studio.roles}
          keyStatuses={keyStatuses}
          mossEnabled={savedMossEnabled}
          settings={settings}
          onSampleRole={handleSampleRole}
          onDeleteError={showDeleteError}
        /> : <StudioTasksTab
          t={t}
          tasks={studio.tasks}
          storageBytes={studio.storageBytes}
          maxStorageBytes={studio.maxStorageBytes}
          storageRoot={studio.storageRoot}
          focusedTaskId={focusedTaskId}
          volume={volume}
          beforePlayback={() => {
            stopRehearsal()
            return beforePlayback()
          }}
          onGoScripts={() => setTab('scripts')}
          onDeleteError={showDeleteError}
        />}
      </div>}
      {promptModalOpen ? (
        <StudioDirectorPromptModal
          t={t}
          roles={studio.roles}
          keyStatuses={keyStatuses}
          mossEnabled={savedMossEnabled}
          onClose={() => setPromptModalOpen(false)}
        />
      ) : null}
    </div>
  )
}
