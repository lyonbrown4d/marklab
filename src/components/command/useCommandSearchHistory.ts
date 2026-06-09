import { useCallback, useMemo } from 'react'
import { useLocalStorageState } from 'ahooks'

const COMMAND_SEARCH_HISTORY_KEY = 'marklab.command.searchHistory'
const MAX_SEARCH_HISTORY = 8
const MIN_SEARCH_HISTORY_LENGTH = 2

const normalizeSearchTerm = (value: string) => value.trim().replace(/\s+/g, ' ')

const normalizeSearchHistory = (history: unknown) => {
  if (!Array.isArray(history)) return []
  return history
    .filter((item): item is string => typeof item === 'string')
    .map(normalizeSearchTerm)
    .filter((item) => item.length >= MIN_SEARCH_HISTORY_LENGTH)
    .slice(0, MAX_SEARCH_HISTORY)
}

export const useCommandSearchHistory = () => {
  const [storedSearches, setStoredSearches] = useLocalStorageState<string[]>(
    COMMAND_SEARCH_HISTORY_KEY,
    {
      defaultValue: [],
    },
  )
  const searches = useMemo(() => normalizeSearchHistory(storedSearches), [storedSearches])

  const rememberSearch = useCallback(
    (value: string) => {
      const nextSearch = normalizeSearchTerm(value)
      if (nextSearch.length < MIN_SEARCH_HISTORY_LENGTH) return

      setStoredSearches((currentSearches) => {
        const normalizedSearches = normalizeSearchHistory(currentSearches)
        const nextSearches = [
          nextSearch,
          ...normalizedSearches.filter(
            (item) => item.toLocaleLowerCase() !== nextSearch.toLocaleLowerCase(),
          ),
        ].slice(0, MAX_SEARCH_HISTORY)

        return nextSearches
      })
    },
    [setStoredSearches],
  )

  const clearSearchHistory = useCallback(() => {
    setStoredSearches([])
  }, [setStoredSearches])

  return {
    searches,
    rememberSearch,
    clearSearchHistory,
  }
}
