import { createSlateEditor, type Value } from 'platejs'
import { plateMarkdownPlugins } from '@/components/plate/plateMarkdownConfig'
import {
  deserializePlateMarkdown,
  serializePlateMarkdown,
} from '@/components/plate/plateMarkdownSerialization'

export type PlateMarkdownWorkerRequest =
  | { id: number; markdown: string; operation: 'parse' }
  | { id: number; operation: 'serialize'; value: Value }

export type PlateMarkdownWorkerResponse =
  | { id: number; ok: true; operation: 'parse'; value: Value }
  | { id: number; markdown: string; ok: true; operation: 'serialize' }
  | { error: string; id: number; ok: false; operation: 'parse' | 'serialize' }

type WorkerScope = {
  onmessage: ((event: { data: PlateMarkdownWorkerRequest }) => void) | null
  postMessage(message: PlateMarkdownWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope
const editor = createSlateEditor({ plugins: [...plateMarkdownPlugins] })

export const processPlateMarkdownWorkerRequest = (
  data: PlateMarkdownWorkerRequest,
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

workerScope.onmessage = ({ data }) => {
  workerScope.postMessage(processPlateMarkdownWorkerRequest(data))
}
