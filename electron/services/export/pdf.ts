import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BrowserWindow } from 'electron'
import { renderHtmlWithLocalImages } from '@electron/services/export/html'
import { installWindowNavigationGuard } from '@electron/windowNavigation'

type RenderPdfOptions = {
  BrowserWindowClass: typeof BrowserWindow
  markdown: string
  onProgress: (progress: number, message: string) => void
  readImage?: (url: string) => Promise<Buffer | null>
  resourceBasePath?: string
  signal: AbortSignal
  workspaceRootPath?: string
}

export const renderPdfDocument = async ({
  BrowserWindowClass,
  markdown,
  onProgress,
  readImage,
  resourceBasePath,
  signal,
  workspaceRootPath,
}: RenderPdfOptions): Promise<Buffer> => {
  const window = new BrowserWindowClass({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'marklab-export-'))
  const tempHtmlPath = path.join(tempDirectory, 'document.html')
  installWindowNavigationGuard(window, [pathToFileURL(tempHtmlPath).toString()])
  const destroyWindow = () => {
    if (!window.isDestroyed()) window.destroy()
  }
  signal.addEventListener('abort', destroyWindow, { once: true })
  try {
    const html = await renderHtmlWithLocalImages(markdown, {
      readImage,
      resourceBasePath,
      resolveRelativeResources: true,
      workspaceRootPath,
    })
    await fs.promises.writeFile(tempHtmlPath, html, { signal })
    onProgress(0.35, 'Rendering PDF document')
    await window.loadFile(tempHtmlPath)
    await window.webContents
      .executeJavaScript(
        'Promise.all([document.fonts ? document.fonts.ready : undefined, Promise.all(Array.from(document.images).map((image) => image.complete ? undefined : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; })))])',
        false,
      )
      .catch(() => undefined)
    onProgress(0.7, 'Writing PDF')
    const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: 'A4' })
    signal.throwIfAborted()
    return pdf
  } finally {
    signal.removeEventListener('abort', destroyWindow)
    await fs.promises.rm(tempDirectory, { force: true, recursive: true }).catch(() => undefined)
    destroyWindow()
  }
}
