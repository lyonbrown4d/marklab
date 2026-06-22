import { Badge } from '@/components/ui/badge'
import type { GraphNodeDetails } from '@/logic/graphViewModel'

type GraphHoverPreviewProps = {
  details: GraphNodeDetails | null
  position: { x: number; y: number } | null
  t: (key: string) => string
}

export const GraphHoverPreview = ({ details, position, t }: GraphHoverPreviewProps) => {
  if (!details || !position) return null

  return (
    <div
      className="pointer-events-none absolute left-0 top-0 z-20 hidden w-64 rounded-lg border border-border bg-popover/95 p-3 text-xs text-popover-foreground shadow-md backdrop-blur md:block"
      style={{ transform: `translate(${position.x + 14}px, ${position.y + 14}px)` }}
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{details.label}</div>
          {details.path ? (
            <div className="mt-1 truncate text-muted-foreground" title={details.path}>
              {details.path}
            </div>
          ) : null}
        </div>
        <Badge variant="secondary" className="shrink-0 rounded-md font-normal">
          {t(`graph.kind.${details.kind}`)}
        </Badge>
      </div>
      {details.content ? (
        <div className="mt-2 line-clamp-3 leading-5 text-muted-foreground">{details.content}</div>
      ) : null}
      <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>
          {t('graph.incoming')}: {details.incoming.length}
        </span>
        <span className="h-3 w-px bg-border" />
        <span>
          {t('graph.outgoing')}: {details.outgoing.length}
        </span>
      </div>
    </div>
  )
}
