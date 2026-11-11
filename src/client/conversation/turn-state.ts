import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'

/** The latest loaded turn owns completion; older pages never become the active outcome. */
export function latestTurn(chat: Pick<ChatSnapshot, 'timeline'> | undefined) {
  const turn = chat?.timeline.turnOrder.at(-1)
  return turn === undefined ? undefined : chat?.timeline.turns.get(turn)
}
