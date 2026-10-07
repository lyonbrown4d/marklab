import { Search } from 'lucide-react'
import { useId, useMemo, useRef, type KeyboardEvent, type RefObject } from 'react'
import { Input } from '@/components/ui/input'
import { useI18n } from '@/i18n/useI18n'
import type { SettingsRouteId } from '@/components/settings/settingsRoutes'
import { settingsRoutes } from '@/components/settings/settingsRoutes'

type SettingsSearchProps = {
  inputRef: RefObject<HTMLInputElement | null>
  query: string
  onQueryChange: (query: string) => void
  onSelect: (route: SettingsRouteId, targetId: string) => void
}

type SearchResult = {
  id: string
  label: string
  route: SettingsRouteId
  routeLabel: string
  targetId: string
}

export const SettingsSearch = ({
  inputRef,
  query,
  onQueryChange,
  onSelect,
}: SettingsSearchProps) => {
  const { t } = useI18n()
  const resultsId = useId()
  const resultsRef = useRef<HTMLDivElement | null>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const results = useMemo<SearchResult[]>(() => {
    if (!normalizedQuery) return []

    const matches: SearchResult[] = []
    for (const route of settingsRoutes) {
      const routeLabel = t(route.labelKey)
      const entries = [
        { labelKey: route.labelKey, targetId: route.pageTargetId },
        { labelKey: route.descriptionKey, targetId: route.pageTargetId },
        ...route.searchEntries,
      ]
      for (const entry of entries) {
        const label = t(entry.labelKey)
        if (label.toLocaleLowerCase().includes(normalizedQuery)) {
          matches.push({
            id: `${route.value}:${entry.labelKey}`,
            label,
            route: route.value,
            routeLabel,
            targetId: entry.targetId,
          })
        }
      }
    }
    return matches.slice(0, 8)
  }, [normalizedQuery, t])

  const selectResult = (result: SearchResult) => {
    onSelect(result.route, result.targetId)
    onQueryChange('')
  }

  const focusResult = (index: number) => {
    const options = resultsRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    options?.item(index)?.focus()
  }

  const handleResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const options = Array.from(
      resultsRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    )
    const currentIndex = options.indexOf(event.currentTarget)
    let nextIndex: number | undefined
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % options.length
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + options.length) % options.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = options.length - 1
    if (nextIndex === undefined) return

    event.preventDefault()
    options[nextIndex]?.focus()
  }

  return (
    <div className="relative w-full max-w-xl">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        value={query}
        aria-label={t('settings.search')}
        aria-autocomplete="list"
        aria-controls={results.length ? resultsId : undefined}
        aria-expanded={results.length > 0}
        aria-haspopup="listbox"
        autoComplete="off"
        placeholder={t('settings.search')}
        className="h-9 rounded-lg bg-muted/35 pl-9 pr-16 shadow-none"
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && results.length) {
            event.preventDefault()
            focusResult(0)
          }
          if (event.key === 'ArrowUp' && results.length) {
            event.preventDefault()
            focusResult(results.length - 1)
          }
        }}
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground shadow-sm">
        Ctrl+,
      </kbd>
      {normalizedQuery ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 overflow-hidden rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg">
          {results.length ? (
            <div
              ref={resultsRef}
              id={resultsId}
              role="listbox"
              aria-label={t('settings.searchResults')}
            >
              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  role="option"
                  aria-selected="false"
                  aria-label={`${result.label} · ${result.routeLabel}`}
                  data-setting-target={result.targetId}
                  tabIndex={-1}
                  className="flex w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                  onClick={() => selectResult(result)}
                  onKeyDown={handleResultKeyDown}
                >
                  <span className="truncate text-sm">{result.label}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {result.routeLabel}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground" role="status">
              {t('settings.searchNoResults')}
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
