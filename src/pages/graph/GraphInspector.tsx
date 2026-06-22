import { ArrowDownLeft, ArrowUpRight, FolderOpen } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import type { GraphNodeDetails } from '@/logic/graphViewModel'

type GraphInspectorProps = {
  details: GraphNodeDetails | null
  onOpenPath: (path: string) => void
  t: (key: string) => string
}

export const GraphInspector = ({ details, onOpenPath, t }: GraphInspectorProps) => {
  if (!details) {
    return (
      <aside className="pointer-events-auto absolute right-3 top-14 z-10 hidden w-72 rounded-lg border border-border bg-card/95 p-3 text-sm shadow-sm backdrop-blur lg:block">
        <div className="text-sm font-semibold">{t('graph.inspectorTitle')}</div>
        <div className="mt-2 text-xs leading-5 text-muted-foreground">
          {t('graph.selectNodeDescription')}
        </div>
      </aside>
    )
  }

  return (
    <aside className="pointer-events-auto absolute right-3 top-14 z-10 hidden max-h-[calc(100%-5rem)] w-80 flex-col overflow-hidden rounded-lg border border-border bg-card/95 p-3 text-sm shadow-sm backdrop-blur lg:flex">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('graph.inspectorTitle')}
          </div>
          <div className="mt-1 truncate text-sm font-semibold text-foreground">{details.label}</div>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-md font-normal">
          {t(`graph.kind.${details.kind}`)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-xs">
        {details.path ? <Property label={t('graph.path')} value={details.path} /> : null}
        {details.url ? <Property label={t('graph.url')} value={details.url} /> : null}
        {details.level ? <Property label={t('graph.level')} value={`H${details.level}`} /> : null}
        {details.line ? <Property label={t('graph.line')} value={`L${details.line}`} /> : null}
      </div>

      {details.openPath ? (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3 h-8 justify-start rounded-md"
          onClick={() => onOpenPath(details.openPath!)}
        >
          <FolderOpen data-icon="inline-start" />
          {t('graph.openNode')}
        </Button>
      ) : null}

      {details.kind === 'preview' && details.path ? (
        <>
          <Separator className="my-3" />
          <EmbeddedFilePreview
            className="border-border/70 shadow-none"
            documentPath={null}
            target={details.path}
            title={details.label}
          />
        </>
      ) : null}

      {details.content ? (
        <>
          <Separator className="my-3" />
          <div className="line-clamp-4 text-xs leading-5 text-muted-foreground">
            {details.content}
          </div>
        </>
      ) : null}

      <Separator className="my-3" />
      <div className="grid min-h-0 grid-cols-2 gap-3 overflow-hidden">
        <ConnectionList
          icon="incoming"
          label={t('graph.incoming')}
          emptyLabel={t('graph.noConnections')}
          details={details}
        />
        <ConnectionList
          icon="outgoing"
          label={t('graph.outgoing')}
          emptyLabel={t('graph.noConnections')}
          details={details}
        />
      </div>
    </aside>
  )
}

type PropertyProps = {
  label: string
  value: string
}

const Property = ({ label, value }: PropertyProps) => (
  <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-muted/50 px-2 py-1.5">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="truncate text-foreground/85" title={value}>
      {value}
    </span>
  </div>
)

type ConnectionListProps = {
  details: GraphNodeDetails
  emptyLabel: string
  icon: 'incoming' | 'outgoing'
  label: string
}

const ConnectionList = ({ details, emptyLabel, icon, label }: ConnectionListProps) => {
  const connections = icon === 'incoming' ? details.incoming : details.outgoing
  const Icon = icon === 'incoming' ? ArrowDownLeft : ArrowUpRight

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
        <Badge variant="outline" className="ml-auto h-4 rounded px-1 text-[10px] font-normal">
          {connections.length}
        </Badge>
      </div>
      {connections.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-2 py-3 text-center text-[11px] text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="flex max-h-40 flex-col gap-1 overflow-hidden">
          {connections.slice(0, 4).map((connection) => (
            <div
              key={connection.edge.id}
              className="truncate rounded-md bg-muted/45 px-2 py-1.5 text-xs text-foreground/85"
              title={connection.node.data.label}
            >
              {connection.node.data.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
