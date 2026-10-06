export type GraphLayoutNodeInput = {
  children?: GraphLayoutNodeInput[]
  height: number
  id: string
  layoutOptions?: Record<string, string>
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
  children?: GraphLayoutNodeResult[]
}

export type GraphLayoutNodeResult = Omit<GraphLayoutNodeInput, 'children'> & {
  children?: GraphLayoutNodeResult[]
  x?: number
  y?: number
}
