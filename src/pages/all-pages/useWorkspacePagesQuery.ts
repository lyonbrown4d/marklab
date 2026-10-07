import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { AllPagesFilters, AllPagesRow } from '@/logic/allPages'
import {
  builtInMarkdownCollections,
  filterRowsByMarkdownCollection,
} from '@/logic/markdownCollections'
import { workspaceAnalysisApi, type WorkspacePageResult } from '@/services/workspaceAnalysisApi'

type UseWorkspacePagesQueryOptions = {
  collectionId: string
  filters: AllPagesFilters
  workspaceKey: string
}

const emptyCollectionCounts = {
  all: 0,
  'needs-attention': 0,
  linked: 0,
  structured: 0,
} as const

const toRow = (item: WorkspacePageResult['items'][number]): AllPagesRow => ({
  assets: item.asset_count,
  folder: item.folder,
  headings: item.heading_count,
  indexed: true,
  issues: item.issue_count,
  links: item.link_count,
  path: item.path,
  title: item.title,
})

export const useWorkspacePagesQuery = ({
  collectionId,
  filters,
  workspaceKey,
}: UseWorkspacePagesQueryOptions) => {
  const effectiveIssuesOnly = filters.issuesOnly || collectionId === 'needs-attention'
  const pages = useQuery({
    queryKey: [
      'workspace-pages',
      workspaceKey,
      filters.folder,
      effectiveIssuesOnly,
      filters.query,
      filters.sort,
    ],
    queryFn: () =>
      workspaceAnalysisApi.queryAllPages({
        folder: filters.folder,
        issues_only: effectiveIssuesOnly,
        query: filters.query,
        sort: filters.sort,
      }),
    staleTime: 5_000,
  })
  const summary = useQuery({
    queryKey: ['workspace-knowledge-summary', workspaceKey],
    queryFn: () => workspaceAnalysisApi.getKnowledgeSummary(),
    staleTime: 5_000,
  })
  const activeCollection = builtInMarkdownCollections.find(
    (collection) => collection.id === collectionId,
  )
  const rows = useMemo(() => {
    const mapped = (pages.data?.items ?? []).map(toRow)
    return activeCollection ? filterRowsByMarkdownCollection(mapped, activeCollection) : mapped
  }, [activeCollection, pages.data?.items])
  const collectionCounts: Readonly<Record<string, number>> =
    summary.data?.collection_counts ?? emptyCollectionCounts
  const collections = useMemo(
    () =>
      builtInMarkdownCollections.map((collection) => ({
        ...collection,
        count: collectionCounts[collection.id],
      })),
    [collectionCounts],
  )
  const retry = useCallback(async () => {
    await Promise.all([pages.refetch(), summary.refetch()])
  }, [pages, summary])

  return {
    rows,
    folders: pages.data?.folders ?? [],
    totalRows: summary.data?.file_count ?? pages.data?.total ?? 0,
    collections,
    loading: pages.isPending || summary.isPending,
    refreshing: pages.isFetching || summary.isFetching,
    error: pages.error ?? summary.error ?? null,
    retry,
  }
}
