import { findMatchingStudioRole, parseStudioScriptLines } from '../../text/studio-script-parser.js'
import type { StudioLine, StudioRole } from '../../types/studio.js'
import { resolveStudioProviderAvailability } from './use-studio-provider-statuses.js'
import type { StudioProviderAvailability, StudioProviderKeyMap } from './use-studio-provider-statuses.js'

export interface StudioRecordingIssue {
  id: string
  role?: StudioRole
  firstLine: number
  reason: NonNullable<StudioProviderAvailability['reasonKey']> | 'studio.error.missingRole'
}

type RecordingSource = { lines: readonly StudioLine[] } | { rawText: string; narratorName: string }

export function checkStudioRecording(
  source: RecordingSource,
  roles: readonly StudioRole[],
  keyStatuses: StudioProviderKeyMap,
  mossEnabled: boolean,
): { lineCount: number; issues: StudioRecordingIssue[] } {
  const issues = new Map<string, StudioRecordingIssue>()
  const checkRole = (role: StudioRole, firstLine: number): void => {
    if (issues.has(role.id)) return
    const availability = resolveStudioProviderAvailability(role.provider, keyStatuses, mossEnabled)
    if (!availability.available && availability.reasonKey) {
      issues.set(role.id, { id: role.id, role, firstLine, reason: availability.reasonKey })
    }
  }

  if ('rawText' in source) {
    const parsed = parseStudioScriptLines(source.rawText, source.narratorName)
    for (const [index, line] of parsed.entries()) {
      const role = findMatchingStudioRole(roles, line.roleName, line.roleId)
      // New speakers get their actual engine and voice when the Host imports the text.
      if (role) checkRole(role, index + 1)
    }
    return { lineCount: parsed.length, issues: [...issues.values()] }
  }

  const roleMap = new Map(roles.map(role => [role.id, role]))
  let lineCount = 0
  for (const [index, line] of source.lines.entries()) {
    if (!line.text.trim()) continue
    lineCount += 1
    const role = roleMap.get(line.roleId)
    if (role) checkRole(role, index + 1)
    else if (!issues.has(line.roleId)) {
      issues.set(line.roleId, { id: line.roleId, firstLine: index + 1, reason: 'studio.error.missingRole' })
    }
  }
  return { lineCount, issues: [...issues.values()] }
}
