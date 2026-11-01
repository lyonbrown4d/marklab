import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { KnowledgeMarkdownPreview } from '@/components/previews/KnowledgeMarkdownPreview'
import { fsApi } from '@/services/fsApi'
import { useI18n } from '@/i18n/useI18n'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

export type KnowledgeNodePreviewProps = {
  nodeId: string
  revision: string
  workspaceKey: string
}

export const KnowledgeNodePreview = ({
  nodeId,
  revision,
  workspaceKey,
}: KnowledgeNodePreviewProps) => {
  const { t } = useI18n()
  const currentWorkspaceKey = useWorkspaceStore((state) => `${state.rootKind}:${state.rootPath}`)
  const query = useQuery({
    queryKey: ['workspace-graph-details', workspaceKey, revision, nodeId],
    enabled: currentWorkspaceKey === workspaceKey,
    queryFn: async ({ signal }) => {
      signal.throwIfAborted()
      const result = await fsApi.getWorkspaceGraphNodeDetails({
        node_ids: [nodeId],
        revision,
        mode: 'summary',
        max_nodes: 1,
      })
      signal.throwIfAborted()
      return result
    },
    staleTime: 30_000,
    gcTime: 60_000,
    retry: false,
  })
  if (query.isPending)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {t('knowledgeGraph.loadingPreview')}
      </p>
    )
  if (query.isError)
    return (
      <div role="alert" className="text-xs text-destructive">
        {t('knowledgeGraph.previewError')}
        <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
          {t('actions.retry')}
        </Button>
      </div>
    )
  const item = query.data.items.find((item) => item.id === nodeId)
  if (!item || !item.content.trim())
    return <p className="text-xs text-muted-foreground">{t('knowledgeGraph.emptyPreview')}</p>
  return (
    <div className="max-h-48 overflow-hidden text-xs">
      <KnowledgeMarkdownPreview markdown={item.content} preview={item.preview} />
    </div>
  )
}
