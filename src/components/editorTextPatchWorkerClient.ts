import EditorTextPatchWorker from '@/workers/editorTextPatchWorker?worker'
import { createEditorTextPatch } from '@/components/editorTextPatch'
import type { EditorTextChange } from '@/types/editorChanges'

type PendingPatch = {
  reject: (error: Error) => void
  resolve: (changes: EditorTextChange[] | null) => void
}

class EditorTextPatchWorkerClient {
  private nextId = 1
  private readonly pending = new Map<number, PendingPatch>()
  private worker: Worker | null = null

  create(previous: string, content: string): Promise<EditorTextChange[] | null> {
    const worker = this.ensureWorker()
    const id = this.nextId
    this.nextId += 1
    return new Promise((resolve, reject) => {
      this.pending.set(id, { reject, resolve })
      worker.postMessage({ id, previous, content })
    })
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker
    const worker = new EditorTextPatchWorker()
    worker.onmessage = ({
      data,
    }: MessageEvent<{ id: number; changes: EditorTextChange[] | null }>) => {
      const pending = this.pending.get(data.id)
      if (!pending) return
      this.pending.delete(data.id)
      pending.resolve(data.changes)
    }
    worker.onerror = (event) => {
      this.worker = null
      const pending = [...this.pending.values()]
      this.pending.clear()
      pending.forEach(({ reject }) => reject(new Error(event.message || 'Patch worker failed')))
    }
    this.worker = worker
    return worker
  }
}

const client = new EditorTextPatchWorkerClient()

export const createEditorTextPatchAsync = (
  previous: string,
  content: string,
): Promise<EditorTextChange[] | null> => {
  if (typeof Worker === 'undefined')
    return Promise.resolve(createEditorTextPatch(previous, content))
  return client.create(previous, content)
}
