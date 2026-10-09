import { useCallback, useRef, useState } from 'react'

const STORAGE_KEY = 'marklab.command.recentCommands'
const MAX_RECENT_COMMANDS = 8

const readRecentCommands = (): string[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

export const useRecentCommands = () => {
  const [recentCommandIds, setRecentCommandIds] = useState<string[]>(readRecentCommands)
  const recentCommandIdsRef = useRef(recentCommandIds)
  const rememberCommand = useCallback((id: string) => {
    const next = [id, ...recentCommandIdsRef.current.filter((value) => value !== id)].slice(
      0,
      MAX_RECENT_COMMANDS,
    )
    recentCommandIdsRef.current = next
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Recent commands are a convenience; storage failures must not block actions.
    }
    setRecentCommandIds(next)
  }, [])

  return { recentCommandIds, rememberCommand }
}
