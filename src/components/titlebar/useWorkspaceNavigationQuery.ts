import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createFileLabel } from '@/logic/paths'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'
import type {
  CommandNavigationBacklink,
  CommandNavigationHeading,
  CommandNavigationMissingLink,
  CommandNavigationOutgoingLink,
} from '@/components/command/CommandNavigationSection'
import type { CommandHeading } from '@/components/command/CommandSearchResults'

const NAVIGATION_RESULT_LIMIT = 24
const EMPTY_COLLECTION_COUNTS = {
  all: 0,
  'needs-attention': 0,
  linked: 0,
  structured: 0,
} as const

type UseWorkspaceNavigationQueryOptions = {
  activePath: string | null
  enabled: boolean
  navigationEnabled?: boolean
  query: string
  scope: 'all' | 'files' | 'headings'
  workspaceKey: string
}

const emptyNavigation = {
  headings: [] as CommandNavigationHeading[],
  outgoingLinks: [] as CommandNavigationOutgoingLink[],
  backlinks: [] as CommandNavigationBacklink[],
  missingLinks: [] as CommandNavigationMissingLink[],
}

export const useWorkspaceNavigationQuery = ({
  activePath,
  enabled,
  navigationEnabled = true,
  query,
  scope,
  workspaceKey,
}: UseWorkspaceNavigationQueryOptions) => {
  const shouldQueryNavigation = enabled && navigationEnabled && (!query || scope !== 'files')
  const navigation = useQuery({
    queryKey: [
      'workspace-navigation',
      workspaceKey,
      activePath,
      query,
      scope,
      NAVIGATION_RESULT_LIMIT,
    ],
    queryFn: () =>
      workspaceAnalysisApi.queryNavigation({
        active_path: activePath,
        query,
        scope,
        limit: NAVIGATION_RESULT_LIMIT,
      }),
    enabled: shouldQueryNavigation,
    staleTime: 5_000,
  })
  const summary = useQuery({
    queryKey: ['workspace-knowledge-summary', workspaceKey],
    queryFn: () => workspaceAnalysisApi.getKnowledgeSummary(),
    enabled,
    staleTime: 5_000,
  })
  const response = navigation.data?.active_path === activePath ? navigation.data : undefined
  const headings: CommandHeading[] = (response?.headings ?? []).map((heading) => ({
    ...heading,
    label: createFileLabel(heading.path),
  }))
  const current = response?.current
  const navigationModel = current
    ? {
        headings: current.headings,
        outgoingLinks: current.outgoing_links.map((link) => ({
          sourcePath: link.source_path,
          targetPath: link.target_path,
          targetAnchor: link.target_anchor,
          targetHeadingSlug: link.target_heading_slug,
          target: link.target,
          text: link.text,
          context: link.context,
          line: link.line,
          column: link.column,
          linkType: link.link_type,
        })),
        backlinks: current.backlinks.map((link) => ({
          sourcePath: link.source_path,
          text: link.text,
          context: link.context,
          line: link.line,
          column: link.column,
          targetAnchor: link.target_anchor,
        })),
        missingLinks: current.missing_links.map((link) => ({
          path: link.path,
          target: link.target,
          text: link.text,
          context: link.context,
          line: link.line,
          column: link.column,
          linkType: link.link_type,
        })),
      }
    : emptyNavigation
  const retry = useCallback(async () => {
    await Promise.all([
      shouldQueryNavigation ? navigation.refetch() : Promise.resolve(),
      summary.refetch(),
    ])
  }, [navigation, shouldQueryNavigation, summary])

  return {
    headings,
    navigationHeadings: navigationModel.headings,
    navigationOutgoingLinks: navigationModel.outgoingLinks,
    navigationBacklinks: navigationModel.backlinks,
    navigationMissingLinks: navigationModel.missingLinks,
    indexedFileCount: summary.data?.file_count ?? 0,
    collectionCounts: summary.data?.collection_counts ?? EMPTY_COLLECTION_COUNTS,
    workspaceIndexed: summary.data?.ready ?? false,
    loading: navigation.isFetching || summary.isFetching,
    error: navigation.isError || summary.isError,
    retry,
  }
}
