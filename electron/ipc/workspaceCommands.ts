import type { App, BrowserWindow, IpcMain, Shell } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { NativeCommandHandlers } from './commandInvoke.js'
import { ExportService } from '../services/export/exportService.js'
import { isMarkdownPath, normalizeRelativePath } from '../services/workspace/path.js'
import { WorkspaceService } from '../services/workspace/workspaceService.js'

export type WorkspaceCommandServices = {
  commandHandlers: NativeCommandHandlers
  export: ExportService
  workspace: WorkspaceService
}

export function registerWorkspaceCommandsIpc(
  ipcMain: IpcMain,
  app: App,
  BrowserWindowClass: typeof BrowserWindow,
  shell: Shell,
): WorkspaceCommandServices {
  const workspace = new WorkspaceService(app, shell)
  const exportService = new ExportService(shell, BrowserWindowClass)
  const commandHandlers = createWorkspaceCommandHandlers(workspace, exportService)

  registerLegacyCommandHandlers(ipcMain, commandHandlers)

  workspace.onBufferStatus((status) => {
    for (const window of BrowserWindowClass.getAllWindows()) {
      window.webContents.send('fs-buffer-status', status)
    }
  })

  workspace.onSnapshotChanged((snapshot) => {
    for (const window of BrowserWindowClass.getAllWindows()) {
      window.webContents.send('fs-changed', snapshot)
    }
  })

  return { commandHandlers, export: exportService, workspace }
}

function createWorkspaceCommandHandlers(
  workspace: WorkspaceService,
  exportService: ExportService,
): NativeCommandHandlers {
  return {
    fs_get_root_info: () => workspace.rootInfo(),
    fs_get_snapshot: () => workspace.snapshot(),
    fs_list_entries: () => workspace.entries(),
    fs_set_root: (payload) => workspace.setRoot(payload),
    fs_set_single_file: (payload) => workspace.setSingleFile(payload),
    fs_open_file: (payload) => workspace.openFile(payload),
    fs_read_file: (payload) => workspace.readFile(payload),
    fs_get_workspace_index: () => workspace.workspaceIndex(),
    fs_get_workspace_graph: () => workspace.workspaceGraph(),
    fs_get_outline_graph: (payload) => workspace.outlineGraph(payload),
    fs_analyze_markdown_buffer: (payload) => workspace.analyzeMarkdownBuffer(payload),
    fs_search_workspace: (payload) => workspace.searchWorkspace(payload),
    fs_rebuild_search_index: () => workspace.rebuildSearchIndex(),
    fs_update_buffer: (payload) => workspace.updateBuffer(payload),
    fs_write_file: (payload) => workspace.writeFile(payload),
    fs_flush_buffers: () => workspace.flushBuffers(),
    fs_get_buffer_status: (payload) => workspace.getBufferStatus(payload),
    fs_get_background_tasks: () => workspace.getBackgroundTasks(),
    fs_create_file: (payload) => workspace.createFile(payload),
    fs_create_dir: (payload) => workspace.createDir(payload),
    fs_rename_path: (payload) => workspace.renamePath(payload),
    fs_move_path: (payload) => workspace.movePath(payload),
    fs_delete_path: (payload) => workspace.deletePath(payload),
    fs_get_path_metadata: (payload) => workspace.pathMetadata(payload),
    fs_open_path_in_system: (payload) => workspace.openPathInSystem(payload),
    fs_import_markdown_asset: (payload) => workspace.importMarkdownAsset(payload),
    fs_import_markdown_asset_base64: (payload) => workspace.importMarkdownAssetBase64(payload),
    fs_resolve_markdown_asset: (payload) => workspace.resolveMarkdownAsset(payload),
    list_markdown_files: (payload) => listMarkdownFiles(payload),
    read_markdown_file: (payload) => readMarkdownFile(payload),
    write_markdown_file: (payload) => writeMarkdownFile(payload),
    export_markdown: (payload) => exportService.exportMarkdown(payload),
    export_open_output_path: (payload) => exportService.openOutputPath(payload),
  }
}

function registerLegacyCommandHandlers(
  ipcMain: IpcMain,
  commandHandlers: NativeCommandHandlers,
): void {
  for (const [command, handler] of Object.entries(commandHandlers)) {
    ipcMain.handle(command, (event, payload: unknown) => handler(payload, event))
  }
}

async function listMarkdownFiles(
  value: unknown,
): Promise<Array<{ path: string; relative_path: string }>> {
  const root = pathArg(value, 'root')
  const stat = await fs.stat(root).catch(() => null)
  if (!stat?.isDirectory()) throw new Error('Project path is not a directory')

  const files: Array<{ path: string; relative_path: string }> = []
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

async function readMarkdownFile(value: unknown): Promise<string> {
  return fs.readFile(markdownPathArg(value, 'path'), 'utf8')
}

async function writeMarkdownFile(value: unknown): Promise<void> {
  const filePath = markdownPathArg(value, 'path')
  const content = stringArg(value, 'content')
  await fs.writeFile(filePath, content)
}

function markdownPathArg(value: unknown, key: string): string {
  const filePath = pathArg(value, key)
  if (!isMarkdownPath(filePath)) throw new Error('Path must be a Markdown file')
  return filePath
}

function pathArg(value: unknown, key: string): string {
  const result = stringArg(value, key)
  if (result.includes('\0')) throw new Error(`${key} contains invalid characters`)
  return path.resolve(result)
}

function stringArg(value: unknown, key: string): string {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : value
  if (typeof result !== 'string' || !result.trim()) throw new Error(`${key} must be a string`)
  return result
}
