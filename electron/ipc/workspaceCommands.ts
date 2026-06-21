import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import type { ExportService } from '@electron/services/export/exportService.js'
import { LinkPreviewService } from '@electron/services/linkPreview/service.js'
import { EmbeddedMarkdownLanguageService } from '@electron/services/markdownLanguage/service.js'
import { isMarkdownPath, normalizeRelativePath } from '@electron/services/workspace/path.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
import type { Logger } from '@electron/services/logger.js'

export type WorkspaceCommandServices = {
  commandHandlers: NativeCommandHandlers
  export: ExportService
  workspace: WindowWorkspaceRegistry
}

type WorkspaceIpcDependencies = {
  exportService: ExportService
  logger: Logger
  workspaceRegistry: WindowWorkspaceRegistry
}

type WorkspaceForEvent = (event: IpcMainInvokeEvent) => WorkspaceService

export const registerWorkspaceCommandsIpc = (
  ipcMain: IpcMain,
  { exportService, logger, workspaceRegistry }: WorkspaceIpcDependencies,
): WorkspaceCommandServices => {
  const commandHandlers = createWorkspaceCommandHandlers(
    (event) => workspaceRegistry.serviceForWebContents(event.sender),
    exportService,
  )
  registerLegacyCommandHandlers(ipcMain, commandHandlers)
  logger.info('workspace IPC registered')
  return { commandHandlers, export: exportService, workspace: workspaceRegistry }
}

const createWorkspaceCommandHandlers = (
  workspaceForEvent: WorkspaceForEvent,
  exportService: ExportService,
): NativeCommandHandlers => {
  const markdownLanguageService = new EmbeddedMarkdownLanguageService()
  const linkPreviewService = new LinkPreviewService()

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
    fs_get_outline_graph: (payload, event) => workspaceForEvent(event).outlineGraph(payload),
    fs_analyze_markdown_buffer: (payload, event) =>
      workspaceForEvent(event).analyzeMarkdownBuffer(payload),
    fs_search_workspace: (payload, event) => workspaceForEvent(event).searchWorkspace(payload),
    fs_rebuild_search_index: (_payload, event) => workspaceForEvent(event).rebuildSearchIndex(),
    fs_update_buffer: (payload, event) => workspaceForEvent(event).updateBuffer(payload),
    fs_write_file: (payload, event) => workspaceForEvent(event).writeFile(payload),
    fs_flush_buffers: (_payload, event) => workspaceForEvent(event).flushBuffers(),
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
    fs_fetch_link_preview: (payload) => linkPreviewService.fetch(payload),
    markdown_language_get_completions: (payload, event) =>
      markdownLanguageService.getCompletions(workspaceForEvent(event), payload),
    markdown_language_get_diagnostics: (payload, event) =>
      markdownLanguageService.getDiagnostics(workspaceForEvent(event), payload),
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
    list_markdown_files: (payload) => listMarkdownFiles(payload),
    read_markdown_file: (payload) => readMarkdownFile(payload),
    write_markdown_file: (payload) => writeMarkdownFile(payload),
    export_markdown: (payload) => exportService.exportMarkdown(payload),
    export_open_output_path: (payload) => exportService.openOutputPath(payload),
  }
}
const registerLegacyCommandHandlers = (
  ipcMain: IpcMain,
  commandHandlers: NativeCommandHandlers,
): void => {
  for (const [command, handler] of Object.entries(commandHandlers)) {
    ipcMain.handle(command, (event, payload: unknown) => handler(payload, event))
  }
}
const listMarkdownFiles = async (
  value: unknown,
): Promise<
  Array<{
    path: string
    relative_path: string
  }>
> => {
  const root = pathArg(value, 'root')
  const stat = await fs.stat(root).catch(() => null)
  if (!stat?.isDirectory()) throw new Error('Project path is not a directory')
  const files: Array<{
    path: string
    relative_path: string
  }> = []
  const visit = async (directory: string) => {
    for (const dirent of await fs.readdir(directory, { withFileTypes: true })) {
      if (dirent.name.startsWith('.')) continue
      const absolutePath = path.join(directory, dirent.name)
      if (dirent.isDirectory()) {
        await visit(absolutePath)
      } else if (dirent.isFile() && isMarkdownPath(dirent.name)) {
        files.push({
          path: absolutePath,
          relative_path: normalizeRelativePath(path.relative(root, absolutePath)),
        })
      }
    }
  }
  await visit(root)
  return files.sort((left, right) => left.relative_path.localeCompare(right.relative_path))
}
const readMarkdownFile = async (value: unknown): Promise<string> => {
  return fs.readFile(markdownPathArg(value, 'path'), 'utf8')
}
const writeMarkdownFile = async (value: unknown): Promise<void> => {
  const filePath = markdownPathArg(value, 'path')
  const content = stringArg(value, 'content')
  await fs.writeFile(filePath, content)
}
const markdownPathArg = (value: unknown, key: string): string => {
  const filePath = pathArg(value, key)
  if (!isMarkdownPath(filePath)) throw new Error('Path must be a Markdown file')
  return filePath
}
const pathArg = (value: unknown, key: string): string => {
  const result = stringArg(value, key)
  if (result.includes('\0')) throw new Error(`${key} contains invalid characters`)
  return path.resolve(result)
}
const stringArg = (value: unknown, key: string): string => {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : value
  if (typeof result !== 'string' || !result.trim()) throw new Error(`${key} must be a string`)
  return result
}
