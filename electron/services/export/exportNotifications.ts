import path from 'node:path'
import { Notification } from 'electron'
import type { ExportFormat } from '@electron/services/export/exportRequest.js'

const showNotification = (title: string, body: string): void => {
  if (!Notification.isSupported()) return
  new Notification({ title, body }).show()
}

export const notifyExportFinished = (format: ExportFormat, outputPath: string): void => {
  showNotification(
    'Export finished',
    `${format.toUpperCase()} saved to ${path.basename(outputPath)}`,
  )
}

export const notifyExportFailed = (
  format: ExportFormat,
  outputPath: string,
  message: string,
): void => {
  showNotification(
    'Export failed',
    `${format.toUpperCase()} ${path.basename(outputPath)}: ${message}`,
  )
}
