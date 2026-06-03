import { Clock3, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { CommandGroup, CommandItem, CommandSeparator } from '@/components/ui/command'

type CommandSearchHistoryProps = {
  query: string
  searches: string[]
  onSelectSearch: (query: string) => void
  onClearSearches: () => void
}

const MAX_VISIBLE_SEARCHES = 5

const CommandSearchHistory = ({
  query,
  searches,
  onSelectSearch,
  onClearSearches,
}: CommandSearchHistoryProps) => {
  const trimmedQuery = query.trim().toLocaleLowerCase()
  const visibleSearches = useMemo(() => {
    const nextSearches = trimmedQuery
      ? searches.filter((item) => item.toLocaleLowerCase().includes(trimmedQuery))
      : searches

    return nextSearches.slice(0, MAX_VISIBLE_SEARCHES)
  }, [searches, trimmedQuery])

  if (visibleSearches.length === 0) return null

  return (
    <>
      <CommandGroup heading={trimmedQuery ? 'Search history' : 'Recent searches'}>
        {visibleSearches.map((item) => (
          <CommandItem
            key={item}
            value={`recent search ${item}`}
            onSelect={() => onSelectSearch(item)}
          >
            <Clock3 className="h-4 w-4" />
            <span className="min-w-0 truncate">{item}</span>
          </CommandItem>
        ))}
        {!trimmedQuery && (
          <CommandItem value="clear recent searches" onSelect={onClearSearches}>
            <Trash2 className="h-4 w-4" />
            Clear recent searches
          </CommandItem>
        )}
      </CommandGroup>
      <CommandSeparator />
    </>
  )
}

export default CommandSearchHistory
