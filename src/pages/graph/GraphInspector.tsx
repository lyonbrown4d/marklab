import { ArrowDownLeft, ArrowUpRight, FolderOpen } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import AppEmptyState from '@/components/AppEmptyState'
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
      <aside
        aria-labelledby="graph-inspector-empty-title"
        className="pointer-events-auto absolute right-3 top-14 z-10 hidden w-72 text-sm lg:block"
      >
        <Card className="rounded-lg border-border bg-card/95 p-0 shadow-sm backdrop-blur">
          <CardHeader className="gap-2 p-3">
            <CardTitle id="graph-inspector-empty-title" className="text-sm">
              {t('graph.inspectorTitle')}
            </CardTitle>
            <CardDescription className="text-xs leading-5">
              {t('graph.selectNodeDescription')}
            </CardDescription>
          </CardHeader>
        </Card>
      </aside>
    )
  }

  return (
    <aside
      aria-labelledby="graph-inspector-title"
      className="pointer-events-auto absolute right-3 top-14 z-10 hidden max-h-[calc(100%-5rem)] w-80 text-sm lg:block"
    >
      <Card className="flex max-h-[calc(100vh-5rem)] flex-col overflow-hidden rounded-lg border-border bg-card/95 p-0 shadow-sm backdrop-blur">
        <CardHeader className="p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardDescription className="text-xs font-medium uppercase tracking-wide">
                {t('graph.inspectorTitle')}
              </CardDescription>
              <CardTitle id="graph-inspector-title" className="mt-1 truncate text-sm">
                {details.label}
              </CardTitle>
            </div>
            <Badge variant="secondary" className="shrink-0 rounded-md font-normal">
              {t(`graph.kind.${details.kind}`)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <ScrollArea className="h-full" viewportClassName="p-3 pt-0">
            <div className="flex flex-col gap-2 text-xs">
              {details.path ? <Property label={t('graph.path')} value={details.path} /> : null}
              {details.url ? <Property label={t('graph.url')} value={details.url} /> : null}
              {details.level ? (
                <Property label={t('graph.level')} value={`H${details.level}`} />
              ) : null}
              {details.line ? (
                <Property label={t('graph.line')} value={`L${details.line}`} />
              ) : null}
            </div>

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
          </ScrollArea>
        </CardContent>

        {details.openPath ? (
          <CardFooter className="p-3 pt-0">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 w-full justify-start rounded-md"
              onClick={() => onOpenPath(details.openPath!)}
            >
              <FolderOpen data-icon="inline-start" />
              {t('graph.openNode')}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
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
  const visibleConnections = connections.slice(0, 4)
  const hiddenConnectionCount = Math.max(connections.length - visibleConnections.length, 0)
  const Icon = icon === 'incoming' ? ArrowDownLeft : ArrowUpRight

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
        <Badge
          variant="outline"
          className="ml-auto h-4 rounded px-1 text-[10px] font-normal"
          aria-label={`${label}: ${connections.length}`}
        >
          {connections.length}
        </Badge>
      </div>
      {connections.length === 0 ? (
        <GraphConnectionEmptyState label={emptyLabel} />
      ) : (
        <ul className="flex max-h-40 flex-col gap-1 overflow-hidden" aria-label={label}>
          {visibleConnections.map((connection) => (
            <li
              key={connection.edge.id}
              className="truncate rounded-md bg-muted/45 px-2 py-1.5 text-xs text-foreground/85"
              title={connection.node.data.label}
            >
              {connection.node.data.label}
            </li>
          ))}
          {hiddenConnectionCount > 0 ? (
            <li>
              <Badge
                variant="secondary"
                className="h-6 w-full justify-center rounded-md px-2 text-[11px] font-normal"
              >
                +{hiddenConnectionCount}
              </Badge>
            </li>
          ) : null}
        </ul>
      )}
    </div>
  )
}

type GraphConnectionEmptyStateProps = {
  label: string
}

const GraphConnectionEmptyState = ({ label }: GraphConnectionEmptyStateProps) => (
  <AppEmptyState
    className="min-h-16 rounded-md border-border/70 bg-muted/15 px-2 py-3 md:p-3"
    compact
    role="note"
    title={label}
    titleClassName="text-[11px] font-normal text-muted-foreground"
    titleLevel={4}
  />
)
