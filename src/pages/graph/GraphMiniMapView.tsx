import { MiniMap, useStore } from '@xyflow/react'
import { memo, type CSSProperties } from 'react'
import { useI18n } from '@/i18n/useI18n'
import {
  getGraphMiniMapSize,
  getMiniMapNodeColor,
  shouldRenderGraphMiniMap,
} from '@/pages/graph/graphMiniMap'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import type { GraphMiniMapPosition } from '@/store/appTypes'

export type GraphMiniMapOffsets = Partial<Record<GraphMiniMapPosition, CSSProperties>>
export type GraphMiniMapFallbacks = Partial<Record<GraphMiniMapPosition, GraphMiniMapPosition>>

export const knowledgeGraphMiniMapFallbacks: GraphMiniMapFallbacks = {
  'top-left': 'bottom-right',
  'top-right': 'bottom-right',
}

export const mindmapMiniMapFallbacks: GraphMiniMapFallbacks = {
  'top-left': 'top-right',
}

export const knowledgeGraphMiniMapOffsets: GraphMiniMapOffsets = {
  'top-left': { marginTop: 104 },
  'top-right': { marginRight: 352, marginTop: 104 },
  'bottom-left': { marginBottom: 128 },
}

export const mindmapMiniMapOffsets: GraphMiniMapOffsets = {
  'top-left': { marginTop: 72 },
  'bottom-left': { marginBottom: 112 },
}

export const workspaceMiniMapOffsets: GraphMiniMapOffsets = {
  'bottom-right': { marginBottom: 112 },
}

type GraphMiniMapProps = {
  narrowFallbacks?: GraphMiniMapFallbacks
  offsets?: GraphMiniMapOffsets
  nodeCount: number
  show: boolean
}

export const GraphMiniMap = memo(
  ({ narrowFallbacks, nodeCount, offsets, show }: GraphMiniMapProps) => {
    const { t } = useI18n()
    const preferredPosition = usePreferencesStore((state) => state.graphMiniMapPosition)
    const size = usePreferencesStore((state) => state.graphMiniMapSize)
    const canvasWidth = useStore((state) => state.width)
    const position =
      canvasWidth > 0 && canvasWidth < 760
        ? (narrowFallbacks?.[preferredPosition] ?? preferredPosition)
        : preferredPosition

    if (!shouldRenderGraphMiniMap(show, nodeCount)) return null

    return (
      <MiniMap
        ariaLabel={t('graph.minimapLabel')}
        className="graph-minimap overflow-hidden rounded-[calc(var(--radius)+2px)] border border-[color-mix(in_srgb,hsl(var(--border))_82%,transparent)] !bg-[color-mix(in_srgb,hsl(var(--card))_94%,transparent)] shadow-[0_12px_28px_-20px_hsl(var(--foreground)/42%)] backdrop-blur-[12px] [&_.react-flow__minimap-mask]:!fill-[hsl(var(--background)/68%)]"
        nodeColor={getMiniMapNodeColor}
        pannable
        position={position}
        style={{ ...getGraphMiniMapSize(size), ...offsets?.[position] }}
        zoomable
      />
    )
  },
)
