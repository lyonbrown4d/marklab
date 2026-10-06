import type { BrowserWindow, NativeImage, Rectangle, WebContentsView } from 'electron'
import pLimit from 'p-limit'

import { assertPublicLinkPreviewUrl } from '@electron/services/linkPreview/networkSecurity'
import type {
  CapturedWebPreview,
  WebPreviewCaptureServiceContract,
} from '@electron/services/linkPreview/service'
import type { WebPreviewCacheContract } from '@electron/services/linkPreview/webPreviewDiskCache'
import { installWebPreviewSessionSecurity } from '@electron/services/linkPreview/webPreviewSecurity'
import type { LinkPreviewLookup } from '@electron/services/linkPreview/networkSecurity'
import { runLinkPreviewStage } from '@electron/services/linkPreview/diagnostics'
import { installWebPreviewProtocol } from '@electron/services/linkPreview/webPreviewProtocol'
import { normalizeWebTabUrl } from '@electron/services/webTabs/webTabUrl'

const CAPTURE_HEIGHT = 1080
const CAPTURE_WIDTH = 1920
const OUTPUT_HEIGHT = 1080
const OUTPUT_WIDTH = 1920
const DEFAULT_CONCURRENCY = 2
const DEFAULT_IDLE_MS = 60_000
const DEFAULT_TIMEOUT_MS = 10_000

type ViewConstructor = new (options?: Electron.WebContentsViewConstructorOptions) => WebContentsView
type CaptureWorker = { disposeProtocol: () => void; id: number; view: WebContentsView }

type CapturePoolOptions = {
  WebContentsView: ViewConstructor
  cache: WebPreviewCacheContract
  idleMs?: number
  lookup: LinkPreviewLookup
  maxConcurrency?: number
  settle?: () => Promise<void>
  timeoutMs?: number
}

export class WebPreviewCapturePool implements WebPreviewCaptureServiceContract {
  private readonly available: CaptureWorker[] = []
  private disposed = false
  private idleTimer: ReturnType<typeof setTimeout> | null = null
  private readonly inflight = new Map<string, Promise<CapturedWebPreview>>()
  private readonly limit: ReturnType<typeof pLimit>
  private nextWorkerId = 1
  private readonly workers = new Set<CaptureWorker>()

  constructor(private readonly options: CapturePoolOptions) {
    this.limit = pLimit(options.maxConcurrency ?? DEFAULT_CONCURRENCY)
  }

  async capture(value: string, owner: BrowserWindow): Promise<CapturedWebPreview> {
    if (this.disposed) throw new Error('Web preview capture pool is disposed')
    const url = normalizeWebTabUrl(value)
    const cached = await this.options.cache.get(url)
    if (cached) return captureResult(cached)
    const running = this.inflight.get(url)
    if (running) return running
    const operation = this.limit(() => this.captureUncached(url, owner)).finally(() => {
      this.inflight.delete(url)
    })
    this.inflight.set(url, operation)
    return operation
  }

  dispose(): void {
    this.disposed = true
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    for (const worker of this.workers) this.destroyWorker(worker)
    this.available.length = 0
    this.workers.clear()
    this.options.cache.dispose?.()
  }

