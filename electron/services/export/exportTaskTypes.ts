import type { ExportFormat } from '@electron/services/export/exportRequest'

export type ActiveExport = {
  cancellationReported: boolean
  committing: boolean
  controller: AbortController
  format: ExportFormat
  outputPath: string
  ownerId?: number
  progress: number
}
