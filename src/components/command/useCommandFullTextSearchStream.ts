import { useEffect, useMemo, useState } from 'react'
import {
  Subject,
  catchError,
  concat,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  switchMap,
} from 'rxjs'
import { fsApi, type FsSearchResult } from '@/services/fsApi'
import { isDesktopRuntime } from '@/runtime/environment'
import type { CommandSearchScope } from '@/components/command/commandSearchScope'

type CommandFullTextSearchInput = {
  limit: number
  open: boolean
  query: string
  scope: CommandSearchScope
}

type CommandFullTextSearchSnapshot = {
  error: boolean
  fetching: boolean
  query: string
  results: FsSearchResult[]
}

type CommandFullTextSearchState = {
  fullTextError: boolean
  fullTextFetching: boolean
  fullTextResults: FsSearchResult[]
}

const COMMAND_FULL_TEXT_DEBOUNCE_MS = 160
const MIN_FULL_TEXT_QUERY_LENGTH = 2

const emptySnapshot = (query = ''): CommandFullTextSearchSnapshot => ({
  error: false,
  fetching: false,
  query,
  results: [],
})

const canSearchFullText = ({ open, query, scope }: CommandFullTextSearchInput) => {
  return (
    open &&
    isDesktopRuntime() &&
    query.length >= MIN_FULL_TEXT_QUERY_LENGTH &&
    (scope === 'all' || scope === 'text')
  )
}

const sameSearchInput = (left: CommandFullTextSearchInput, right: CommandFullTextSearchInput) => {
  return (
    left.open === right.open &&
    left.query === right.query &&
    left.scope === right.scope &&
    left.limit === right.limit
  )
}

const toPublicState = (
  input: CommandFullTextSearchInput,
  snapshot: CommandFullTextSearchSnapshot,
): CommandFullTextSearchState => {
  const searchable = canSearchFullText(input)
  const stale = snapshot.query !== input.query

  return {
    fullTextError: !stale && snapshot.error,
    fullTextFetching: searchable && (snapshot.fetching || stale),
    fullTextResults: stale ? [] : snapshot.results,
  }
}

export const useCommandFullTextSearchStream = (
  input: CommandFullTextSearchInput,
): CommandFullTextSearchState => {
  const input$ = useMemo(() => new Subject<CommandFullTextSearchInput>(), [])
  const [snapshot, setSnapshot] = useState<CommandFullTextSearchSnapshot>(() =>
    emptySnapshot(input.query),
  )

  useEffect(() => {
    const subscription = input$
      .pipe(
        debounceTime(COMMAND_FULL_TEXT_DEBOUNCE_MS),
        distinctUntilChanged(sameSearchInput),
        switchMap((nextInput) => {
          if (!canSearchFullText(nextInput)) return of(emptySnapshot(nextInput.query))

          return concat(
            of({
              error: false,
              fetching: true,
              query: nextInput.query,
              results: [],
            }),
            from(fsApi.searchWorkspace(nextInput.query, nextInput.limit)).pipe(
              map((results) => ({
                error: false,
                fetching: false,
                query: nextInput.query,
                results,
              })),
              catchError(() =>
                of({
                  error: true,
                  fetching: false,
                  query: nextInput.query,
                  results: [],
                }),
              ),
            ),
          )
        }),
      )
      .subscribe(setSnapshot)

    return () => subscription.unsubscribe()
  }, [input$])

  useEffect(() => {
    input$.next({
      limit: input.limit,
      open: input.open,
      query: input.query,
      scope: input.scope,
    })
  }, [input$, input.limit, input.open, input.query, input.scope])

  return toPublicState(input, snapshot)
}
