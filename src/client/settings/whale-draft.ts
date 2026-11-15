import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import { WHALE_PERSONA_LIMITS } from '../../types/whale.js'
import type { WhaleSettings } from '../../types/whale.js'

export type WhaleDraftError = 'persona'

export function validateWhaleDraft(draft: WhaleSettings): WhaleDraftError | null {
  for (const field of Object.keys(WHALE_PERSONA_LIMITS) as Array<keyof typeof WHALE_PERSONA_LIMITS>) {
    const value = draft.persona[field]
    if (value.length > WHALE_PERSONA_LIMITS[field] || ((field === 'name' || field === 'selfReference') && !value.trim())) return 'persona'
  }
  return null
}

/** Submit only edited persona fields with the revision the editor actually read. */
export async function saveWhaleDraft(scope: ConfigForm<WhaleSettings>, base: WhaleSettings, draft: WhaleSettings, revision: number): Promise<void> {
  if (validateWhaleDraft(draft)) throw new Error('whale-draft-invalid')
  const snapshot = scope.getSnapshot()
  if (!snapshot.writable || snapshot.status !== 'ready' || snapshot.revision !== revision) throw new Error('whale-settings-conflict')
  const ops: Parameters<typeof scope.mutate>[0][number][] = []
  for (const group of ['persona', 'memory', 'memes'] as const) {
    if (!draft[group]) continue
    for (const field of Object.keys(draft[group])) {
      const next = (draft[group] as unknown as Record<string, unknown>)[field]
      const before = (base[group] as unknown as Record<string, unknown> | undefined)?.[field]
      if (JSON.stringify(next) !== JSON.stringify(before)) ops.push({ op: 'set', path: [group, field], value: JSON.parse(JSON.stringify(next)) })
    }
  }
  if (ops.length && !await scope.mutate(ops, revision)) throw new Error('whale-settings-save-failed')
}
