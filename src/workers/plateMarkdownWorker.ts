import type { Value } from 'platejs'
import {
  createPlateMarkdownWorkerEditor,
  deserializePlateMarkdownInWorker,
  serializePlateMarkdownInWorker,
} from '@/components/plate/plateMarkdownWorkerConfig'
import { PlateMarkdownStreamCache } from '@/workers/plateMarkdownStreamCache'
import type {
  PlateMarkdownWorkerRequest,
  PlateMarkdownWorkerResponse,
} from '@/workers/plateMarkdownWorkerProtocol'

export { chunkPlateMarkdownValue } from '@/workers/plateMarkdownStreamCache'

type WorkerScope = {
  onmessage: ((event: { data: PlateMarkdownWorkerRequest }) => void) | null
  postMessage(message: PlateMarkdownWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope
const editor = createPlateMarkdownWorkerEditor()
const streamCache = new PlateMarkdownStreamCache((markdown) =>
  deserializePlateMarkdownInWorker(editor, markdown),
)

type ParseStream = {
  chunks: Value[]
  index: number
}

const parseStreams = new Map<number, ParseStream>()

export const processPlateMarkdownWorkerRequest = (
  data: Extract<PlateMarkdownWorkerRequest, { operation: 'parse' | 'serialize' }>,
): PlateMarkdownWorkerResponse => {
  try {
    if (data.operation === 'serialize') {
      return {
        id: data.id,
        markdown: serializePlateMarkdownInWorker(editor, data.value),
        ok: true,
        operation: 'serialize',
      }
    }
    return {
      id: data.id,
      ok: true,
      operation: 'parse',
      value: deserializePlateMarkdownInWorker(editor, data.markdown),
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

const postWorkerFailure = (
  id: number,
  operation: 'parse-stream' | 'prepare-stream',
  error: unknown,
) => {
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
  try {
    workerScope.postMessage({ done, id, ok: true, operation: 'parse-stream', value })
  } catch (error) {
    parseStreams.delete(id)
    throw error
  }
}

workerScope.onmessage = ({ data }) => {
  if (data.operation === 'cancel') {
    parseStreams.delete(data.id)
    return
  }
  if (data.operation === 'parse-next') {
    try {
      postNextParseChunk(data.id)
    } catch (error) {
      postWorkerFailure(data.id, 'parse-stream', error)
    }
    return
  }
  if (data.operation === 'parse-stream') {
    try {
      parseStreams.set(data.id, { chunks: streamCache.takeChunks(data.markdown), index: 0 })
      postNextParseChunk(data.id)
    } catch (error) {
      postWorkerFailure(data.id, data.operation, error)
    }
    return
  }
  if (data.operation === 'prepare-stream') {
    try {
      streamCache.getChunks(data.markdown)
      workerScope.postMessage({ id: data.id, ok: true, operation: 'prepare-stream' })
    } catch (error) {
      postWorkerFailure(data.id, data.operation, error)
    }
    return
  }
  workerScope.postMessage(processPlateMarkdownWorkerRequest(data))
}
