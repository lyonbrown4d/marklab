import { MiniMap, useStore } from '@xyflow/react'
import type { CSSProperties } from 'react'
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

export const GraphMiniMap = ({ narrowFallbacks, nodeCount, offsets, show }: GraphMiniMapProps) => {
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
      className="graph-minimap"
      nodeColor={getMiniMapNodeColor}
      pannable
      position={position}
      style={{ ...getGraphMiniMapSize(size), ...offsets?.[position] }}
      zoomable
    />
  )
}
