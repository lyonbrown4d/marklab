import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'

type LayoutHash = {
  low: number
  high: number
}

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193
const SECOND_HASH_OFFSET = 0x9e3779b9
const SECOND_HASH_PRIME = 0x85ebca6b

export const createGraphLayoutKey = (
  scope: string,
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
) => {
  const nodeKey = createCollectionHash(nodes, (node) => hashLayoutParts(node.id))
  const edgeKey = createCollectionHash(edges, (edge) => hashLayoutParts(edge.source, edge.target))

  return `${scope}:n${nodeKey}:e${edgeKey}`
}

const hashLayoutParts = (...parts: string[]): LayoutHash => {
  let low = FNV_OFFSET
  let high = SECOND_HASH_OFFSET

  const addCode = (code: number) => {
    low = Math.imul(low ^ code, FNV_PRIME) >>> 0
    high = Math.imul(high ^ code, SECOND_HASH_PRIME) >>> 0
  }

  parts.forEach((part) => {
    addCode(part.length & 0xff)
    addCode((part.length >>> 8) & 0xff)
    addCode((part.length >>> 16) & 0xff)
    addCode((part.length >>> 24) & 0xff)

    for (let index = 0; index < part.length; index += 1) {
      addCode(part.charCodeAt(index))
    }
  })

  return {
    low: finalizeLayoutHash(low),
    high: finalizeLayoutHash(high),
  }
}

const createCollectionHash = <T>(items: T[], hashItem: (item: T) => LayoutHash) => {
  let lowSum = 0
  let lowXor = 0
  let lowSquareSum = 0
  let highSum = 0
  let highXor = 0
  let highSquareSum = 0

  items.forEach((item) => {
    const hash = hashItem(item)
    lowSum = (lowSum + hash.low) >>> 0
    lowXor = (lowXor ^ hash.low) >>> 0
    lowSquareSum = (lowSquareSum + Math.imul(hash.low, hash.low)) >>> 0
    highSum = (highSum + hash.high) >>> 0
    highXor = (highXor ^ hash.high) >>> 0
    highSquareSum = (highSquareSum + Math.imul(hash.high, hash.high)) >>> 0
  })

  return [
    items.length.toString(36),
    formatLayoutHash(lowSum),
    formatLayoutHash(lowXor),
    formatLayoutHash(lowSquareSum),
    formatLayoutHash(highSum),
    formatLayoutHash(highXor),
    formatLayoutHash(highSquareSum),
  ].join('-')
}

const finalizeLayoutHash = (hash: number) => {
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d) >>> 0
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b) >>> 0
  hash ^= hash >>> 16
  return hash >>> 0
}

const formatLayoutHash = (hash: number) => hash.toString(16).padStart(8, '0')
