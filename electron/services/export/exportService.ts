import fs from 'node:fs'
import path from 'node:path'
import type { BrowserWindow, Shell } from 'electron'
import { noopLogger, type Logger } from '@electron/services/logger'
import type { DesktopNotificationServiceContract } from '@electron/services/desktopNotificationService'
import type { ExportTaskPayload } from '@electron/types'
import { validateExistingLocalPath } from '@electron/services/pathValidation'
import { ExportQueue } from '@electron/services/export/exportQueue'
import { applyWindowExportProgress } from '@electron/services/nativeExportProgress'
import {
  notifyExportFailed,
  notifyExportFinished,
} from '@electron/services/export/exportNotifications'
import {
  renderMarkdownExport,
  renderWorkspacePublicationExport,
} from '@electron/services/export/exportWriters'
import type { WorkspacePublicationSource } from '@electron/services/export/workspacePublicationHtml'
import type { ActiveExport } from '@electron/services/export/exportTaskTypes'
import {
  createExportTaskId,
  parseExportFormat,
  stringArg,
  validateExportOutputExtension,
  validateExportOutputPath,
  type ExportFormat,
  type ExportResourceContext,
} from '@electron/services/export/exportRequest'
import type { WorkspacePublicationOptions } from '@/types/workspacePublication'
export class ExportService {
  private readonly allowedOutputPaths = new Map<string, number | undefined>()
  private readonly queue = new ExportQueue(1)
  private readonly activeTasks = new Map<string, ActiveExport>()

