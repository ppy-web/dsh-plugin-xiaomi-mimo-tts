import { useSyncExternalStore } from 'react'
import { engineStateStore } from './engine-state.js'

export function useEngineState() { return useSyncExternalStore(engineStateStore.subscribe, engineStateStore.getSnapshot, engineStateStore.getSnapshot) }
