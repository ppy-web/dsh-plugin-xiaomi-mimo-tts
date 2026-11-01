import { hostRoute } from '../host-route.js'

export interface QqMemoryEntry { id: string; kind: 'preference' | 'requirement'; text: string; updatedAt: number }
export interface QqMemoryTopic { id: string; title: string; updatedAt: number; expiresAt: number }
export interface QqMemoryPeer { key: string; appId: string; scope: 'c2c' | 'group'; peerId: string; memoryEnabled: boolean; entries: QqMemoryEntry[]; topics: QqMemoryTopic[] }

export async function loadQqMemory(): Promise<QqMemoryPeer[]> {
  const response = await fetch(hostRoute('/plugins/xiaomi-mimo-tts/qq-memory'), { credentials: 'same-origin' })
  if (!response.ok) throw new Error('qq-memory-unavailable')
  const value = await response.json() as { peers?: QqMemoryPeer[] }
  return Array.isArray(value.peers) ? value.peers : []
}

export async function updateQqMemory(input: Record<string, unknown>): Promise<QqMemoryPeer> {
  const response = await fetch(hostRoute('/plugins/xiaomi-mimo-tts/qq-memory'), {
    method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
  })
  if (!response.ok) throw new Error('qq-memory-update-failed')
  return response.json() as Promise<QqMemoryPeer>
}
