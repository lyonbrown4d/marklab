import path from 'node:path'
import { Notification } from 'electron'
import type { ExportFormat } from '@electron/services/export/exportRequest'

const showNotification = (title: string, body: string, onClick?: () => void): void => {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title, body })
  if (onClick) notification.on('click', onClick)
  notification.show()
}

export const notifyExportFinished = (
  format: ExportFormat,
  outputPath: string,
  onClick?: () => void,
): void => {
  showNotification(
    'Export finished',
    `${format.toUpperCase()} saved to ${path.basename(outputPath)}`,
    onClick,
  )
}

export const notifyExportFailed = (
  format: ExportFormat,
  outputPath: string,
  message: string,
): void => {
  // Detailed renderer feedback keeps the actionable error; OS notifications avoid leaking paths.
  void message
  showNotification('Export failed', `${format.toUpperCase()} ${path.basename(outputPath)} failed`)
}
