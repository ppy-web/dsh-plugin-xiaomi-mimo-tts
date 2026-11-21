import type { ChatSnapshot, AssistantBlock, TurnTailChatData } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { LiveMessageIdentity } from '../playback/types.js'
import type { FoldedReplies } from './automatic-reading.js'
import { latestTurn } from './turn-state.js'

type ChatLegacy = ChatSnapshot['legacy']
type ChatNode = ChatLegacy['nodes'][number]

const assistantNodeCache = new WeakMap<ChatLegacy['nodes'], { length: number; byId: Map<string, ChatNode> }>()

function findAssistantNode(legacy: ChatLegacy, messageId: string): ChatNode | undefined {
  let cached = assistantNodeCache.get(legacy.nodes)
  if (!cached || cached.length !== legacy.nodes.length) {
    const byId = new Map<string, ChatNode>()
    for (const node of legacy.nodes) {
      if (node.kind === 'assistant' && node.messageId !== undefined && !byId.has(node.messageId)) {
        byId.set(node.messageId, node)
      }
    }
    cached = { length: legacy.nodes.length, byId }
    assistantNodeCache.set(legacy.nodes, cached)
  }
  return cached.byId.get(messageId)
}

/** Use the host's settled closing reply rather than guessing from step order or visible DOM. */
export function finalAssistantMessageId(chat: ChatSnapshot): string | null {
  const turn = latestTurn(chat)
  if (turn?.end?.data.reason.kind !== 'completed') return null
  for (const key of chat.locations.getTurn(turn.turn)) {
    const node = chat.nodes.get(key)
    if (node?.kind === 'turn-tail') {
      const final = (node.data as TurnTailChatData).closing?.finalNode
      return final?.interrupted ? null : final?.messageId ?? null
    }
  }
  return null
}

/** Keep raw text until the selected provider can preserve its own audio controls. */
export function messageText(legacy: ChatLegacy, messageId: string): string {
  const node = findAssistantNode(legacy, messageId)
  return node?.kind === 'assistant' ? assistantText(node.blocks as readonly AssistantBlock[]) : ''
}

export function messageTime(legacy: ChatLegacy, messageId: string): number | null {
  const node = findAssistantNode(legacy, messageId)
  return node?.kind === 'assistant' ? node.time : null
}

export function latestAssistantMessageId(legacy: ChatLegacy): string | null {
  for (let index = legacy.nodes.length - 1; index >= 0; index -= 1) {
    const node = legacy.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined) return node.messageId
  }
  return null
}

export function automaticAssistantMessageId(chat: ChatSnapshot, mode: FoldedReplies): string | null {
  const turn = latestTurn(chat)
  if (turn?.end?.data.reason.kind !== 'completed') return null
  if (mode === 'final') return finalAssistantMessageId(chat)
  for (let index = chat.legacy.nodes.length - 1; index >= 0; index--) {
    const node = chat.legacy.nodes[index]
    if (node?.kind === 'assistant' && node.turn === turn.turn && !node.interrupted) return node.messageId ?? null
  }
  return null
}

export function assistantText(blocks: readonly AssistantBlock[]): string {
  return blocks
    .filter((block): block is { kind: 'text'; text: string } => block.kind === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n\n')
}

export function finalLiveMessage(legacy: ChatLegacy, turn: number, step: number): LiveMessageIdentity | null {
  for (let index = legacy.nodes.length - 1; index >= 0; index -= 1) {
    const node = legacy.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined && node.turn === turn && node.step === step) {
      return {
        messageId: node.messageId,
        turn: node.turn,
        step: node.step,
        text: assistantText(node.blocks),
        interrupted: node.interrupted === true,
      }
    }
  }
  return null
}

export function messageLiveIdentity(legacy: ChatLegacy, messageId: string): Pick<LiveMessageIdentity, 'turn' | 'step'> | null {
  const node = findAssistantNode(legacy, messageId)
  return node?.kind === 'assistant' ? { turn: node.turn, step: node.step } : null
}
