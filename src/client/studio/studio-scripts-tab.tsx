import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactElement } from 'react'
import { Button, Input, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  RiAddLine,
  RiArrowDownLine,
  RiArrowRightSLine,
  RiArrowUpLine,
  RiClipboardLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiPlayList2Line,
  RiRecordCircleLine,
  RiSaveLine,
  RiSearchLine,
  RiStopMiniFill,
  RiVolumeUpLine,
} from 'react-icons/ri'
import {
  STUDIO_DEFAULT_PAUSE_MS,
  STUDIO_MAX_LINE_CHARACTERS,
  STUDIO_MAX_LINES_PER_SCRIPT,
  STUDIO_MAX_PAUSE_MS,
  STUDIO_MAX_SCRIPT_TITLE_LENGTH,
  formatStudioScriptText,
} from '../../shared.js'
import type { StudioLine, StudioRole, StudioRoleProvider, StudioScript } from '../../shared.js'
import { STUDIO_BUILTIN_SCRIPT_IDS } from '../../studio-presets.js'
import { invalidateApiKeyStatus } from '../conversation/api-key-status.js'
import { externalEngine } from '../engine-state.js'
import type { Translate } from '../localization.js'
import { AudioTagPicker } from '../settings/controls/audio-tag-picker.js'
import { VoiceReadingSelect } from '../settings/voice-reading-select.js'
import type { VoiceReadingSelectOption } from '../settings/voice-reading-select.js'
import { SplitBar } from './split-bar.js'
import type { SplitSegment } from './split-bar.js'
import { StudioCastReplacement } from './studio-cast-replacement.js'
import { studioClient, studioErrorMessage } from './studio-client-store.js'
import { StudioDeleteDialog } from './studio-delete-dialog.js'
import { checkStudioRecording } from './studio-recording-check.js'
import { studioScriptCopyTitle, studioScriptHasEdits, studioScriptKey, studioWorkspaceStore, useStudioWorkspaceState } from './studio-workspace-store.js'
import type { StudioScriptDraft } from './studio-workspace-store.js'
import { resolveStudioRoleAvailability } from './use-studio-provider-statuses.js'
import type { StudioProviderKeyMap } from './use-studio-provider-statuses.js'

export interface StudioScriptsTabProps {
  t: Translate
  roles: readonly StudioRole[]
  scripts: readonly StudioScript[]
  keyStatuses: StudioProviderKeyMap
  mossEnabled: boolean
  rehearsingLineId: string | null
  rehearsingSequence: boolean
  onPreviewLine: (line: StudioLine, role: StudioRole) => void
  onToggleRehearseAll: (lines: readonly StudioLine[]) => void
  onTaskStarted: (taskId: string) => void
  onConfigureProvider: (provider: StudioRoleProvider) => void
  onOpenRoles: () => void
  onDeleteError: (message: string) => void
}

function makeLineId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function engineLabel(provider: StudioRoleProvider, t: Translate): string {
  if (provider === 'xiaomi') return t('settings.providerXiaomi')
  if (provider === 'doubao') return t('settings.providerDoubao')
  if (provider === 'breeze') return t('settings.providerBreeze')
  if (provider === 'deepseek') return t('settings.providerDeepseek')
  if (provider === 'moss') return 'MOSS'
  const external = externalEngine()
  return external?.provider === provider ? external.name : provider.slice('external:'.length)
}

