import { useState, type ReactElement } from 'react'
import { HoverCard } from 'radix-ui'
import { useWorkspacePane } from '@/features/workbench/paneContext'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { KnowledgeNodePreview } from '@/components/knowledge/KnowledgeNodePreview'
import { linkedFilePathCandidates } from '@/logic/markdownCompletionPaths'
import { isMarkdownFilePath } from '@/logic/fileTypes'
import { fsApi } from '@/services/fsApi'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useI18n } from '@/i18n/useI18n'

type WorkspaceDocumentLinkPreviewProps = {
  children: ReactElement
  documentPath: string | null
  target: string
  title: string
  onOpen?: () => void
}

const DocumentLinkPreviewContent = ({
  documentPath,
  target,
  onOpen,
}: Omit<WorkspaceDocumentLinkPreviewProps, 'children' | 'title'>) => {
  const { t } = useI18n()
  const workspaceKey = useWorkspaceStore((state) => `${state.rootKind}:${state.rootPath}`)
  const query = useQuery({
    queryKey: ['workspace-graph', workspaceKey, 'link-preview', documentPath, target],
    queryFn: async ({ signal }) => {
      signal.throwIfAborted()
      const candidates = linkedFilePathCandidates(documentPath, target).filter(isMarkdownFilePath)
      if (candidates.length === 0) return null
      const existing = await workspaceTreeApi.pathsExist({ kind: 'file', paths: candidates })
      signal.throwIfAborted()
      const current = useWorkspaceStore.getState()
      if (
        `${current.rootKind}:${current.rootPath}` !== workspaceKey ||
        `${existing.root.kind}:${existing.root.path}` !== workspaceKey
      )
        return null
      const path = candidates.find((candidate) => existing.existing.includes(candidate))
      if (!path) return null
      const graph = await fsApi.getWorkspaceGraph({
        center_path: path,
        depth: 1,
        direction: 'both',
        include_attachments: false,
        include_missing: false,
        max_nodes: 1,
        max_edges: 1,
      })
      signal.throwIfAborted()
      return { path, revision: graph.revision }
    },
    retry: false,
    staleTime: 30_000,
    gcTime: 60_000,
  })
  if (query.isPending)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        {t('knowledgeGraph.loadingPreview')}
      </p>
    )
  if (query.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        {t('knowledgeGraph.previewError')}
      </p>
    )
  if (!query.data)
    return <p className="text-xs text-muted-foreground">{t('knowledgeGraph.missingTarget')}</p>
  return (
    <>
      <p className="mb-2 truncate text-[11px] text-muted-foreground">{query.data.path}</p>
      <KnowledgeNodePreview
        nodeId={`file:${query.data.path}`}
        revision={query.data.revision}
        workspaceKey={workspaceKey}
      />
      {onOpen && (
        <Button variant="secondary" size="sm" className="mt-2" onClick={onOpen}>
          {t('knowledgeGraph.openDocument')}
        </Button>
      )}
    </>
  )
}

export const WorkspaceDocumentLinkPreview = ({
  children,
  title,
  ...props
}: WorkspaceDocumentLinkPreviewProps) => {
  const [open, setOpen] = useState(false)
  const pane = useWorkspacePane()
  const interactionActive = pane?.active ?? true
  const visible = interactionActive && open
  return (
    <HoverCard.Root
      open={visible}
      onOpenChange={(nextOpen) => setOpen(interactionActive && nextOpen)}
      openDelay={350}
      closeDelay={150}
    >
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      {visible && (
        <HoverCard.Portal>
          <HoverCard.Content
            side="bottom"
            align="start"
            sideOffset={8}
            contentEditable={false}
            className="z-50 w-80 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="mb-1 truncate text-sm font-medium">{title}</p>
            <DocumentLinkPreviewContent {...props} />
          </HoverCard.Content>
        </HoverCard.Portal>
      )}
    </HoverCard.Root>
  )
}
