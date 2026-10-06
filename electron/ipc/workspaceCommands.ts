import path from 'node:path'
import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import type { ExportService } from '@electron/services/export/exportService.js'
import type { Logger } from '@electron/services/logger.js'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types.js'
import { EmbeddedMarkdownLanguageService } from '@electron/services/markdownLanguage/service.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import {
  commitSavePathCapability,
  consumeSavePathCapability,
  releaseSavePathCapability,
} from '@electron/ipc/savePathCapabilities.js'
import { validateExportOutputPath } from '@electron/services/export/exportRequest.js'
import { maxLocalImageBytes } from '@electron/services/export/docxImages.js'

export type WorkspaceCommandServices = {
  commandHandlers: NativeCommandHandlers
  export: ExportService
  workspace: WindowWorkspaceRegistry
}

type WorkspaceIpcDependencies = {
  exportService: ExportService
  localHistoryService: LocalHistoryServiceContract
  logger: Logger
  workspaceRegistry: WindowWorkspaceRegistry
}

type WorkspaceForEvent = (event: IpcMainInvokeEvent) => WorkspaceService

export const registerWorkspaceCommandsIpc = (
  ipcMain: IpcMain,
  { exportService, localHistoryService, logger, workspaceRegistry }: WorkspaceIpcDependencies,
): WorkspaceCommandServices => {
  const commandHandlers = createWorkspaceCommandHandlers(
    (event) => workspaceRegistry.serviceForWebContents(event.sender),
    exportService,
    localHistoryService,
  )
  registerLegacyCommandHandlers(ipcMain, commandHandlers)
  logger.info('workspace IPC registered')
  return { commandHandlers, export: exportService, workspace: workspaceRegistry }
}