export function StudioScriptsTab({
  t,
  roles,
  scripts,
  keyStatuses,
  mossEnabled,
  rehearsingLineId,
  rehearsingSequence,
  onPreviewLine,
  onToggleRehearseAll,
  onTaskStarted,
  onConfigureProvider,
  onOpenRoles,
  onDeleteError,
}: StudioScriptsTabProps): ReactElement {
  const { script, scriptDrafts, scriptOperation } = useStudioWorkspaceState()
  const { selectedId, description, lines, editorMode, rawText, textDirty, dirty, syncedUpdatedAt } = script
  const activeKey = studioScriptKey(script)
  const savedScript = scripts.find(item => item.id === selectedId)
  const hasEditsToSave = savedScript && studioScriptHasEdits(script, savedScript)
  const deletableScript = dirty ? undefined : savedScript
  const copyTitleFor = (draft: StudioScriptDraft): string => {
    if (draft.dirty && savedScript && draft.title !== savedScript.title) return draft.title
    const titles = [...scripts.map(item => item.title), ...scriptDrafts.map(item => item.title)]
    return studioScriptCopyTitle(draft.title, titles, t('studio.scripts.copySuffix'))
  }
  const title = hasEditsToSave ? copyTitleFor(script) : script.title
  const busy = scriptOperation !== null
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [lineQuery, setLineQuery] = useState('')
  const editorId = useId()
  const lineListRef = useRef<HTMLFieldSetElement>(null)
  const lineRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map())
  const draftTextRef = useRef<HTMLTextAreaElement>(null)
  const pendingFocus = useRef<{ lineId: string; chooseRole: boolean } | 'text' | null>(null)
  const mounted = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const roleMap = useMemo(() => new Map(roles.map(role => [role.id, role])), [roles])
  const narratorName = t('studio.roles.narratorDefault')
  const recordingCheck = useMemo(() => {
    try {
      const source = editorMode === 'text' ? { rawText, narratorName } : { lines }
      return { ...checkStudioRecording(source, roles, keyStatuses, mossEnabled), error: null }
    } catch (err) {
      return { lineCount: 0, issues: [], error: studioErrorMessage(err, t) }
    }
  }, [editorMode, rawText, narratorName, lines, roles, keyStatuses, mossEnabled, t])
  const hasMissingLineRole = recordingCheck.issues.some(issue => !issue.role)

  useEffect(() => {
    if (busy || dirty || !selectedId) return
    const found = scripts.find(item => item.id === selectedId)
    if (!found) {
      studioWorkspaceStore.syncScriptFromHost(null)
      return
    }
    if (syncedUpdatedAt !== found.updatedAt) {
      const formatted = formatStudioScriptText(found.lines, roles, narratorName)
      const forceBlocks = found.lines.some(line => !roleMap.has(line.roleId))
      studioWorkspaceStore.syncScriptFromHost(found, formatted, { keepMode: !forceBlocks })
    }
  }, [busy, dirty, selectedId, syncedUpdatedAt, scripts, roles, roleMap, narratorName])

  const scriptOptions = useMemo<VoiceReadingSelectOption[]>(() => {
    const drafts = new Map(scriptDrafts.map(item => [studioScriptKey(item), item]))
    if (script.dirty) drafts.set(studioScriptKey(script), script)
    const options = scripts.map(item => {
      const draft = drafts.get(item.id)
      drafts.delete(item.id)
      return { id: item.id, label: draft ? `${draft.title || item.title} · ${t('studio.scripts.draft')}` : item.title }
    })
    for (const [id, draft] of drafts) {
      options.push({ id, label: `${draft.title.trim() || t('studio.scripts.untitled')} · ${t('studio.scripts.draft')}` })
    }
    return options
  }, [scripts, scriptDrafts, script, t])

  const roleOptions = useMemo<VoiceReadingSelectOption[]>(
    () => roles.map(role => {
      const avail = resolveStudioRoleAvailability(role, keyStatuses, mossEnabled)
      return {
        id: role.id,
        disabled: role.enabled === false,
        icon: !avail.available
          ? <RiErrorWarningLine size={14} className="xmimo-studio-key-warn-icon" aria-hidden="true" />
          : <span className="xmimo-studio-role-dot" style={{ '--role-color': role.color } as CSSProperties} aria-hidden="true" />,
        label: avail.available ? role.name : (
          <span className="xmimo-studio-provider-option">
            <span>{role.name}</span>
            <span className="xmimo-studio-key-warn">{t(avail.reasonKey ?? 'studio.roles.apiKeyMissing')}</span>
          </span>
        ),
      }
    }),
    [roles, keyStatuses, mossEnabled, t],
  )

  const firstReadyRoleId = useMemo(
    () => roles.find(role => resolveStudioRoleAvailability(role, keyStatuses, mossEnabled).available)?.id
      ?? roles.find(role => role.enabled !== false)?.id ?? '',
    [roles, keyStatuses, mossEnabled],
  )

  const indexedLines = useMemo(() => {
    const query = lineQuery.normalize('NFKC').trim().toLowerCase()
    const number = query.match(/^#?\s*(\d+)$/u)?.[1]
    return lines.flatMap((line, index) => {
      const matches = !query || (number !== undefined
        ? index + 1 === Number(number)
        : (roleMap.get(line.roleId)?.name.toLowerCase().includes(query) || line.text.toLowerCase().includes(query)))
      return matches ? [{ line, index }] : []
    })
  }, [lineQuery, lines, roleMap])

  const focusEditor = (): void => {
    const target = pendingFocus.current
    if (target === 'text') {
      draftTextRef.current?.focus()
      pendingFocus.current = null
    } else if (target) {
      const field = lineRefs.current.get(target.lineId)
      if (!field) return
      pendingFocus.current = null
      if (target.chooseRole) {
        const selector = field.closest('.xmimo-studio-line-card')?.querySelector<HTMLButtonElement>('.xmimo-studio-line-role-select')
        selector?.focus()
        selector?.click()
      } else field.focus()
    }
  }

  useEffect(focusEditor, [activeKey, editorMode, indexedLines])

  const castShareSegments = useMemo<SplitSegment[]>(() => {
    const totals = new Map<string, number>()
    for (const line of lines) {
      const chars = Array.from(line.text.trim()).length
      if (chars <= 0) continue
      totals.set(line.roleId, (totals.get(line.roleId) ?? 0) + chars)
    }
    return [...totals.entries()].map(([roleId, value]) => {
      const role = roleMap.get(roleId)
      return {
        id: roleId,
        label: role?.name ?? t('studio.roles.narratorDefault'),
        value,
        ...(role?.color ? { color: role.color } : {}),
      }
    })
  }, [lines, roleMap, t])

  const selectScript = (id: string): void => {
    setError(null)
    setLineQuery('')
    if (lineListRef.current && id !== activeKey) lineListRef.current.scrollTop = 0
    const found = scripts.find(item => item.id === id)
    if (found) {
      const formatted = formatStudioScriptText(found.lines, roles, narratorName)
      const forceBlocks = found.lines.some(line => !roleMap.has(line.roleId))
      studioWorkspaceStore.openScript(found, formatted, forceBlocks ? 'blocks' : editorMode)
    } else studioWorkspaceStore.openScriptDraft(id)
  }

  const createNewScript = (mode: 'blocks' | 'text'): void => {
    setError(null)
    setLineQuery('')
    const line = mode === 'blocks' && firstReadyRoleId
      ? { id: makeLineId(), roleId: firstReadyRoleId, text: '', pauseAfterMs: STUDIO_DEFAULT_PAUSE_MS }
      : null
    pendingFocus.current = line ? { lineId: line.id, chooseRole: false } : 'text'
    studioWorkspaceStore.newScript(t('studio.scripts.untitled'), line ? 'blocks' : 'text', line ? [line] : [])
  }

  const switchMode = (next: 'blocks' | 'text'): void => {
    if (next === 'text' && !textDirty && hasMissingLineRole) {
      setError(t('studio.error.missingRole'))
      return
    }
    setError(null)
    const formatted = next === 'text' && !textDirty ? formatStudioScriptText(lines.filter(line => line.text.trim()), roles, narratorName) : ''
    studioWorkspaceStore.setScriptMode(next, formatted)
  }

  const editScript = (edit: (draft: StudioScriptDraft) => Partial<StudioScriptDraft> | null): void => {
    studioWorkspaceStore.updateScript(draft => {
      const changes = edit(draft)
      if (!changes) return draft
      const next = { ...draft, ...changes, dirty: true }
      if (!draft.selectedId) return next
      return { ...next, selectedId: '', syncedUpdatedAt: null, title: changes.title ?? copyTitleFor(draft) }
    })
    setError(null)
  }

  const addLine = (after?: StudioLine): void => {
    if (lines.length >= STUDIO_MAX_LINES_PER_SCRIPT) return
    const preceding = after ?? lines.at(-1)
    const previousRole = preceding ? roleMap.get(preceding.roleId) : undefined
    const fallbackRole = previousRole && previousRole.enabled !== false ? previousRole.id : firstReadyRoleId
    if (!fallbackRole) {
      pendingFocus.current = 'text'
      switchMode('text')
      return
    }
    const line = { id: makeLineId(), roleId: fallbackRole, text: '', pauseAfterMs: STUDIO_DEFAULT_PAUSE_MS }
    pendingFocus.current = { lineId: line.id, chooseRole: false }
    setLineQuery('')
    editScript(cur => {
      const index = after ? cur.lines.findIndex(item => item.id === after.id) : cur.lines.length - 1
      const next = [...cur.lines]
      next.splice(index + 1, 0, line)
      return { lines: next }
    })
  }

  const updateLine = (id: string, patch: Partial<StudioLine>): void => {
    editScript(cur => ({
      lines: cur.lines.map(item => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const replaceRole = (fromId: string, toId: string): void => {
    const target = roleMap.get(toId)
    if (fromId === toId || !target || target.enabled === false) return
    editScript(cur => cur.lines.some(line => line.roleId === fromId) ? {
      lines: cur.lines.map(line => line.roleId === fromId ? { ...line, roleId: toId } : line),
    } : null)
    setLineQuery('')
  }

  const moveLine = (index: number, delta: -1 | 1): void => {
    const target = index + delta
    if (target < 0 || target >= lines.length) return
    editScript(cur => {
      const next = [...cur.lines]
      const [removed] = next.splice(index, 1)
      next.splice(target, 0, removed!)
      return { lines: next }
    })
  }

  const removeLine = (id: string): void => {
    editScript(cur => ({ lines: cur.lines.filter(item => item.id !== id) }))
  }

  const insertAudioTag = (line: StudioLine, tag: string, placement?: 'start'): void => {
    const el = lineRefs.current.get(line.id)
    const start = placement === 'start' ? 0 : el?.selectionStart ?? line.text.length
    const end = placement === 'start' ? 0 : el?.selectionEnd ?? start
    const spacer = start > 0 && !/\s$/u.test(line.text.slice(0, start)) ? ' ' : ''
    const next = `${line.text.slice(0, start)}${spacer}${tag}${line.text.slice(end)}`
    updateLine(line.id, { text: Array.from(next).slice(0, STUDIO_MAX_LINE_CHARACTERS).join('') })
  }

  const saveScript = async (record: boolean): Promise<void> => {
    if (recordingCheck.error || !recordingCheck.lineCount || hasMissingLineRole) return
    if (record && recordingCheck.issues.length > 0) return
    if (!title.trim() && editorMode === 'blocks') {
      setError(t('studio.error.titleRequired'))
      return
    }
    if (!studioWorkspaceStore.beginScriptOperation(record ? 'record' : 'save')) return
    setError(null)
    try {
      const fields = {
        title: title.trim() || t('studio.scripts.untitled'),
        ...(description.trim() ? { description: description.trim() } : {}),
      }
      let saved = hasEditsToSave ? undefined : savedScript
      if (!saved) {
        saved = editorMode === 'text'
          ? (await studioClient.importScript({ ...fields, text: rawText, defaultNarratorName: narratorName })).script
          : await studioClient.saveScript({ ...fields, lines: lines.filter(line => line.text.trim()) })
      }
      const latestRoles = studioClient.getSnapshot().roles
      studioWorkspaceStore.syncScriptFromHost(
        saved,
        formatStudioScriptText(saved.lines, latestRoles, narratorName),
        { keepTextDraft: editorMode === 'blocks' },
      )
      if (record) {
        const checked = checkStudioRecording({ lines: saved.lines }, latestRoles, keyStatuses, mossEnabled)
        if (checked.issues.length > 0) {
          setIssuesOpen(true)
          return
        }
        const task = await studioClient.startTask({ scriptId: saved.id })
        if (mounted.current) onTaskStarted(task.id)
      }
    } catch (err) {
      setError(studioErrorMessage(err, t))
    } finally {
      studioWorkspaceStore.endScriptOperation()
    }
  }

  const deleteCurrentScript = async (): Promise<void> => {
    setConfirmDelete(false)
    if (!studioWorkspaceStore.beginScriptOperation('delete')) return
    setError(null)
    try {
      if (deletableScript) await studioClient.deleteScript(deletableScript.id)
      studioWorkspaceStore.syncScriptFromHost(null)
    } catch (err) {
      onDeleteError(studioErrorMessage(err, t))
    } finally {
      studioWorkspaceStore.endScriptOperation()
    }
  }

  const reassignLine = (lineNumber: number): void => {
    const line = lines[lineNumber - 1]
    if (!line || busy) return
    pendingFocus.current = { lineId: line.id, chooseRole: true }
    const nextQuery = '#' + lineNumber
    if (lineQuery === nextQuery) focusEditor()
    else setLineQuery(nextQuery)
  }

  const scriptSelector = scriptOptions.length > 0 ? (
    <VoiceReadingSelect
      label={t('studio.scripts.select')}
      value={activeKey}
      fallbackLabel={t('studio.scripts.select')}
      options={scriptOptions}
      disabled={busy}
      buttonVariant="outline"
      align="start"
      className="xmimo-studio-select-inline xmimo-studio-script-select xmimo-studio-outline-button"
      onSelect={selectScript}
    />
  ) : null
  const newScriptButton = (
    <Button type="button" variant="outline" size="sm" className="xmimo-studio-outline-button" disabled={busy} onClick={() => createNewScript('blocks')}>
      <RiAddLine size={15} aria-hidden="true" />
      <span>{t('studio.scripts.new')}</span>
    </Button>
  )
  const pasteScriptButton = (
    <Button type="button" variant="primary" size="sm" disabled={busy} onClick={() => createNewScript('text')}>
      <RiClipboardLine size={15} aria-hidden="true" />
      <span>{t('studio.scripts.paste')}</span>
    </Button>
  )

  if (!activeKey) {
    const untouchedExample = (item: StudioScript): boolean => item.createdAt === item.updatedAt && STUDIO_BUILTIN_SCRIPT_IDS.includes(item.id)
    const recentScripts = [...scripts].sort((a, b) => {
      return Number(untouchedExample(a)) - Number(untouchedExample(b)) || b.updatedAt - a.updatedAt
    }).slice(0, 6)
    return (
      <div className="xmimo-studio-panel xmimo-studio-script-start">
        <div className="xmimo-studio-toolbar-group">
          {pasteScriptButton}
          {newScriptButton}
          {scriptOptions.some(option => !STUDIO_BUILTIN_SCRIPT_IDS.includes(option.id)) ? scriptSelector : null}
        </div>
        {recentScripts.length > 0 ? (
          <section className="xmimo-studio-samples" aria-label={t('studio.scripts.recentScripts')}>
            <ul className="xmimo-studio-samples-grid">
              {recentScripts.map(sample => {
                const castIds: string[] = []
                for (const line of sample.lines) {
                  if (!castIds.includes(line.roleId)) castIds.push(line.roleId)
                }
                const castRoles = castIds.map(id => roleMap.get(id)).filter((role): role is StudioRole => role !== undefined)
                const visibleCast = castRoles.slice(0, 3)
                const extraCast = castRoles.length - visibleCast.length
                const charCount = sample.lines.reduce((sum, line) => sum + [...line.text].length, 0)
                return (
                  <li key={sample.id}>
                    <button
                      type="button"
                      className="xmimo-studio-sample-card"
                      disabled={busy}
                      onClick={() => selectScript(sample.id)}
                    >
                      <div className="xmimo-studio-sample-card-head">
                        <strong>{sample.title}</strong>
                        <RiArrowRightSLine size={16} className="xmimo-studio-sample-arrow" aria-hidden="true" />
                      </div>
                      {sample.description ? (
                        <p className="xmimo-studio-sample-desc">{sample.description}</p>
                      ) : null}
                      <div className="xmimo-studio-sample-foot">
                        {visibleCast.length > 0 ? (
                          <span className="xmimo-studio-sample-cast">
                            {visibleCast.map(role => (
                              <span key={role.id} className="xmimo-studio-sample-role">
                                <span
                                  className="xmimo-studio-sample-role-dot"
                                  style={{ '--role-color': role.color } as CSSProperties}
                                  aria-hidden="true"
                                />
                                <span>{role.name.split('·')[0]!.trim()}</span>
                              </span>
                            ))}
                            {extraCast > 0 ? <span className="xmimo-studio-sample-role-more">+{extraCast}</span> : null}
                          </span>
                        ) : <span />}
                        <span className="xmimo-studio-sample-stats">
                          <small>{t('studio.scripts.lineCount').replace('{count}', String(sample.lines.length))}</small>
                          <small>{charCount.toLocaleString()} {t('studio.splitBar.charsUnit')}</small>
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ) : null}
        {error ? <p className="xmimo-tts-failed" role="alert">{error}</p> : null}
      </div>
    )
  }

  const deleteLabel = t(deletableScript ? 'studio.scripts.delete' : 'studio.scripts.discard')
  const saveStatus = textDirty && editorMode === 'blocks' ? 'pendingText' : !savedScript || hasEditsToSave ? 'unsaved' : 'saved'
  const canSave = !busy && recordingCheck.lineCount > 0 && !hasMissingLineRole
  const canRecord = canSave && recordingCheck.issues.length === 0

  return (
    <div className="xmimo-studio-panel">
      <div className="xmimo-studio-toolbar xmimo-studio-script-toolbar">
        <div className="xmimo-studio-toolbar-group">
          {scriptSelector}
          {newScriptButton}
          <Button type="button" variant="ghost" size="sm" className="xmimo-danger-action" title={deleteLabel} disabled={busy} onClick={() => setConfirmDelete(true)}>
            <RiDeleteBinLine size={15} aria-hidden="true" />
          </Button>
        </div>

        <SegmentedControl
          id={editorId}
          value={editorMode}
          options={[
            { value: 'blocks', label: t('studio.scripts.modeBlocks') },
            { value: 'text', label: t('studio.scripts.modeText') },
          ]}
          label={t('studio.tab.scripts')}
          onChange={switchMode}
          disabled={busy}
          className="xmimo-tts-settings-segmented"
        />
      </div>

      <div className="xmimo-studio-script-meta">
        <div className="xmimo-studio-field-grid">
          <div className="xmimo-studio-field">
            <label htmlFor={editorId + '-title'}>{t('studio.scripts.titleLabel')}</label>
            <Input
              id={editorId + '-title'}
              type="text"
              maxLength={STUDIO_MAX_SCRIPT_TITLE_LENGTH}
              value={title}
              disabled={busy}
              placeholder={t('studio.scripts.titlePlaceholder')}
              onChange={e => editScript(() => ({ title: e.target.value }))}
            />
          </div>
          <div className="xmimo-studio-field">
            <label htmlFor={editorId + '-description'}>{t('studio.scripts.descLabel')}</label>
            <Input
              id={editorId + '-description'}
              type="text"
              maxLength={240}
              value={description}
              disabled={busy}
              placeholder={t('studio.scripts.descPlaceholder')}
              onChange={e => editScript(() => ({ description: e.target.value }))}
            />
          </div>
        </div>

        {editorMode === 'blocks' && castShareSegments.length > 0 ? (
          <SplitBar
            segments={castShareSegments}
            label={t('studio.share.title')}
            description={t('studio.share.scriptDesc')}
            totalLabel={t('studio.splitBar.total')}
            unit={t('studio.splitBar.charsUnit')}
            offLabel={t('studio.splitBar.off')}
            lastGuardLabel={t('studio.splitBar.lastGuard')}
            compact
            toggleable
          />
        ) : null}
      </div>

      <div className="xmimo-studio-script-actions">
        <div className="xmimo-studio-toolbar">
          <div className="xmimo-studio-toolbar-group">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!rehearsingSequence && (busy || editorMode === 'text' || !recordingCheck.lineCount || recordingCheck.issues.length > 0)}
              title={editorMode === 'text' && !rehearsingSequence ? t('studio.scripts.applyBeforeRehearsal') : undefined}
              onClick={() => onToggleRehearseAll(lines)}
            >
              {rehearsingSequence ? <RiStopMiniFill size={15} aria-hidden="true" /> : <RiPlayList2Line size={14} aria-hidden="true" />}
              <span>{t(rehearsingSequence ? 'studio.scripts.rehearseStop' : 'studio.scripts.rehearseAll')}</span>
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!canSave} onClick={() => { void saveScript(false) }}>
              <RiSaveLine size={14} aria-hidden="true" />
              <span>{t(editorMode === 'blocks' ? 'studio.scripts.save' : 'studio.scripts.parseApply')}</span>
            </Button>
            <small className="xmimo-studio-script-status" data-state={saveStatus} role="status">
              {t(`studio.scripts.${saveStatus}`)}
            </small>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!canRecord}
            onClick={() => { void saveScript(true) }}
          >
            <RiRecordCircleLine size={15} aria-hidden="true" />
            <span>{t(scriptOperation === 'record' ? 'studio.scripts.startingTask' : 'studio.scripts.startBackground')}</span>
          </Button>
        </div>

      </div>

      {recordingCheck.issues.length > 0 ? (
        <details className="xmimo-studio-recording-check" open={issuesOpen} onToggle={event => setIssuesOpen(event.currentTarget.open)}>
          <summary>{t('studio.recording.check').replace('{count}', String(recordingCheck.issues.length))}</summary>
          <ul>
            {recordingCheck.issues.map(issue => {
              const problemProvider = issue.role?.provider
              const provider = problemProvider ? engineLabel(problemProvider, t) : null
              return (
                <li key={issue.id}>
                  <div>
                    <strong>{issue.role?.name ?? t('studio.recording.line').replace('{line}', String(issue.firstLine))}</strong>
                    <small>{provider ? provider + ' · ' : ''}{t(issue.reason)}</small>
                  </div>
                  <div className="xmimo-studio-toolbar-group">
                    {issue.reason === 'studio.roles.disabled' ? (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onOpenRoles}>
                        {t('studio.roles.openLibrary')}
                      </Button>
                    ) : issue.reason === 'studio.roles.keyStatusUnavailable' ? (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => invalidateApiKeyStatus()}>
                        {t('studio.state.retry')}
                      </Button>
                    ) : problemProvider && provider && issue.reason !== 'studio.roles.keyStatusLoading' ? (
                      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => onConfigureProvider(problemProvider)}>
                        {t('studio.recording.configure').replace('{provider}', provider)}
                      </Button>
                    ) : null}
                    {editorMode === 'blocks' && firstReadyRoleId ? (
                      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => reassignLine(issue.firstLine)}>
                        {t('studio.recording.reassign').replace('{line}', String(issue.firstLine))}
                      </Button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        </details>
      ) : null}
      {error || recordingCheck.error ? <p className="xmimo-tts-failed" role="alert">{error ?? recordingCheck.error}</p> : null}

      {editorMode === 'text' ? (
        <div key="text" className="xmimo-studio-card" role="tabpanel" id={editorId + '-text-panel'} aria-labelledby={editorId + '-text'}>
          <small className="xmimo-split-bar-desc">{t('studio.scripts.importHint')}</small>
          <textarea
            ref={draftTextRef}
            className="xmimo-studio-textarea"
            rows={12}
            value={rawText}
            disabled={busy}
            aria-label={t('studio.scripts.modeText')}
            aria-describedby={editorId + '-text-hint'}
            placeholder={t('studio.scripts.textPlaceholder')}
            onChange={e => editScript(() => ({ textDirty: true, rawText: e.target.value }))}
          />
          <small className="xmimo-split-bar-desc" id={editorId + '-text-hint'}>{t('studio.scripts.textApplyHint')}</small>
        </div>
      ) : (
        <div key="blocks" className="xmimo-studio-blocks" role="tabpanel" id={editorId + '-blocks-panel'} aria-labelledby={editorId + '-blocks'}>
          {lines.length > 0 ? (
            <div className="xmimo-studio-blocks-toolbar">
              <StudioCastReplacement key={activeKey} t={t} lines={lines} roles={roleOptions} disabled={busy} onReplace={replaceRole} />
              <div className="xmimo-studio-line-search">
                <Input
                  className="xmimo-studio-line-search-input"
                  type="search"
                  icon={<RiSearchLine size={14} aria-hidden="true" />}
                  aria-label={t('studio.scripts.findLine')}
                  placeholder={t('studio.scripts.findPlaceholder')}
                  value={lineQuery}
                  onChange={event => setLineQuery(event.target.value)}
                />
                <small className="xmimo-studio-line-count" role="status">
                  {t('studio.scripts.lineCount').replace('{count}', lineQuery.trim() ? indexedLines.length + '/' + lines.length : String(lines.length))}
                </small>
                {lineQuery ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLineQuery('')}>{t('studio.scripts.clearSearch')}</Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {lineQuery.trim() && !indexedLines.length ? <p className="xmimo-studio-no-lines">{t('studio.scripts.findEmpty')}</p> : null}
          <fieldset
            ref={lineListRef}
            className="xmimo-studio-line-list"
            aria-label={t('studio.scripts.modeBlocks')}
            tabIndex={indexedLines.length ? 0 : undefined}
            disabled={busy}
          >
            {indexedLines.map(({ line, index }) => {
              const role = roleMap.get(line.roleId)
              const avail = role ? resolveStudioRoleAvailability(role, keyStatuses, mossEnabled) : { available: false, reasonKey: 'studio.error.missingRole' as const }
              const tagProvider = role?.provider === 'breeze'
                ? 'breeze'
                : role?.provider === 'xiaomi' && role.model === 'mimo-v2.5-tts'
                  ? 'xiaomi'
                  : undefined
              return (
                <div
                  key={line.id}
                  className="xmimo-studio-line-card"
                  data-playing={rehearsingLineId === line.id ? 'true' : undefined}
                  style={{ '--role-color': role?.color ?? '#3b82f6' } as CSSProperties}
                >
                  <div className="xmimo-studio-line-head">
                    <div className="xmimo-studio-line-meta">
                      <span className="xmimo-studio-line-index">#{index + 1}</span>
                      <VoiceReadingSelect
                        label={t('studio.roles.name')}
                        value={line.roleId}
                        fallbackLabel={role?.name ?? t('studio.error.missingRole')}
                        options={roleOptions}
                        disabled={busy || !firstReadyRoleId}
                        align="start"
                        className="xmimo-studio-line-role-select"
                        onSelect={roleId => { if (roleId !== line.roleId) updateLine(line.id, { roleId }) }}
                      />
                      {tagProvider ? (
                        <AudioTagPicker
                          provider={tagProvider}
                          disabled={busy}
                          textRef={{ current: lineRefs.current.get(line.id) ?? null }}
                          onInsert={(tag, placement) => insertAudioTag(line, tag, placement)}
                          t={t}
                        />
                      ) : null}
                    </div>
                    <div className="xmimo-studio-line-controls">
                      <input
                        type="text"
                        className="xmimo-studio-line-instruction-input"
                        maxLength={300}
                        aria-label={t('studio.scripts.lineInstructionPlaceholder')}
                        value={line.speechInstruction ?? ''}
                        placeholder={t('studio.scripts.lineInstructionPlaceholder')}
                        onChange={e => updateLine(line.id, { speechInstruction: e.target.value })}
                      />
                      <label className="xmimo-studio-pause-pill" title={t('studio.scripts.pauseAfter')}>
                        <span>{t('studio.scripts.pauseAfterShort')}</span>
                        <input
                          type="number"
                          min={0}
                          max={STUDIO_MAX_PAUSE_MS / 1000}
                          step={0.1}
                          aria-label={t('studio.scripts.pauseAfter')}
                          value={(line.pauseAfterMs / 1000).toFixed(1)}
                          onChange={e => updateLine(line.id, { pauseAfterMs: Math.round(Math.min(5, Math.max(0, Number(e.target.value) || 0)) * 1000) })}
                        />
                        <span>s</span>
                      </label>
                      <div className="xmimo-studio-line-actions">
                        {role ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="xmimo-studio-icon-btn"
                            title={!avail.available ? t(avail.reasonKey ?? 'studio.roles.apiKeyMissing') : t('studio.scripts.previewLine')}
                            disabled={!avail.available || !line.text.trim()}
                            onClick={() => onPreviewLine(line, role)}
                          >
                            <RiVolumeUpLine size={14} aria-hidden="true" />
                          </Button>
                        ) : null}
                        <Button type="button" variant="ghost" size="sm" className="xmimo-studio-icon-btn" title={t('studio.scripts.moveUp')} disabled={index === 0} onClick={() => moveLine(index, -1)}>
                          <RiArrowUpLine size={14} aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="xmimo-studio-icon-btn" title={t('studio.scripts.moveDown')} disabled={index === lines.length - 1} onClick={() => moveLine(index, 1)}>
                          <RiArrowDownLine size={14} aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="xmimo-studio-icon-btn"
                          title={t('studio.scripts.insertAfter').replace('{line}', String(index + 1))}
                          disabled={lines.length >= STUDIO_MAX_LINES_PER_SCRIPT}
                          onClick={() => addLine(line)}
                        >
                          <RiAddLine size={15} aria-hidden="true" />
                        </Button>
                        <Button type="button" variant="ghost" size="sm" className="xmimo-studio-icon-btn xmimo-danger-action" title={t('studio.scripts.removeLine')} onClick={() => removeLine(line.id)}>
                          <RiDeleteBinLine size={14} aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <textarea
                    ref={el => {
                      if (el) lineRefs.current.set(line.id, el)
                      else lineRefs.current.delete(line.id)
                    }}
                    className="xmimo-studio-textarea xmimo-studio-line-textarea"
                    aria-label={t('studio.scripts.lineLabel').replace('{line}', String(index + 1))}
                    rows={Math.min(4, Math.max(1, line.text.split('\n').length))}
                    maxLength={STUDIO_MAX_LINE_CHARACTERS}
                    value={line.text}
                    placeholder={t('studio.scripts.lineTextPlaceholder')}
                    onChange={e => updateLine(line.id, { text: e.target.value })}
                  />
                </div>
              )
            })}
          </fieldset>
          <div className="xmimo-studio-add-line-wrap">
            <button
              type="button"
              className="xmimo-studio-add-line-btn"
              disabled={busy || lines.length >= STUDIO_MAX_LINES_PER_SCRIPT}
              onClick={() => addLine()}
            >
              <RiAddLine size={15} aria-hidden="true" />
              <span>{t('studio.scripts.addLine')}</span>
            </button>
          </div>
        </div>
      )}
      {confirmDelete ? (
        <StudioDeleteDialog
          t={t}
          title={deleteLabel}
          name={title.trim() || t('studio.scripts.untitled')}
          description={t(deletableScript ? 'studio.scripts.deleteDescription' : 'studio.scripts.discardDescription')}
          confirmLabel={deletableScript ? t('studio.action.delete') : deleteLabel}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { void deleteCurrentScript() }}
        />
      ) : null}
    </div>
  )
}
