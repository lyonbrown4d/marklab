import { useCallback } from 'react'
import { useLocalStorageState } from 'ahooks'
import { LOCAL_STORAGE_KEYS } from '@/types/persistenceKeys'

const MAX_RECENT_COMMANDS = 8

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const deserializeHistory = (value: string): string[] => {
  try {
    const parsed: unknown = JSON.parse(value)
    return isStringArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const usePlateSlashCommandHistory = () => {
  const [storedKeys, setStoredKeys] = useLocalStorageState<string[]>(
    LOCAL_STORAGE_KEYS.slashCommandHistory,
    { defaultValue: [], deserializer: deserializeHistory },
  )
  const recentKeys = isStringArray(storedKeys) ? storedKeys : []
  const record = useCallback(
    (key: string) => {
      setStoredKeys((current) => {
        const keys = isStringArray(current) ? current : []
        return [key, ...keys.filter((candidate) => candidate !== key)].slice(0, MAX_RECENT_COMMANDS)
      })
    },
    [setStoredKeys],
  )

  return { recentKeys, record }
}
