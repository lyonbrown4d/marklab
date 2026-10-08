import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BrowserWindow, Shell } from 'electron'
import { ExportService } from '@electron/services/export/exportService'
import type { DesktopNotificationRequest } from '@electron/services/desktopNotificationService'
import { noopLogger } from '@electron/services/logger'
import type { ExportTaskPayload } from '@electron/types'

const electron = vi.hoisted(() => ({
  notificationInstances: [] as Array<{ click?: () => void; show: ReturnType<typeof vi.fn> }>,
  notificationSupported: vi.fn(() => false),
}))
const commitOutput = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('electron', () => ({
  Notification: class {
    static isSupported = electron.notificationSupported
    private readonly instance = { show: vi.fn() } as {
      click?: () => void
      show: ReturnType<typeof vi.fn>
    }

    constructor() {
      electron.notificationInstances.push(this.instance)
    }

    on(event: string, listener: () => void) {
      if (event === 'click') this.instance.click = listener
      return this
    }

    show() {
      ;(this.instance.show as unknown as () => void)()
    }
  },
}))

const sent: ExportTaskPayload[] = []
const sentByWindow = new Map<number, ExportTaskPayload[]>()
const nativeWindows = new Map<
  number,
  {
    focus: ReturnType<typeof vi.fn>
    isDestroyed: () => boolean
    isMinimized: () => boolean
    restore: ReturnType<typeof vi.fn>
    setProgressBar: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    webContents: { id: number; send: (channel: string, payload: ExportTaskPayload) => void }
  }
>()
let windowIds = [1]
const pdfWindows: FakeBrowserWindow[] = []

class FakeBrowserWindow {
  static getAllWindows = () =>
    windowIds.map((id) => {
      const existing = nativeWindows.get(id)
      if (existing) return existing
      const window = {
        focus: vi.fn(),
        isDestroyed: () => false,
        isMinimized: () => false,
        restore: vi.fn(),
        setProgressBar: vi.fn(),
        show: vi.fn(),
        webContents: {
          id,
          send: (_channel: string, payload: ExportTaskPayload) => {
            sent.push(payload)
            const tasks = sentByWindow.get(id) ?? []
            tasks.push(payload)
            sentByWindow.set(id, tasks)
          },
        },
      }
      nativeWindows.set(id, window)
      return window
    })
  destroyed = false
  constructor() {
    pdfWindows.push(this)
  }
  isDestroyed = () => this.destroyed
  destroy = () => {
    this.destroyed = true
  }
  loadFile = vi.fn(async () => undefined)
  webContents = {
    executeJavaScript: vi.fn(async () => undefined),
    on: vi.fn(),
    printToPDF: vi.fn(async () => Buffer.from('pdf')),
    setWindowOpenHandler: vi.fn(),
  }
}

