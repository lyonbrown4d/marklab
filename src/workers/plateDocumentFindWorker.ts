import { scanPlateDocumentFindSource } from '@/workers/plateDocumentFindWorkerModel'
import type {
  PlateDocumentFindWorkerRequest,
  PlateDocumentFindWorkerResponse,
} from '@/workers/plateDocumentFindWorkerProtocol'

type WorkerScope = {
  onmessage: ((event: { data: PlateDocumentFindWorkerRequest }) => void) | null
  postMessage(message: PlateDocumentFindWorkerResponse): void
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = ({ data }) => {
  try {
    workerScope.postMessage({
      id: data.id,
      matches: scanPlateDocumentFindSource(data.source, data.query, data.options),
      ok: true,
    })
  } catch (error) {
    workerScope.postMessage({
      error: error instanceof Error ? error.message : 'scanFailed',
      id: data.id,
      ok: false,
    })
  }
}