  private async captureUncached(url: string, owner: BrowserWindow): Promise<CapturedWebPreview> {
    if (this.disposed) throw new Error('Web preview capture pool is disposed')
    if (owner.isDestroyed()) throw new Error('Web preview capture host is unavailable')
    await runLinkPreviewStage('validate', () =>
      withTimeout(assertPublicLinkPreviewUrl(new URL(url), this.options.lookup), this.timeoutMs()),
    )
    const worker = this.acquireWorker()
    const contents = worker.view.webContents
    let attached = false
    let reusable = true
    contents.setBackgroundThrottling(false)
    try {
      owner.contentView.addChildView(worker.view)
      attached = true
      await runLinkPreviewStage('load', () => withTimeout(contents.loadURL(url), this.timeoutMs()))
      await runLinkPreviewStage('settle', () => this.options.settle?.() ?? defaultSettle())
      const image = await runLinkPreviewStage('capture-page', () =>
        withTimeout(contents.capturePage(undefined, { stayHidden: true }), this.timeoutMs()),
      )
      const bytes = await runLinkPreviewStage('encode', async () => encodePreview(image))
      await this.options.cache.set(url, bytes).catch(() => undefined)
      return captureResult(bytes)
    } finally {
      contents.stop()
      await contents.loadURL('about:blank').catch(() => undefined)
      await contents.session.clearStorageData().catch(() => undefined)
      contents.setBackgroundThrottling(true)
      if (attached) {
        if (owner.isDestroyed()) reusable = false
        else {
          try {
            owner.contentView.removeChildView(worker.view)
          } catch {
            reusable = false
          }
        }
      }
      if (reusable) this.releaseWorker(worker)
      else {
        this.destroyWorker(worker)
        this.workers.delete(worker)
      }
    }
  }

  private acquireWorker(): CaptureWorker {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = null
    const available = this.available.pop()
    if (available) return available

    const id = this.nextWorkerId++
    const view = new this.options.WebContentsView({
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        devTools: false,
        disableDialogs: true,
        javascript: false,
        nodeIntegration: false,
        offscreen: true,
        partition: `marklab-web-preview-${id}`,
        preload: undefined,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    })
    view.setBounds({ height: CAPTURE_HEIGHT, width: CAPTURE_WIDTH, x: 0, y: 0 })
    view.setVisible(false)
    view.webContents.setAudioMuted(true)
    view.webContents.setBackgroundThrottling(true)
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    installWebPreviewSessionSecurity(view.webContents.session)
    const disposeProtocol = installWebPreviewProtocol(
      view.webContents.session as never,
      this.options.lookup,
    )
    const worker = { disposeProtocol, id, view }
    this.workers.add(worker)
    return worker
  }

  private releaseWorker(worker: CaptureWorker): void {
    if (this.disposed) {
      this.destroyWorker(worker)
      return
    }
    this.available.push(worker)
    this.scheduleIdleCleanup()
  }

  private scheduleIdleCleanup(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => {
      for (const worker of this.available.splice(0)) {
        this.destroyWorker(worker)
        this.workers.delete(worker)
      }
      this.idleTimer = null
    }, this.options.idleMs ?? DEFAULT_IDLE_MS)
    this.idleTimer.unref?.()
  }

  private destroyWorker(worker: CaptureWorker): void {
    worker.disposeProtocol()
    const contents = worker.view.webContents
    if (!contents.isDestroyed()) contents.close()
  }

  private timeoutMs(): number {
    return this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  }
}

const captureResult = (bytes: Uint8Array): CapturedWebPreview => ({
  bytes,
  height: OUTPUT_HEIGHT,
  mediaType: 'image/jpeg',
  width: OUTPUT_WIDTH,
})

const encodePreview = (image: NativeImage): Uint8Array => {
  const cropped = image.crop(centerCrop(image.getSize(), OUTPUT_WIDTH / OUTPUT_HEIGHT))
  return new Uint8Array(
    cropped.resize({ height: OUTPUT_HEIGHT, quality: 'best', width: OUTPUT_WIDTH }).toJPEG(90),
  )
}

const centerCrop = (size: { height: number; width: number }, targetAspect: number): Rectangle => {
  if (size.height <= 0 || size.width <= 0) throw new Error('Captured web preview is empty')
  const sourceAspect = size.width / size.height
  const width = sourceAspect > targetAspect ? Math.round(size.height * targetAspect) : size.width
  const height = sourceAspect > targetAspect ? size.height : Math.round(size.width / targetAspect)
  return {
    height,
    width,
    x: Math.max(0, Math.floor((size.width - width) / 2)),
    y: Math.max(0, Math.floor((size.height - height) / 2)),
  }
}

const defaultSettle = () => new Promise<void>((resolve) => setTimeout(resolve, 250))

const withTimeout = async <T>(operation: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Web preview capture timed out')), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