  constructor(
    private readonly shell: Shell,
    private readonly BrowserWindowClass: typeof BrowserWindow,
    private readonly logger: Logger = noopLogger,
    private readonly desktopNotifications?: DesktopNotificationServiceContract,
  ) {}
  exportMarkdown(value: unknown, context: ExportResourceContext | string = {}): string {
    const resources = typeof context === 'string' ? { resourceBasePath: context } : context
    const markdown = stringArg(value, 'markdown')
    const format = parseExportFormat(value)
    const outputPath = validateExportOutputPath(value)
    validateExportOutputExtension(outputPath, format)
    return this.queueExport(format, outputPath, resources, (taskId, task) =>
      this.writeExport(taskId, markdown, task, resources),
    )
  }
  exportWorkspacePublication(
    chapters: WorkspacePublicationSource[],
    options: WorkspacePublicationOptions,
    outputPath: string,
    resources: ExportResourceContext,
  ): string {
    validateExportOutputExtension(outputPath, options.format)
    return this.queueExport(options.format, outputPath, resources, (taskId, task) =>
      this.writePublicationExport(taskId, chapters, options, task, resources),
    )
  }
  private queueExport(
    format: ExportFormat,
    outputPath: string,
    resources: ExportResourceContext,
    write: (taskId: string, task: ActiveExport) => Promise<void>,
  ): string {
    const taskId = createExportTaskId(format)
    const task: ActiveExport = {
      controller: new AbortController(),
      format,
      outputPath,
      cancellationReported: false,
      committing: false,
      ownerId: resources.ownerId,
      progress: 0.05,
    }
    this.activeTasks.set(taskId, task)
    this.logger.info('export task queued', {
      format,
      outputFile: path.basename(outputPath),
      taskId,
    })
    this.emitExportTask(
      {
        id: taskId,
        format,
        output_path: outputPath,
        status: 'started',
        progress: 0.05,
        message: 'Export queued',
      },
      task.ownerId,
    )
    void this.queue
      .enqueue(() => this.runExport(taskId, task, resources, () => write(taskId, task)))
      .catch((error) => {
        this.logger.error('queued export task failed unexpectedly', { error, taskId })
      })
    return taskId
  }
  cancelExport(value: unknown, ownerId?: number): boolean {
    const taskId = stringArg(value, 'taskId')
    const task = this.activeTasks.get(taskId)
    if (
      !task ||
      task.controller.signal.aborted ||
      task.committing ||
      (ownerId !== undefined && task.ownerId !== ownerId)
    )
      return false
    task.controller.abort(new Error('Export cancelled'))
    task.cancellationReported = true
    this.emitExportTask(
      {
        id: taskId,
        format: task.format,
        output_path: task.outputPath,
        status: 'cancelled',
        progress: null,
        message: 'Export cancelled',
      },
      task.ownerId,
    )
    return true
  }
  async openOutputPath(value: unknown, ownerId?: number): Promise<void> {
    const requestedPath = stringArg(value, 'path')
    const validated = validateExistingLocalPath(requestedPath)
    if (!validated.ok) throw new Error(validated.error)
    if (
      !this.allowedOutputPaths.has(validated.path) ||
      (ownerId !== undefined && this.allowedOutputPaths.get(validated.path) !== ownerId)
    ) {
      throw new Error('Path was not selected by the export dialog.')
    }
    const error = await this.shell.openPath(validated.path)
    if (error) {
      this.logger.warn('open export output failed', {
        error,
        outputFile: path.basename(validated.path),
      })
    }
    if (error) throw new Error(`Failed to open exported path: ${error}`)
    this.logger.info('export output opened', { outputFile: path.basename(validated.path) })
  }
  private async runExport(
    taskId: string,
    task: ActiveExport,
    resources: ExportResourceContext,
    write: () => Promise<void>,
  ): Promise<void> {
    const { format, outputPath } = task
    try {
      task.controller.signal.throwIfAborted()
      await write()
      task.controller.signal.throwIfAborted()
      this.allowedOutputPaths.set(outputPath, task.ownerId)
      this.logger.info('export task finished', {
        format,
        outputFile: path.basename(outputPath),
        taskId,
      })
      this.emitExportTask(
        {
          id: taskId,
          format,
          output_path: outputPath,
          status: 'finished',
          progress: 1,
          message: 'Export finished',
        },
        task.ownerId,
      )
      notifyExportFinished(
        `export:${taskId}`,
        format,
        outputPath,
        task.ownerId,
        () => this.shell.showItemInFolder(outputPath),
        this.desktopNotifications,
      )
    } catch (error) {
      if (task.controller.signal.aborted) {
        if (!task.cancellationReported) this.cancelExport(taskId, task.ownerId)
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      this.logger.error('export task failed', {
        error,
        format,
        outputFile: path.basename(outputPath),
        taskId,
      })
      this.emitExportTask(
        {
          id: taskId,
          format,
          output_path: outputPath,
          status: 'failed',
          progress: null,
          message,
        },
        task.ownerId,
      )
      notifyExportFailed(
        `export:${taskId}`,
        format,
        outputPath,
        message,
        task.ownerId,
        this.desktopNotifications,
      )
    } finally {
      this.activeTasks.delete(taskId)
      await resources.releaseOutput?.()
    }
  }
  private async writeExport(
    taskId: string,
    markdown: string,
    task: ActiveExport,
    resources: ExportResourceContext,
  ): Promise<void> {
    const { format, outputPath } = task
    const signal = task.controller.signal
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    this.emitExportProgress(taskId, format, outputPath, 0.15, 'Preparing export')
    const data = await renderMarkdownExport(
      this.BrowserWindowClass,
      format,
      markdown,
      resources,
      signal,
      (progress, message) => this.emitExportProgress(taskId, format, outputPath, progress, message),
    )
    this.emitExportProgress(taskId, format, outputPath, 0.9, 'Saving exported file')
    await this.commitOutput(resources, task, data)
  }
  private async writePublicationExport(
    taskId: string,
    chapters: WorkspacePublicationSource[],
    options: WorkspacePublicationOptions,
    task: ActiveExport,
    resources: ExportResourceContext,
  ): Promise<void> {
    const { format, outputPath } = task
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    this.emitExportProgress(taskId, format, outputPath, 0.15, 'Preparing publication')
    const data = await renderWorkspacePublicationExport(
      this.BrowserWindowClass,
      chapters,
      options,
      task.controller.signal,
      (progress, message) => this.emitExportProgress(taskId, format, outputPath, progress, message),
    )
    this.emitExportProgress(taskId, format, outputPath, 0.9, 'Saving exported file')
    await this.commitOutput(resources, task, data)
  }
  private async commitOutput(
    resources: ExportResourceContext,
    task: ActiveExport,
    data: string | NodeJS.ArrayBufferView,
  ): Promise<void> {
    if (!resources.commitOutput) throw new Error('Export output was not authorized')
    task.controller.signal.throwIfAborted()
    task.committing = true
    await resources.commitOutput(data)
  }
  private emitExportTask(payload: ExportTaskPayload, ownerId?: number): void {
    for (const window of this.BrowserWindowClass.getAllWindows()) {
      if (!window.isDestroyed() && (ownerId === undefined || window.webContents.id === ownerId)) {
        applyWindowExportProgress(window, payload)
        window.webContents.send('export-task', payload)
      }
    }
  }
  private emitExportProgress(
    taskId: string,
    format: ExportFormat,
    outputPath: string,
    progress: number,
    message: string,
  ): void {
    const task = this.activeTasks.get(taskId)
    if (!task) return
    const normalizedProgress = Math.min(Math.max(progress, 0), 1)
    task.progress = Math.max(task.progress, normalizedProgress)
    this.emitExportTask(
      {
        id: taskId,
        format,
        output_path: outputPath,
        status: 'started',
        progress: task.progress,
        message,
      },
      task.ownerId,
    )
  }
}
