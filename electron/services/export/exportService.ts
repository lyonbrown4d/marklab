import fs from 'node:fs'
import path from 'node:path'
import { Notification, type BrowserWindow, type Shell } from 'electron'
import type { ExportTaskPayload } from '../../types.js'
import { validateExistingLocalPath } from '../pathValidation.js'
import { renderDocx } from './docx.js'
import { renderHtml } from './html.js'
type ExportFormat = 'html' | 'pdf' | 'docx'
const schemePattern = /^[a-z][a-z\d+.-]*:/i
let exportTaskCounter = 0
export class ExportService {
  private readonly allowedOutputPaths = new Set<string>()
  constructor(
    private readonly shell: Shell,
    private readonly BrowserWindowClass: typeof BrowserWindow,
  ) {}
  exportMarkdown(value: unknown): string {
    const markdown = stringArg(value, 'markdown')
    const format = parseExportFormat(value)
    const outputPath = validateExportOutputPath(value)
    const taskId = createExportTaskId(format)
    this.emitExportTask({
      id: taskId,
      format,
      output_path: outputPath,
      status: 'started',
      progress: 0,
      message: 'Export queued',
    })
    void this.runExport(taskId, markdown, format, outputPath)
    return taskId
  }
  async openOutputPath(value: unknown): Promise<void> {
    const requestedPath = stringArg(value, 'path')
    const validated = validateExistingLocalPath(requestedPath)
    if (!validated.ok) throw new Error(validated.error)
    if (!this.allowedOutputPaths.has(validated.path)) {
      throw new Error('Path was not selected by the export dialog.')
    }
    const error = await this.shell.openPath(validated.path)
    if (error) throw new Error(`Failed to open exported path: ${error}`)
  }
  private async runExport(
    taskId: string,
    markdown: string,
    format: ExportFormat,
    outputPath: string,
  ): Promise<void> {
    try {
      await this.writeExport(taskId, markdown, format, outputPath)
      this.allowedOutputPaths.add(outputPath)
      this.emitExportTask({
        id: taskId,
        format,
        output_path: outputPath,
        status: 'finished',
        progress: 1,
        message: 'Export finished',
      })
      this.notifyExportFinished(format, outputPath)
    } catch (error) {
      const message = errorMessage(error)
      this.emitExportTask({
        id: taskId,
        format,
        output_path: outputPath,
        status: 'failed',
        progress: null,
        message,
      })
      this.notifyExportFailed(format, outputPath, message)
    }
  }
  private async writeExport(
    taskId: string,
    markdown: string,
    format: ExportFormat,
    outputPath: string,
  ): Promise<void> {
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
    this.emitExportProgress(taskId, format, outputPath, 0.15, 'Preparing export')
    if (format === 'html') {
      await fs.promises.writeFile(outputPath, renderHtml(markdown))
      return
    }
    if (format === 'pdf') {
      await this.writePdf(taskId, markdown, format, outputPath)
      return
    }
    if (format === 'docx') {
      await fs.promises.writeFile(outputPath, renderDocx(markdown))
      return
    }
    throw new Error(`Unsupported export format: ${format}`)
  }
  private async writePdf(
    taskId: string,
    markdown: string,
    format: ExportFormat,
    outputPath: string,
  ): Promise<void> {
    const window = new this.BrowserWindowClass({
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    const tempHtmlPath = path.join(
      path.dirname(outputPath),
      `.marklab-export-${Date.now()}-${exportTaskCounter}.html`,
    )
    try {
      const html = renderHtml(markdown, {
        resourceBasePath: path.dirname(outputPath),
        resolveRelativeResources: true,
      })
      await fs.promises.writeFile(tempHtmlPath, html)
      this.emitExportProgress(taskId, format, outputPath, 0.35, 'Rendering PDF document')
      await window.loadFile(tempHtmlPath)
      await window.webContents
        .executeJavaScript(
          'Promise.all([document.fonts ? document.fonts.ready : undefined, Promise.all(Array.from(document.images).map((image) => image.complete ? undefined : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })))])',
          false,
        )
        .catch(() => undefined)
      this.emitExportProgress(taskId, format, outputPath, 0.7, 'Writing PDF')
      const pdf = await window.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
      })
      await fs.promises.writeFile(outputPath, pdf)
    } finally {
      await fs.promises.unlink(tempHtmlPath).catch(() => undefined)
      if (!window.isDestroyed()) window.destroy()
    }
  }
  private emitExportTask(payload: ExportTaskPayload): void {
    for (const window of this.BrowserWindowClass.getAllWindows()) {
      if (!window.isDestroyed()) {
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
    this.emitExportTask({
      id: taskId,
      format,
      output_path: outputPath,
      status: 'started',
      progress,
      message,
    })
  }
  private notifyExportFinished(format: ExportFormat, outputPath: string): void {
    this.showNotification(
      'Export finished',
      `${format.toUpperCase()} saved to ${path.basename(outputPath)}`,
    )
  }
  private notifyExportFailed(format: ExportFormat, outputPath: string, message: string): void {
    this.showNotification(
      'Export failed',
      `${format.toUpperCase()} ${path.basename(outputPath)}: ${message}`,
    )
  }
  private showNotification(title: string, body: string): void {
    if (!Notification.isSupported()) return
    new Notification({ title, body }).show()
  }
}
const parseExportFormat = (value: unknown): ExportFormat => {
  const format = stringArg(value, 'format').toLowerCase()
  if (format === 'html' || format === 'pdf' || format === 'docx') return format
  if (format === 'word') return 'docx'
  throw new Error(`Unsupported export format: ${format}`)
}
const validateExportOutputPath = (value: unknown): string => {
  const outputPath = stringArg(value, 'outputPath').trim()
  if (!outputPath) throw new Error('outputPath is required')
  if (outputPath.includes('\0')) throw new Error('outputPath contains invalid characters')
  if (schemePattern.test(outputPath) && !path.win32.isAbsolute(outputPath)) {
    throw new Error('Only local filesystem output paths are allowed')
  }
  if (!path.isAbsolute(outputPath)) throw new Error('outputPath must be absolute')
  return path.resolve(outputPath)
}
const stringArg = (value: unknown, key: string): string => {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : value
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}
const createExportTaskId = (format: ExportFormat): string => {
  exportTaskCounter += 1
  return `export-${format}-${Date.now()}-${exportTaskCounter}`
}
const errorMessage = (error: unknown): string => {
  return error instanceof Error ? error.message : String(error)
}