const createWorkspaceCommandHandlers = (
  workspaceForEvent: WorkspaceForEvent,
  exportService: ExportService,
  localHistory: LocalHistoryServiceContract,
): NativeCommandHandlers => {
  const markdownLanguageService = new EmbeddedMarkdownLanguageService()

  return {
    fs_get_root_info: (_payload, event) => workspaceForEvent(event).rootInfo(),
    fs_get_snapshot: (_payload, event) => workspaceForEvent(event).snapshot(),
    fs_list_entries: (_payload, event) => workspaceForEvent(event).entries(),
    fs_set_root: (payload, event) => workspaceForEvent(event).setRoot(payload),
    fs_set_single_file: (payload, event) => workspaceForEvent(event).setSingleFile(payload),
    fs_open_file: (payload, event) => workspaceForEvent(event).openFile(payload),
    fs_read_file: (payload, event) => workspaceForEvent(event).readFile(payload),
    fs_get_workspace_index: (_payload, event) => workspaceForEvent(event).workspaceIndex(),
    fs_get_workspace_graph: (_payload, event) => workspaceForEvent(event).workspaceGraph(),
    fs_search_workspace: (payload, event) => workspaceForEvent(event).searchWorkspace(payload),
    fs_rebuild_search_index: (_payload, event) => workspaceForEvent(event).rebuildSearchIndex(),
    fs_update_buffer: (payload, event) => workspaceForEvent(event).updateBuffer(payload),
    fs_write_file: (payload, event) => workspaceForEvent(event).writeFile(payload),
    fs_flush_buffers: (_payload, event) => workspaceForEvent(event).flushBuffers(),
    local_history_list: (payload, event) => {
      const workspace = workspaceForEvent(event)
      return localHistory.list(workspace.rootInfo(), readRequiredString(payload, 'path'))
    },
    local_history_read: (payload, event) => {
      const workspace = workspaceForEvent(event)
      return localHistory.read(
        workspace.rootInfo(),
        readRequiredString(payload, 'path'),
        readRequiredString(payload, 'entryId'),
      )
    },
    local_history_restore: (payload, event) => {
      const workspace = workspaceForEvent(event)
      const filePath = readRequiredString(payload, 'path')
      return localHistory.restore(
        workspace.rootInfo(),
        filePath,
        readRequiredString(payload, 'entryId'),
        async (content) => {
          workspace.writeFile({ path: filePath, content })
          await workspace.flushBuffers()
        },
      )
    },
    local_history_delete: (payload, event) => {
      const workspace = workspaceForEvent(event)
      return localHistory.delete(
        workspace.rootInfo(),
        readRequiredString(payload, 'path'),
        readRequiredString(payload, 'entryId'),
      )
    },
    local_history_clear: (payload, event) => {
      const workspace = workspaceForEvent(event)
      return localHistory.clear(workspace.rootInfo(), readRequiredString(payload, 'path'))
    },
    fs_get_buffer_status: (payload, event) => workspaceForEvent(event).getBufferStatus(payload),
    fs_get_background_tasks: (_payload, event) => workspaceForEvent(event).getBackgroundTasks(),
    fs_create_file: (payload, event) => workspaceForEvent(event).createFile(payload),
    fs_create_dir: (payload, event) => workspaceForEvent(event).createDir(payload),
    fs_rename_path: (payload, event) => workspaceForEvent(event).renamePath(payload),
    fs_move_path: (payload, event) => workspaceForEvent(event).movePath(payload),
    fs_delete_path: (payload, event) => workspaceForEvent(event).deletePath(payload),
    fs_get_path_metadata: (payload, event) => workspaceForEvent(event).pathMetadata(payload),
    fs_open_path_in_system: (payload, event) => workspaceForEvent(event).openPathInSystem(payload),
    fs_import_markdown_asset: (payload, event) =>
      workspaceForEvent(event).importMarkdownAsset(payload),
    fs_import_markdown_asset_base64: (payload, event) =>
      workspaceForEvent(event).importMarkdownAssetBase64(payload),
    fs_resolve_markdown_asset: (payload, event) =>
      workspaceForEvent(event).resolveMarkdownAsset(payload),
    markdown_language_get_document_symbols: (payload, event) =>
      markdownLanguageService.getDocumentSymbols(workspaceForEvent(event), payload),
    markdown_language_get_definition: (payload, event) =>
      markdownLanguageService.getDefinition(workspaceForEvent(event), payload),
    markdown_language_get_references: (payload, event) =>
      markdownLanguageService.getReferences(workspaceForEvent(event), payload),
    markdown_language_rename_references: (payload, event) =>
      markdownLanguageService.renameReferences(workspaceForEvent(event), payload),
    markdown_language_get_code_actions: (payload, event) =>
      markdownLanguageService.getCodeActions(workspaceForEvent(event), payload),
    markdown_language_get_hover: (payload, event) =>
      markdownLanguageService.getHover(workspaceForEvent(event), payload),
    export_markdown: async (payload, event) => {
      const capability = await consumeSavePathCapability(
        event.sender.id,
        validateExportOutputPath(payload),
      )
      const workspace = workspaceForEvent(event)
      const sourceDocumentPath = readOptionalString(payload, 'sourceDocumentPath')
      const resourceBasePath = sourceDocumentPath
        ? path.dirname(workspace.resolveCoordinatorPath(sourceDocumentPath))
        : undefined
      const root = workspace.rootInfo()
      const workspaceRootPath = root.kind === 'single' ? path.dirname(root.path) : root.path
      try {
        return exportService.exportMarkdown(payload, {
          commitOutput: (data) => commitSavePathCapability(capability, data),
          ownerId: event.sender.id,
          readImage: sourceDocumentPath
            ? (url) =>
                workspace.readMarkdownExportAsset(sourceDocumentPath, url, maxLocalImageBytes)
            : undefined,
          resourceBasePath,
          releaseOutput: () => releaseSavePathCapability(capability),
          workspaceRootPath,
        })
      } catch (error) {
        await releaseSavePathCapability(capability)
        throw error
      }
    },
    export_cancel: (payload, event) => exportService.cancelExport(payload, event.sender.id),
    export_open_output_path: (payload, event) =>
      exportService.openOutputPath(payload, event.sender.id),
  }
}

const readOptionalString = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object' || !(key in value)) return undefined
  const result = (value as Record<string, unknown>)[key]
  if (result === undefined) return undefined
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

const readRequiredString = (value: unknown, key: string): string => {
  const result = readOptionalString(value, key)
  if (result === undefined || !result.trim()) throw new Error(`${key} must be a non-empty string`)
  return result
}

const registerLegacyCommandHandlers = (
  ipcMain: IpcMain,
  commandHandlers: NativeCommandHandlers,
): void => {
  for (const [command, handler] of Object.entries(commandHandlers)) {
    ipcMain.handle(command, (event, payload: unknown) => handler(payload, event))
  }
}
