import type { FsGraph } from '@/services/fsApi'

const WORKSPACE_FILE_SUMMARY_CHARACTERS = 420

export const graphNodeContent = (
  node: FsGraph['nodes'][number],
  includeHeadingContent: boolean,
): string | undefined => {
  if (node.kind !== 'file') return includeHeadingContent ? (node.content ?? undefined) : undefined

  // File content is a backend-produced preview summary, not an editable/full Markdown payload.
  const summary = node.content?.trim() ?? ''
  if (!summary) return undefined
  if (summary.length <= WORKSPACE_FILE_SUMMARY_CHARACTERS) return summary
  return `${summary.slice(0, WORKSPACE_FILE_SUMMARY_CHARACTERS - 3).trimEnd()}...`
}
