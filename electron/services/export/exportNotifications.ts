import path from 'node:path'
import type { DesktopNotificationServiceContract } from '@electron/services/desktopNotificationService'
import type { ExportFormat } from '@electron/services/export/exportRequest'

export const notifyExportFinished = (
  id: string,
  format: ExportFormat,
  outputPath: string,
  ownerWebContentsId: number | undefined,
  onClick?: () => void,
  desktopNotifications?: DesktopNotificationServiceContract,
): void => {
  desktopNotifications?.show({
    body: `${format.toUpperCase()} saved to ${path.basename(outputPath)}`,
    category: 'export',
    id,
    onClick,
    ownerWebContentsId,
    title: 'Export finished',
  })
}

export const notifyExportFailed = (
  id: string,
  format: ExportFormat,
  outputPath: string,
  message: string,
  ownerWebContentsId: number | undefined,
  desktopNotifications?: DesktopNotificationServiceContract,
): void => {
  // Detailed renderer feedback keeps the actionable error; OS notifications avoid leaking paths.
  void message
  desktopNotifications?.show({
    body: `${format.toUpperCase()} ${path.basename(outputPath)} failed`,
    category: 'export',
    id,
    ownerWebContentsId,
    title: 'Export failed',
  })
}
