import type { CSSProperties } from 'react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { GraphNodeDetails } from '@/logic/graphViewModel'

type GraphHoverPreviewProps = {
  details: GraphNodeDetails | null
  position: { x: number; y: number } | null
  t: (key: string) => string
}

type GraphHoverPreviewStyle = CSSProperties & {
  '--graph-hover-preview-x': string
  '--graph-hover-preview-y': string
}

export const GraphHoverPreview = ({ details, position, t }: GraphHoverPreviewProps) => {
  if (!details || !position) return null

  const previewStyle: GraphHoverPreviewStyle = {
    '--graph-hover-preview-x': `${position.x + 14}px`,
    '--graph-hover-preview-y': `${position.y + 14}px`,
  }

  return (
    <Card
      aria-hidden="true"
      className="graph-hover-preview pointer-events-none absolute left-0 top-0 z-20 hidden w-64 rounded-lg border-border bg-popover/95 p-0 text-xs text-popover-foreground shadow-md backdrop-blur md:block"
      style={previewStyle}
    >
      <CardHeader className="p-3">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="truncate text-sm">{details.label}</CardTitle>
            {details.path ? (
              <CardDescription className="mt-1 truncate text-xs" title={details.path}>
                {details.path}
              </CardDescription>
            ) : null}
          </div>
          <Badge variant="secondary" className="shrink-0 rounded-md font-normal">
            {t(`graph.kind.${details.kind}`)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-3 pt-0">
        {details.content ? (
          <>
            <div className="line-clamp-3 leading-5 text-muted-foreground">{details.content}</div>
            <Separator className="my-3" />
          </>
        ) : null}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="h-5 rounded-md px-1.5 font-normal">
            {t('graph.incoming')}: {details.incoming.length}
          </Badge>
          <Badge variant="outline" className="h-5 rounded-md px-1.5 font-normal">
            {t('graph.outgoing')}: {details.outgoing.length}
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