describe('ExportService PDF lifecycle', () => {
  beforeEach(() => {
    sent.length = 0
    sentByWindow.clear()
    nativeWindows.clear()
    pdfWindows.length = 0
    windowIds = [1]
    electron.notificationInstances.length = 0
    electron.notificationSupported.mockReset()
    electron.notificationSupported.mockReturnValue(false)
    commitOutput.mockClear()
    vi.spyOn(fs.promises, 'mkdir').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'rm').mockResolvedValue(undefined)
    vi.spyOn(fs.promises, 'mkdtemp').mockResolvedValue(
      path.join(os.tmpdir(), 'marklab-export-safe'),
    )
  })

  afterEach(() => vi.restoreAllMocks())

  it('renders PDF HTML inside a private system temporary directory', async () => {
    const service = new ExportService(
      { openPath: vi.fn() } as unknown as Shell,
      FakeBrowserWindow as unknown as typeof BrowserWindow,
    )

    service.exportMarkdown(
      { markdown: '# Safe', format: 'pdf', outputPath: 'D:/exports/safe.pdf' },
      { commitOutput, resourceBasePath: 'D:/notes' },
    )

    await vi.waitFor(() => expect(sent.some((task) => task.status === 'finished')).toBe(true))
    expect(fs.promises.mkdtemp).toHaveBeenCalledWith(
      path.join(os.tmpdir(), `${path.sep}marklab-export-`),
    )
    expect(fs.promises.rm).toHaveBeenCalledWith(path.join(os.tmpdir(), 'marklab-export-safe'), {
      force: true,
      recursive: true,
    })
    expect(commitOutput).toHaveBeenCalledWith(Buffer.from('pdf'))
    expect(pdfWindows[0]?.webContents.setWindowOpenHandler).toHaveBeenCalledOnce()
    expect(pdfWindows[0]?.webContents.on).toHaveBeenCalledWith(
      'will-navigate',
      expect.any(Function),
    )
  })

  it('reports cancellation for an active task', () => {
    const service = new ExportService(
      { openPath: vi.fn() } as unknown as Shell,
      FakeBrowserWindow as unknown as typeof BrowserWindow,
    )
    const taskId = service.exportMarkdown(
      {
        markdown: '# Cancel',
        format: 'pdf',
        outputPath: 'D:/exports/cancel.pdf',
      },
      { commitOutput },
    )

    expect(service.cancelExport({ taskId })).toBe(true)
    expect(sent.at(-1)).toMatchObject({ id: taskId, status: 'cancelled' })
    expect(service.cancelExport({ taskId })).toBe(false)
  })

  it('rejects an output extension that does not match the export format', () => {
    const service = new ExportService(
      { openPath: vi.fn() } as unknown as Shell,
      FakeBrowserWindow as unknown as typeof BrowserWindow,
    )

    expect(() =>
      service.exportMarkdown({
        markdown: '# Wrong extension',
        format: 'pdf',
        outputPath: 'D:/exports/wrong.docx',
      }),
    ).toThrow('extension')
  })

  it('does not delete a previously existing output when a queued task is cancelled', async () => {
    const service = new ExportService(
      { openPath: vi.fn() } as unknown as Shell,
      FakeBrowserWindow as unknown as typeof BrowserWindow,
    )
    const outputPath = 'D:/exports/existing.pdf'
    const taskId = service.exportMarkdown(
      {
        markdown: '# Cancel safely',
        format: 'pdf',
        outputPath,
      },
      { commitOutput },
    )

    expect(service.cancelExport({ taskId })).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(fs.promises.unlink).not.toHaveBeenCalledWith(path.resolve(outputPath))
  })

  it('keeps task events and cancellation scoped to the owning window', () => {
    windowIds = [7, 8]
    const service = new ExportService(
      { openPath: vi.fn() } as unknown as Shell,
      FakeBrowserWindow as unknown as typeof BrowserWindow,
    )
    const taskId = service.exportMarkdown(
      { markdown: '# Private', format: 'pdf', outputPath: 'D:/exports/private.pdf' },
      { commitOutput, ownerId: 7 },
    )

    expect(sentByWindow.get(7)?.at(0)).toMatchObject({ id: taskId, status: 'started' })
    expect(sentByWindow.get(8)).toBeUndefined()
    expect(service.cancelExport({ taskId }, 8)).toBe(false)
    expect(service.cancelExport({ taskId }, 7)).toBe(true)
  })

  it('reports coherent rendering and writing progress for HTML exports', async () => {
    const service = new ExportService(
      { openPath: vi.fn() } as unknown as Shell,
      FakeBrowserWindow as unknown as typeof BrowserWindow,
    )

    service.exportMarkdown(
      { markdown: '# Progress', format: 'html', outputPath: 'D:/exports/progress.html' },
      { commitOutput },
    )

    await vi.waitFor(() => expect(sent.some((task) => task.status === 'finished')).toBe(true))
    const started = sent.filter((task) => task.status === 'started')
    const progress = started.map((task) => task.progress)

    expect(progress).toEqual([0.05, 0.15, 0.45, 0.9])
    expect(started.map((task) => task.message)).toEqual([
      'Export queued',
      'Preparing export',
      'Rendering HTML document',
      'Saving exported file',
    ])
  })

  it('lets the notification service focus the owner and only reveals the output on click', async () => {
    windowIds = [7]
    let click: (() => void) | undefined
    const desktopNotifications = {
      show: vi.fn((request: DesktopNotificationRequest) => {
        click = request.onClick
        return true
      }),
    }
    const shell = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    }
    const service = new ExportService(
      shell as unknown as Shell,
      FakeBrowserWindow as unknown as typeof BrowserWindow,
      noopLogger,
      desktopNotifications,
    )

    service.exportMarkdown(
      { markdown: '# Done', format: 'html', outputPath: 'D:/exports/done.html' },
      { commitOutput, ownerId: 7 },
    )

    await vi.waitFor(() => expect(sent.some((task) => task.status === 'finished')).toBe(true))
    click?.()

    expect(desktopNotifications.show).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'export', ownerWebContentsId: 7 }),
    )
    expect(nativeWindows.get(7)?.show).not.toHaveBeenCalled()
    expect(nativeWindows.get(7)?.focus).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).toHaveBeenCalledWith(path.resolve('D:/exports/done.html'))
  })
})
