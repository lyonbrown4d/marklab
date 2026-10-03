import { createSlateEditor, type Value } from 'platejs'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import {
  deserializePlateMarkdown,
  serializePlateMarkdown,
} from '@/components/plate/plateMarkdownSerialization'

export type PlateMarkdownWorkerRequest =
  | { id: number; operation: 'cancel' }
  | { id: number; markdown: string; operation: 'parse' }
  | { id: number; markdown: string; operation: 'parse-stream' }
  | { id: number; operation: 'parse-next' }
  | { id: number; operation: 'serialize'; value: Value }

export type PlateMarkdownWorkerResponse =
  | { id: number; ok: true; operation: 'parse'; value: Value }
  | { done: boolean; id: number; ok: true; operation: 'parse-stream'; value: Value }
  | { id: number; markdown: string; ok: true; operation: 'serialize' }
  | {
      error: string
      id: number
      ok: false
      operation: 'parse' | 'parse-stream' | 'serialize'
    }

type WorkerScope = {
  onmessage: ((event: { data: PlateMarkdownWorkerRequest }) => void) | null
  postMessage(message: PlateMarkdownWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope
const editor = createSlateEditor({ plugins: [...plateMarkdownPlugins] })
const PARSE_CHUNK_MAX_CHARACTERS = 96 * 1_024
const PARSE_CHUNK_MAX_NODES = 256
const PARSE_FIRST_CHUNK_MAX_NODES = 32

type ParseStream = {
  chunks: Value[]
  index: number
}

const parseStreams = new Map<number, ParseStream>()

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

export const processPlateMarkdownWorkerRequest = (
  data: Extract<PlateMarkdownWorkerRequest, { operation: 'parse' | 'serialize' }>,
): PlateMarkdownWorkerResponse => {
  try {
    if (data.operation === 'serialize') {
      return {
        id: data.id,
        markdown: serializePlateMarkdown(editor, data.value),
        ok: true,
        operation: 'serialize',
      }
    }
    return {
      id: data.id,
      ok: true,
      operation: 'parse',
      value: deserializePlateMarkdown(editor, data.markdown),
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Markdown parse failed.',
      id: data.id,
      ok: false,
      operation: data.operation,
    }
  }
}

const postWorkerFailure = (id: number, operation: 'parse-stream', error: unknown) => {
  workerScope.postMessage({
    error: error instanceof Error ? error.message : 'Markdown parse failed.',
    id,
    ok: false,
    operation,
  })
}

const postNextParseChunk = (id: number) => {
  const stream = parseStreams.get(id)
  if (!stream) return
  const value = stream.chunks[stream.index] ?? []
  const done = stream.index >= stream.chunks.length - 1
  if (done) parseStreams.delete(id)
  else stream.index += 1
  workerScope.postMessage({ done, id, ok: true, operation: 'parse-stream', value })
}

workerScope.onmessage = ({ data }) => {
  if (data.operation === 'cancel') {
    parseStreams.delete(data.id)
    return
  }
  if (data.operation === 'parse-next') {
    postNextParseChunk(data.id)
    return
  }
  if (data.operation === 'parse-stream') {
    try {
      const value = deserializePlateMarkdown(editor, data.markdown)
      parseStreams.set(data.id, { chunks: chunkPlateMarkdownValue(value), index: 0 })
      postNextParseChunk(data.id)
    } catch (error) {
      postWorkerFailure(data.id, data.operation, error)
    }
    return
  }
  workerScope.postMessage(processPlateMarkdownWorkerRequest(data))
}
