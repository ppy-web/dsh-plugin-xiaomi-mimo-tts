import { createContext, useContext } from 'react'
import type { SearchSetting, SettingsSearchResult } from './settings-search.js'

export const SettingsSearchContext = createContext<SettingsSearchResult>(null)

export function useSettingsSearch() {
  const result = useContext(SettingsSearchContext)
  return {
    result,
    hide: (...ids: SearchSetting[]) => result !== null && !ids.some(id => result.visible.has(id)),
  }
}
