import type { Value } from 'platejs'
import { LRUCache } from 'lru-cache'

const PARSE_CHUNK_MAX_CHARACTERS = 96 * 1_024
// Keep transport boundaries divisible by Plate's 20-node renderer chunks.
const PARSE_CHUNK_MAX_NODES = 240
const PARSE_FIRST_CHUNK_MAX_NODES = 20

const countNodeCharacters = (root: unknown) => {
  const pending = [root]
  let characters = 0
  while (pending.length > 0) {
    const node = pending.pop()
    if (!node || typeof node !== 'object') continue
    if ('text' in node && typeof node.text === 'string') characters += node.text.length
    if ('children' in node && Array.isArray(node.children)) pending.push(...node.children)
  }
  return characters
}

export const chunkPlateMarkdownValue = (
  value: Value,
  maxNodes = PARSE_CHUNK_MAX_NODES,
  maxCharacters = PARSE_CHUNK_MAX_CHARACTERS,
) => {
  const boundedMaxNodes = Math.max(1, Math.floor(maxNodes))
  const boundedMaxCharacters = Math.max(1, Math.floor(maxCharacters))
  const chunks: Value[] = []
  let chunk: Value = []
  let chunkCharacters = 0
  for (const node of value) {
    const nodeCharacters = countNodeCharacters(node)
    const nodeLimit =
      chunks.length === 0 ? Math.min(PARSE_FIRST_CHUNK_MAX_NODES, boundedMaxNodes) : boundedMaxNodes
    if (
      chunk.length > 0 &&
      (chunk.length >= nodeLimit || chunkCharacters + nodeCharacters > boundedMaxCharacters)
    ) {
      chunks.push(chunk)
      chunk = []
      chunkCharacters = 0
    }
    chunk.push(node)
    chunkCharacters += nodeCharacters
  }
  if (chunk.length > 0) chunks.push(chunk)
  return chunks.length > 0 ? chunks : [[]]
}

export class PlateMarkdownStreamCache {
  private readonly cache: LRUCache<string, Value[]>
  private readonly parse: (markdown: string) => Value

  constructor(parse: (markdown: string) => Value, maxEntries = 1) {
    this.parse = parse
    this.cache = new LRUCache({ max: Math.max(1, Math.floor(maxEntries)) })
  }

  getChunks(markdown: string): Value[] {
    const cached = this.cache.get(markdown)
    if (cached) return cached
    const chunks = chunkPlateMarkdownValue(this.parse(markdown))
    this.cache.set(markdown, chunks)
    return chunks
  }

  takeChunks(markdown: string): Value[] {
    const cached = this.cache.get(markdown)
    if (!cached) return chunkPlateMarkdownValue(this.parse(markdown))
    this.cache.delete(markdown)
    return cached
  }
}
