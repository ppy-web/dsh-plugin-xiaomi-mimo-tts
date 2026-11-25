import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { Button, Input, Modal, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { RiCheckLine, RiFileCopyLine } from 'react-icons/ri'
import type { StudioRole } from '../../shared.js'
import { externalEngine } from '../engine-state.js'
import { useEngineState } from '../use-engine-state.js'
import type { Translate } from '../localization.js'
import { copyText } from '../settings/copy-text.js'
import { readVoiceIdHistory, readVoiceIdNames, subscribeVoiceIds, voiceIdRevision } from '../settings/voice-id-history.js'
import { buildDirectorPrompt, inspectDirectorPromptRoles } from './director-prompt.js'
import type { DirectorPromptCastScope, DirectorPromptLocale } from './director-prompt.js'
import type { StudioVoiceIdLibrary } from './studio-voice-options.js'
import type { StudioProviderKeyMap } from './use-studio-provider-statuses.js'

export interface StudioDirectorPromptModalProps {
  t: Translate
  roles: readonly StudioRole[]
  keyStatuses: StudioProviderKeyMap
  mossEnabled: boolean
  onClose: () => void
}

function detectPromptLocale(t: Translate): DirectorPromptLocale {
  return /[\u4e00-\u9fff]/u.test(t('studio.title')) ? 'zh' : 'en'
}

export function StudioDirectorPromptModal({
  t,
  roles,
  keyStatuses,
  mossEnabled,
  onClose,
}: StudioDirectorPromptModalProps): ReactElement {
  useEngineState()
  const modalId = useId()
  const previewRef = useRef<HTMLTextAreaElement>(null)
  const copyTimerRef = useRef<number | null>(null)
  const [selectedScope, setSelectedScope] = useState<DirectorPromptCastScope | null>(null)
  const [theme, setTheme] = useState('')
  const [pacingAndTone, setPacingAndTone] = useState('')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  const locale = detectPromptLocale(t)
  const externalName = externalEngine()?.name
  const voiceIdRev = useSyncExternalStore(subscribeVoiceIds, voiceIdRevision, () => 0)
  const voiceIdLibrary = useMemo<StudioVoiceIdLibrary>(() => ({
    cloned: { history: readVoiceIdHistory('cloned'), names: readVoiceIdNames('cloned') },
    standard: { history: readVoiceIdHistory('standard'), names: readVoiceIdNames('standard') },
    breeze: { history: readVoiceIdHistory('breeze'), names: readVoiceIdNames('breeze') },
  }), [voiceIdRev])

  const inspection = useMemo(() => inspectDirectorPromptRoles(roles, {
    keyStatuses,
    mossEnabled,
    ...(externalName ? { externalEngineName: externalName } : {}),
    voiceIdLibrary,
    locale,
  }), [roles, keyStatuses, mossEnabled, externalName, voiceIdLibrary, locale])

  const hasReadyRoles = inspection.ready.length > 0
  const hasMixedReadiness = hasReadyRoles && inspection.unavailable.length > 0
  const effectiveScope: DirectorPromptCastScope = selectedScope === 'all'
    ? 'all'
    : hasReadyRoles
      ? 'ready'
      : 'all'

  const promptText = useMemo(() => buildDirectorPrompt(roles, {
    keyStatuses,
    mossEnabled,
    ...(externalName ? { externalEngineName: externalName } : {}),
    voiceIdLibrary,
    castScope: effectiveScope,
    brief: { theme, pacingAndTone },
    locale,
  }), [roles, keyStatuses, mossEnabled, externalName, voiceIdLibrary, effectiveScope, theme, pacingAndTone, locale])

  const charCount = useMemo(() => Array.from(promptText).length, [promptText])

  useEffect(() => {
    setCopyStatus('idle')
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
  }, [promptText])

  useEffect(() => () => {
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
  }, [])

  const selectAllPreview = (): void => {
    previewRef.current?.focus()
    previewRef.current?.select()
  }

  const handleCopy = async (): Promise<void> => {
    const ok = await copyText(promptText)
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
    if (ok) {
      setCopyStatus('copied')
      copyTimerRef.current = window.setTimeout(() => {
        setCopyStatus('idle')
        copyTimerRef.current = null
      }, 2200)
      return
    }
    setCopyStatus('failed')
    selectAllPreview()
  }

  const scopeSummary = inspection.all.length === 0
    ? t('studio.directorPrompt.scopeEmptySummary')
    : !hasReadyRoles
      ? t('studio.directorPrompt.scopeNoneReadyHint').replace('{count}', String(inspection.all.length))
      : !hasMixedReadiness
        ? t('studio.directorPrompt.scopeAllReadySummary').replace('{count}', String(inspection.all.length))
        : effectiveScope === 'ready'
          ? t('studio.directorPrompt.scopeReadySummary').replace('{count}', String(inspection.ready.length))
          : t('studio.directorPrompt.scopeAllSummary')
            .replace('{count}', String(inspection.all.length))
            .replace('{ready}', String(inspection.ready.length))

  return (
    <Modal
      open
      title={t('studio.copyDirectorPrompt')}
      description={t('studio.directorPrompt.description')}
      closeLabel={t('studio.directorPrompt.close')}
      onClose={onClose}
      className="xmimo-ui-scope xmimo-studio-prompt-modal"
      contentClassName="xmimo-studio-prompt-modal-content"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('studio.directorPrompt.close')}
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            data-modal-autofocus=""
            onClick={() => { void handleCopy() }}
          >
            {copyStatus === 'copied' ? <RiCheckLine size={15} aria-hidden="true" /> : <RiFileCopyLine size={15} aria-hidden="true" />}
            <span>{t(copyStatus === 'copied' ? 'studio.copiedDirectorPrompt' : 'studio.directorPrompt.copy')}</span>
          </Button>
        </>
      }
    >
      <div className="xmimo-studio-prompt-modal-body">
        <div className="xmimo-studio-prompt-scope-row">
          <div className="xmimo-studio-prompt-scope-meta">
            <strong>{t('studio.directorPrompt.castScope')}</strong>
            <small>{scopeSummary}</small>
          </div>
          {inspection.all.length > 0 && (hasMixedReadiness || !hasReadyRoles) ? (
            <SegmentedControl<DirectorPromptCastScope>
              id={`${modalId}-scope`}
              value={effectiveScope}
              options={[
                {
                  value: 'ready',
                  label: t('studio.directorPrompt.scopeReady').replace('{count}', String(inspection.ready.length)),
                  disabled: !hasReadyRoles,
                },
                {
                  value: 'all',
                  label: t('studio.directorPrompt.scopeAll').replace('{count}', String(inspection.all.length)),
                },
              ]}
              label={t('studio.directorPrompt.castScope')}
              onChange={setSelectedScope}
              className="xmimo-tts-settings-segmented"
            />
          ) : null}
        </div>

        <div className="xmimo-studio-prompt-brief-grid">
          <div className="xmimo-studio-field">
            <label htmlFor={`${modalId}-theme`}>{t('studio.directorPrompt.themeLabel')}</label>
            <Input
              id={`${modalId}-theme`}
              type="text"
              maxLength={240}
              value={theme}
              placeholder={t('studio.directorPrompt.themePlaceholder')}
              onChange={event => setTheme(event.target.value)}
            />
          </div>
          <div className="xmimo-studio-field">
            <label htmlFor={`${modalId}-tone`}>{t('studio.directorPrompt.toneLabel')}</label>
            <Input
              id={`${modalId}-tone`}
              type="text"
              maxLength={120}
              value={pacingAndTone}
              placeholder={t('studio.directorPrompt.tonePlaceholder')}
              onChange={event => setPacingAndTone(event.target.value)}
            />
          </div>
        </div>

        <div className="xmimo-studio-field">
          <div className="xmimo-studio-prompt-preview-head">
            <label htmlFor={`${modalId}-preview`}>{t('studio.directorPrompt.previewLabel')}</label>
            <div className="xmimo-studio-prompt-preview-meta">
              <span>{t('studio.directorPrompt.charCount').replace('{count}', String(charCount))}</span>
              <Button type="button" variant="ghost" size="sm" onClick={selectAllPreview}>
                {t('studio.directorPrompt.selectAll')}
              </Button>
            </div>
          </div>
          <textarea
            ref={previewRef}
            id={`${modalId}-preview`}
            readOnly
            rows={11}
            className="xmimo-studio-textarea xmimo-studio-prompt-preview"
            value={promptText}
          />
          <small className="xmimo-split-bar-desc">{t('studio.directorPrompt.usageHint')}</small>
        </div>

        {copyStatus !== 'idle' ? (
          <p className="xmimo-studio-prompt-status" data-state={copyStatus} role="status">
            {t(copyStatus === 'copied' ? 'studio.directorPrompt.copiedNotice' : 'studio.directorPrompt.copyFailedNotice')}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
