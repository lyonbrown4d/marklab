export type GraphLayoutNodeInput = {
  height: number
  id: string
  width: number
}

export type GraphLayoutEdgeInput = {
  id: string
  sources: string[]
  targets: string[]
}

export type GraphLayoutWorkerGraph = {
  children: GraphLayoutNodeInput[]
  edges: GraphLayoutEdgeInput[]
  id: 'root'
  layoutOptions: Record<string, string>
}

export type GraphLayoutPosition = {
  id: string
  x: number
  y: number
}

export type GraphLayoutEngineResult = Omit<GraphLayoutWorkerGraph, 'children'> & {
  children?: Array<GraphLayoutNodeInput & { x?: number; y?: number }>
}
