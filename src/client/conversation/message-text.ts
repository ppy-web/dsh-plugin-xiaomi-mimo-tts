import type { ChatSnapshot, AssistantBlock, TurnTailChatData } from '@deepseek-ai/dsh-client-ui-chat/client'
import type { LiveMessageIdentity } from '../playback/types.js'
import { prepareSpeechText } from '../playback/speech-text.js'

type ChatLegacy = ChatSnapshot['legacy']

/** Use the host's settled closing reply rather than guessing from step order or visible DOM. */
export function finalAssistantMessageId(chat: ChatSnapshot): string | null {
  const turn = chat.timeline.turnOrder.at(-1)
  if (turn === undefined) return null
  for (const key of chat.locations.getTurn(turn)) {
    const node = chat.nodes.get(key)
    if (node?.kind === 'turn-tail') return (node.data as TurnTailChatData).closing?.finalNode.messageId ?? null
  }
  return null
}

export function messageText(legacy: ChatLegacy, messageId: string): string {
  for (const node of legacy.nodes) {
    if (node.kind !== 'assistant' || node.messageId !== messageId) continue
    return prepareSpeechText(assistantText(node.blocks as readonly AssistantBlock[]))
  }
  return ''
}

export function messageTime(legacy: ChatLegacy, messageId: string): number | null {
  for (const node of legacy.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return node.time
  }
  return null
}

export function latestAssistantMessageId(legacy: ChatLegacy): string | null {
  for (let index = legacy.nodes.length - 1; index >= 0; index -= 1) {
    const node = legacy.nodes[index]
    if (node?.kind === 'assistant' && node.messageId !== undefined) return node.messageId
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
  for (const node of legacy.nodes) {
    if (node.kind === 'assistant' && node.messageId === messageId) return { turn: node.turn, step: node.step }
  }
  return null
}
