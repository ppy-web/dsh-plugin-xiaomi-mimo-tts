export interface SessionRetainCounts {
  readonly retainedBy: Readonly<Partial<Record<string, number>>>
}

export type SessionRetainInfoSelector = <T>(selector: (info: SessionRetainCounts | undefined) => T) => T

/** Whether the surrounding Session slot belongs to the primary Conversation view rather than an embedded Sidebar chat. */
export function useIsMainSessionView(useSessionRetainInfo?: SessionRetainInfoSelector): boolean {
  return useSessionRetainInfo
    ? useSessionRetainInfo(info => info === undefined || (info.retainedBy.mainView ?? 0) > 0)
    : true
}
