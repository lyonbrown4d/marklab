import path from 'node:path'
import type { IpcMainInvokeEvent } from 'electron'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import {
  commitSavePathCapability,
  consumeSavePathCapability,
  releaseSavePathCapability,
} from '@electron/ipc/savePathCapabilities'
import { maxLocalImageBytes } from '@electron/services/export/docxImages'
import type { ExportService } from '@electron/services/export/exportService'
import { validateExportOutputPath } from '@electron/services/export/exportRequest'
import { parseWorkspacePublicationRequest } from '@electron/services/export/workspacePublicationRequest'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'

type WorkspaceForEvent = (event: IpcMainInvokeEvent) => WorkspaceService

export const createWorkspaceExportCommandHandlers = (
  workspaceForEvent: WorkspaceForEvent,
  exportService: ExportService,
): NativeCommandHandlers => ({
  fs_get_workspace_publication_plan: (_payload, event) =>
    workspaceForEvent(event).workspacePublicationPlan(),
  export_markdown: async (payload, event) => {
    const outputPath = validateExportOutputPath(payload)
    const capability = await consumeSavePathCapability(event.sender.id, outputPath)
    try {
      const workspace = workspaceForEvent(event)
      const sourceDocumentPath = readRequiredString(payload, 'sourceDocumentPath')
      const markdown = await workspace.readFile({ path: sourceDocumentPath })
      const resourceBasePath = path.dirname(workspace.resolveCoordinatorPath(sourceDocumentPath))
      const root = workspace.rootInfo()
      const workspaceRootPath = root.kind === 'single' ? path.dirname(root.path) : root.path
      return exportService.exportMarkdown(
        { format: readRequiredString(payload, 'format'), markdown, outputPath },
        {
          commitOutput: (data) => commitSavePathCapability(capability, data),
          ownerId: event.sender.id,
          readImage: (url) =>
            workspace.readMarkdownExportAsset(sourceDocumentPath, url, maxLocalImageBytes),
          resourceBasePath,
          releaseOutput: () => releaseSavePathCapability(capability),
          workspaceRootPath,
        },
      )
    } catch (error) {
      await releaseSavePathCapability(capability)
      throw error
    }
  },
  export_workspace_publication: async (payload, event) => {
    const request = parseWorkspacePublicationRequest(payload)
    const outputPath = validateExportOutputPath(request)
    const capability = await consumeSavePathCapability(event.sender.id, outputPath)
    try {
      const workspace = workspaceForEvent(event)
      const chapters = await Promise.all(
        request.chapters.map(async (chapter) => ({
          markdown: await workspace.readFile({ path: chapter.path }),
          path: chapter.path,
          readImage: (url: string) =>
            workspace.readMarkdownExportAsset(chapter.path, url, maxLocalImageBytes),
          title: chapter.title,
        })),
      )
      return exportService.exportWorkspacePublication(chapters, request.options, outputPath, {
        commitOutput: (data) => commitSavePathCapability(capability, data),
        ownerId: event.sender.id,
        releaseOutput: () => releaseSavePathCapability(capability),
      })
    } catch (error) {
      await releaseSavePathCapability(capability)
      throw error
    }
  },
  export_cancel: (payload, event) => exportService.cancelExport(payload, event.sender.id),
  export_open_output_path: (payload, event) =>
    exportService.openOutputPath(payload, event.sender.id),
})

const readRequiredString = (value: unknown, key: string): string => {
  if (!value || typeof value !== 'object' || !(key in value)) {
    throw new Error(`${key} must be a non-empty string`)
  }
  const result = (value as Record<string, unknown>)[key]
  if (typeof result !== 'string' || !result.trim()) {
    throw new Error(`${key} must be a non-empty string`)
  }
  return result
}
