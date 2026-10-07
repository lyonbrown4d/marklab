import { createEditorTextPatch } from '@/components/editorTextPatch'

type PatchWorkerRequest = { id: number; previous: string; content: string }
type PatchWorkerScope = {
  onmessage: ((event: { data: PatchWorkerRequest }) => void) | null
  postMessage(message: { id: number; changes: ReturnType<typeof createEditorTextPatch> }): void
}

const workerScope = self as unknown as PatchWorkerScope

workerScope.onmessage = ({ data }) => {
  workerScope.postMessage({
    id: data.id,
    changes: createEditorTextPatch(data.previous, data.content),
  })
}
