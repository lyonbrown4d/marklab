import { describe, expect, it } from 'vitest'

import {
  buildAllPagesSearchParams,
  hasAllPagesActiveFilters,
  parseAllPagesRouteState,
  resetAllPagesRouteFilters,
  updateAllPagesRouteState,
} from '@/logic/allPagesRouteState'

const collectionIds = ['all', 'needs-attention', 'linked', 'structured'] as const

describe('allPagesRouteState', () => {
  it('parses default route state from empty search params', () => {
    expect(parseAllPagesRouteState(new URLSearchParams(), collectionIds)).toEqual({
      collectionId: 'all',
      filters: {
        folder: 'all',
        issuesOnly: false,
        query: '',
        sort: 'title',
      },
      viewMode: 'table',
    })
  })

  it('parses known route params and ignores invalid enum values', () => {
    const state = parseAllPagesRouteState(
      new URLSearchParams(
        'collection=linked&q=graph&folder=notes&sort=unknown&issues=1&view=folders',
      ),
      collectionIds,
    )

    expect(state).toEqual({
      collectionId: 'linked',
      filters: {
        folder: 'notes',
        issuesOnly: true,
        query: 'graph',
        sort: 'title',
      },
      viewMode: 'folders',
    })
  })

  it('builds compact search params by omitting default values', () => {
    expect(
      buildAllPagesSearchParams({
        collectionId: 'needs-attention',
        filters: {
          folder: 'docs',
          issuesOnly: true,
          query: 'release',
          sort: 'issues',
        },
        viewMode: 'cards',
      }).toString(),
    ).toBe('collection=needs-attention&q=release&folder=docs&sort=issues&issues=1&view=cards')
  })

  it('merges partial updates into the existing route state', () => {
    const params = updateAllPagesRouteState(
      new URLSearchParams('collection=linked&q=graph&view=folders'),
      collectionIds,
      {
        filters: { query: 'index', sort: 'links' },
      },
    )

    expect(params.toString()).toBe('collection=linked&q=index&sort=links&view=folders')
  })

  it('detects active filters without treating collections as filters', () => {
    expect(
      hasAllPagesActiveFilters(
        parseAllPagesRouteState(new URLSearchParams('collection=linked'), collectionIds),
      ),
    ).toBe(false)
    expect(
      hasAllPagesActiveFilters(
        parseAllPagesRouteState(new URLSearchParams('collection=linked&q=graph'), collectionIds),
      ),
    ).toBe(true)
  })

  it('resets filters and view mode while preserving the selected collection', () => {
    const params = resetAllPagesRouteFilters(
      new URLSearchParams('collection=linked&q=graph&folder=notes&sort=links&issues=1&view=cards'),
      collectionIds,
    )

    expect(params.toString()).toBe('collection=linked')
  })
})
