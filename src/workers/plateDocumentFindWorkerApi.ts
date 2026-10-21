import { scanPlateDocumentFindSource } from '@/workers/plateDocumentFindWorkerModel'
import type { PlateDocumentFindWorkerScan } from '@/workers/plateDocumentFindWorkerProtocol'

export const plateDocumentFindWorkerApi = {
  scan: ({ source, query, options }: PlateDocumentFindWorkerScan) =>
    scanPlateDocumentFindSource(source, query, options),
}

export type PlateDocumentFindWorkerApi = typeof plateDocumentFindWorkerApi
