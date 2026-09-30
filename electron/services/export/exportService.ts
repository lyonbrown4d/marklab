import fs from 'node:fs'
import path from 'node:path'
import type { BrowserWindow, Shell } from 'electron'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import type { ExportTaskPayload } from '@electron/types.js'
import { validateExistingLocalPath } from '@electron/services/pathValidation.js'
import { renderDocx } from '@electron/services/export/docx.js'
import { ExportQueue } from '@electron/services/export/exportQueue.js'
import { renderHtmlWithLocalImages } from '@electron/services/export/html.js'
import { applyWindowExportProgress } from '@electron/services/nativeExportProgress.js'
import {
  notifyExportFailed,
  notifyExportFinished,
} from '@electron/services/export/exportNotifications.js'
import { renderPdfDocument } from '@electron/services/export/pdf.js'
import {
  createExportTaskId,
  parseExportFormat,
  stringArg,
  validateExportOutputExtension,
  validateExportOutputPath,
  type ExportFormat,
} from '@electron/services/export/exportRequest.js'
type ActiveExport = {
  controller: AbortController
  format: ExportFormat
  outputPath: string
  cancellationReported: boolean
  committing: boolean
  ownerId?: number
}
type ExportResourceContext = {
  commitOutput?: (data: string | NodeJS.ArrayBufferView) => Promise<void>
  ownerId?: number
  readImage?: (url: string) => Promise<Buffer | null>
  releaseOutput?: () => Promise<void>
  resourceBasePath?: string
  workspaceRootPath?: string
}
export class ExportService {
  private readonly allowedOutputPaths = new Map<string, number | undefined>()
  private readonly queue = new ExportQueue(1)
  private readonly activeTasks = new Map<string, ActiveExport>()

  constructor(
    private readonly shell: Shell,
    private readonly BrowserWindowClass: typeof BrowserWindow,
    private readonly logger: Logger = noopLogger,
  ) {}
  exportMarkdown(value: unknown, context: ExportResourceContext | string = {}): string {
    const resources = typeof context === 'string' ? { resourceBasePath: context } : context
    const markdown = stringArg(value, 'markdown')
    const format = parseExportFormat(value)
    const outputPath = validateExportOutputPath(value)
    validateExportOutputExtension(outputPath, format)
    const taskId = createExportTaskId(format)
    const task: ActiveExport = {
      controller: new AbortController(),
      format,
      outputPath,
      cancellationReported: false,
      committing: false,
      ownerId: resources.ownerId,
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
        progress: 0,
        message: 'Export queued',
      },
      task.ownerId,
    )
    void this.queue
      .enqueue(() => this.runExport(taskId, markdown, task, resources))
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
    markdown: string,
    task: ActiveExport,
    resources: ExportResourceContext,
  ): Promise<void> {
    const { format, outputPath } = task
    try {
      task.controller.signal.throwIfAborted()
      await this.writeExport(taskId, markdown, format, outputPath, task, resources)
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
      notifyExportFinished(format, outputPath)
    } catch (error) {
      if (task.controller.signal.aborted) {
        if (!task.cancellationReported) this.cancelExport(taskId, task.ownerId)
        return
      }
      const message = errorMessage(error)
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
      notifyExportFailed(format, outputPath, message)
    } finally {
      this.activeTasks.delete(taskId)
      await resources.releaseOutput?.()
    }
  }
  private async writeExport(
    taskId: string,
    markdown: string,
    format: ExportFormat,
    outputPath: string,
    task: ActiveExport,
    resources: ExportResourceContext,
  ): Promise<void> {
    const { resourceBasePath, workspaceRootPath } = resources
    const signal = task.controller.signal
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    this.emitExportProgress(taskId, format, outputPath, 0.15, 'Preparing export')
    if (format === 'html') {
      const html = await renderHtmlWithLocalImages(markdown, {
        readImage: resources.readImage,
        resourceBasePath,
        resolveRelativeResources: true,
        workspaceRootPath,
      })
      await this.commitOutput(resources, task, html)
      return
    }
    if (format === 'pdf') {
      const pdf = await renderPdfDocument({
        BrowserWindowClass: this.BrowserWindowClass,
        markdown,
        onProgress: (progress, message) =>
          this.emitExportProgress(taskId, format, outputPath, progress, message),
        resourceBasePath,
        readImage: resources.readImage,
        signal,
        workspaceRootPath,
      })
      await this.commitOutput(resources, task, pdf)
      return
    }
    if (format === 'docx') {
      const document = await renderDocx(markdown, {
        readImage: resources.readImage,
      })
      await this.commitOutput(resources, task, document)
      return
    }
    throw new Error(`Unsupported export format: ${format}`)
  }
  private async commitOutput(
    resources: ExportResourceContext,
    task: ActiveExport,
    data: string | NodeJS.ArrayBufferView,
  ): Promise<void> {
    if (!resources.commitOutput) throw new Error('Export output was not authorized')
    beginExportCommit(task)
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
    this.emitExportTask(
      {
        id: taskId,
        format,
        output_path: outputPath,
        status: 'started',
        progress,
        message,
      },
      this.activeTasks.get(taskId)?.ownerId,
    )
  }
}
const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}

const beginExportCommit = (task: ActiveExport): void => {
  task.controller.signal.throwIfAborted()
  task.committing = true
}
