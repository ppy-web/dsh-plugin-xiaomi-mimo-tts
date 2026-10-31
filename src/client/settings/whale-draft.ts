import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { WhaleSettings } from '../../types/whale.js'

export type WhaleDraftError = 'persona'

export function validateWhaleDraft(draft: WhaleSettings): WhaleDraftError | null {
  const limits = { name: 60, selfReference: 40, userAddress: 40, relationship: 1000, personality: 1200, replyStyle: 1200, likes: 1000, boundaries: 1200 }
  for (const field of Object.keys(limits) as Array<keyof typeof limits>) {
    const value = draft.persona[field]
    if (value.length > limits[field] || ((field === 'name' || field === 'selfReference') && !value.trim())) return 'persona'
  }
  return null
}

/** Submit only edited persona fields with the revision the editor actually read. */
export async function saveWhaleDraft(scope: ConfigForm<WhaleSettings>, base: WhaleSettings, draft: WhaleSettings, revision: number): Promise<void> {
  if (validateWhaleDraft(draft)) throw new Error('whale-draft-invalid')
  const snapshot = scope.getSnapshot()
  if (!snapshot.writable || snapshot.status !== 'ready' || snapshot.revision !== revision) throw new Error('whale-settings-conflict')
  const ops: Parameters<typeof scope.mutate>[0][number][] = []
  for (const group of ['persona', 'memory'] as const) {
    for (const field of Object.keys(draft[group])) {
      const next = (draft[group] as unknown as Record<string, unknown>)[field]
      const before = (base[group] as unknown as Record<string, unknown>)[field]
      if (JSON.stringify(next) !== JSON.stringify(before)) ops.push({ op: 'set', path: [group, field], value: JSON.parse(JSON.stringify(next)) })
    }
  }
  if (ops.length && !await scope.mutate(ops, revision)) throw new Error('whale-settings-save-failed')
}
