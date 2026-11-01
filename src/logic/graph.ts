import type { FsGraph, FsGraphEdge, FsGraphNode } from '@/services/fsApi'

/** Domain topology, independent from the graph renderer and document editor. */
export type GraphData = FsGraph
export type GraphNode = FsGraphNode
export type GraphEdge = FsGraphEdge
