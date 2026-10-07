import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useMarkdownTextAnalysis } from '@/hooks/useMarkdownTextAnalysis'
import type { MarkdownAssetReference, MarkdownAssetReport } from '@/logic/assets'
import type { BacklinkReference } from '@/logic/backlinks'
import type {
  KnowledgeInsights,
  KnowledgeLinkReference,
  KnowledgeMissingReference,
} from '@/logic/knowledge'
import type { MarkdownSourceDiagnostic } from '@/logic/markdownDiagnostics'
import { fsApi } from '@/services/fsApi'
import {
  workspaceAnalysisApi,
  type WorkspaceDocumentInsightsResult,
} from '@/services/workspaceAnalysisApi'

const INSPECTOR_ASSET_LIMIT = 80

type UseRightSidebarDataArgs = {
  collapsed: boolean
  workspaceKey: string
  activePath: string | null
  targetPath: string | null
  editorValue: string
  fileContents: Record<string, string>
}

const emptyKnowledge: KnowledgeInsights = {
  incoming: [],
  outgoing: [],
  missing: [],
  incomingCount: 0,
  outgoingCount: 0,
  missingCount: 0,
  orphan: false,
}

const emptyAssetReport = (path: string | null): MarkdownAssetReport => ({
  indexed: false,
  currentPath: path,
  currentAssets: [],
  currentAssetCount: 0,
  currentMissingCount: 0,
  workspaceMissingAssets: [],
  workspaceMissingCount: 0,
  limit: INSPECTOR_ASSET_LIMIT,
})

const mapBacklink = (
  backlink: WorkspaceDocumentInsightsResult['backlinks'][number],
): BacklinkReference => ({
  sourcePath: backlink.source_path,
  text: backlink.text,
  context: backlink.context,
  line: backlink.line,
  column: backlink.column,
  targetAnchor: backlink.target_anchor ?? null,
  targetHeadingSlug: backlink.target_heading_slug ?? null,
})

const mapDiagnostic = (
  diagnostic: WorkspaceDocumentInsightsResult['diagnostics'][number],
): MarkdownSourceDiagnostic => ({
  line: diagnostic.line,
  startColumn: diagnostic.start_column,
  endColumn: diagnostic.end_column,
  message: diagnostic.message,
  severity: diagnostic.severity,
})

const mapKnowledgeLink = (
  link: WorkspaceDocumentInsightsResult['knowledge']['incoming'][number],
): KnowledgeLinkReference => ({
  path: link.path,
  label: link.label,
  count: link.count,
  firstLine: link.first_line,
  firstColumn: link.first_column,
  firstText: link.first_text,
  firstContext: link.first_context,
})

const mapMissingReference = (
  reference: WorkspaceDocumentInsightsResult['knowledge']['missing'][number],
): KnowledgeMissingReference => ({
  target: reference.target,
  text: reference.text,
  linkType: reference.link_type,
  line: reference.line,
  column: reference.column,
  context: reference.context,
})

const mapKnowledge = (data: WorkspaceDocumentInsightsResult): KnowledgeInsights => ({
  incoming: data.knowledge.incoming.map(mapKnowledgeLink),
  outgoing: data.knowledge.outgoing.map(mapKnowledgeLink),
  missing: data.knowledge.missing.map(mapMissingReference),
  incomingCount: data.knowledge.incoming_count,
  outgoingCount: data.knowledge.outgoing_count,
  missingCount: data.knowledge.missing_count,
  orphan: data.knowledge.orphan,
})

const mapAsset = (
  asset: WorkspaceDocumentInsightsResult['asset_report']['current_assets'][number],
): MarkdownAssetReference => ({
  id: asset.id,
  sourcePath: asset.source_path,
  target: asset.target,
  targetPath: asset.target_path,
  mediaType: asset.media_type,
  context: asset.context,
  line: asset.line,
  column: asset.column,
  status: asset.status,
})

const mapAssetReport = (data: WorkspaceDocumentInsightsResult): MarkdownAssetReport => ({
  indexed: true,
  currentPath: data.path,
  currentAssets: data.asset_report.current_assets.map(mapAsset),
  currentAssetCount: data.asset_report.current_asset_count,
  currentMissingCount: data.asset_report.current_missing_count,
  workspaceMissingAssets: data.asset_report.workspace_missing_assets.map(mapAsset),
  workspaceMissingCount: data.asset_report.workspace_missing_count,
  limit: data.asset_report.limit,
})

export const useRightSidebarData = ({
  collapsed,
  workspaceKey,
  activePath,
  targetPath,
  editorValue,
  fileContents,
}: UseRightSidebarDataArgs) => {
  const enabled = !collapsed && Boolean(workspaceKey) && Boolean(targetPath)
  const insightsQuery = useQuery({
    queryKey: ['workspace-document-insights', workspaceKey, targetPath],
    queryFn: () =>
      workspaceAnalysisApi.getDocumentInsights({
        path: targetPath ?? '',
        asset_limit: INSPECTOR_ASSET_LIMIT,
      }),
    enabled,
    staleTime: 10_000,
  })
  const metadataQuery = useQuery({
    queryKey: ['path-metadata', workspaceKey, targetPath],
    queryFn: () => fsApi.getPathMetadata(targetPath ?? ''),
    enabled,
    staleTime: 10_000,
  })
  const data = insightsQuery.data?.path === targetPath ? insightsQuery.data : null
  const displayMetadata = metadataQuery.data?.path === targetPath ? metadataQuery.data : null
  const statsContent =
    targetPath === activePath ? editorValue : (fileContents[targetPath ?? ''] ?? '')
  const textAnalysis = useMarkdownTextAnalysis(statsContent, enabled, targetPath ?? 'empty')
  const outline = data?.found ? data.headings : []
  const backlinks = useMemo(() => (data?.found ? data.backlinks.map(mapBacklink) : []), [data])
  const problems = useMemo(() => (data?.found ? data.diagnostics.map(mapDiagnostic) : []), [data])
  const assetReport = useMemo(
    () => (data?.found ? mapAssetReport(data) : emptyAssetReport(targetPath)),
    [data, targetPath],
  )
  const knowledge = useMemo(() => (data?.found ? mapKnowledge(data) : emptyKnowledge), [data])
  const errorProblems = useMemo(
    () => problems.filter((problem) => problem.severity === 'error'),
    [problems],
  )
  const warningProblems = useMemo(
    () => problems.filter((problem) => problem.severity !== 'error'),
    [problems],
  )

  return {
    outline,
    backlinks,
    problems,
    errorProblems,
    warningProblems,
    documentStats: enabled ? textAnalysis.stats : { lines: 0, words: 0 },
    documentStatsLoading: textAnalysis.isLoading,
    documentStatsError: textAnalysis.error,
    displayMetadata,
    loadingMetadata: enabled && metadataQuery.isPending,
    assetReport,
    knowledge,
    insightsLoading: enabled && insightsQuery.isPending,
    insightsError:
      enabled && insightsQuery.error
        ? insightsQuery.error instanceof Error
          ? insightsQuery.error.message
          : 'Workspace insights failed to load.'
        : null,
    retryInsights: () => insightsQuery.refetch(),
  }
}
