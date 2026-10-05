import {
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMainRendererUrl } from '@/quality/electronWindowUrl'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const electronMain = path.join(repoRoot, 'dist-electron', 'main.js')
const rendererDistRoot = path.join(repoRoot, 'dist')
const configuredE2eOutputRoot = process.env.MARKLAB_E2E_OUTPUT_ROOT?.trim()
const e2eOutputRoot = configuredE2eOutputRoot
  ? path.resolve(repoRoot, configuredE2eOutputRoot)
  : path.join(repoRoot, '.tmp', 'electron-e2e')

const contentTypeByExtension = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.wasm', 'application/wasm'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
])

export type ElectronTestSession = {
  app: ElectronApplication
  output: string[]
  page: Page
  testRunRoot: string
}

const resolveDistFile = (requestUrl: string | undefined) => {
  const parsedUrl = new URL(requestUrl ?? '/', 'http://127.0.0.1')
  const pathname = parsedUrl.pathname === '/' ? '/index.html' : parsedUrl.pathname
  const filePath = path.normalize(path.join(rendererDistRoot, decodeURIComponent(pathname)))
  const relativePath = path.relative(rendererDistRoot, filePath)
  return relativePath.startsWith('..') || path.isAbsolute(relativePath) ? null : filePath
}

export const startRendererServer = () =>
  new Promise<{ server: http.Server; url: string }>((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const filePath = resolveDistFile(request.url)
      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404)
        response.end('Not found')
        return
      }
      response.writeHead(200, {
        'Content-Type':
          contentTypeByExtension.get(path.extname(filePath)) ?? 'application/octet-stream',
      })
      fs.createReadStream(filePath).pipe(response)
    })
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to determine renderer server address'))
        return
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}` })
    })
  })

export const closeRendererServer = (server: http.Server | undefined) =>
  new Promise<void>((resolve, reject) => {
    if (!server) {
      resolve()
      return
    }
    server.close((error) => (error ? reject(error) : resolve()))
  })

const pickProcessEnv = (keys: string[]) =>
  keys.reduce<Record<string, string>>((env, key) => {
    const value = process.env[key]
    if (value) env[key] = value
    return env
  }, {})

const waitForMainWindow = async (
  app: ElectronApplication,
  rendererUrl: string,
  output: string[],
) => {
  const startedAt = Date.now()
  const observedUrls = new Set<string>()
  while (Date.now() - startedAt < 30_000) {
    const mainWindow = app.windows().find((candidate) => {
      const url = candidate.url()
      if (url) observedUrls.add(url)
      return isMainRendererUrl(url, rendererUrl)
    })
    if (mainWindow) return mainWindow
    await app.waitForEvent('window', { timeout: 1_000 }).catch(() => undefined)
  }
  throw new Error(
    `Timed out waiting for the Electron main window. Observed URLs: ${
      [...observedUrls].join(', ') || '(none)'
    }. Electron output: ${output.join('\n') || '(none)'}`,
  )
}

const waitForRendererAppShell = async (page: Page, output: string[]) => {
  try {
    await page.waitForSelector('#root > *', { timeout: 30_000 })
  } catch (error) {
    const rootHtml = await page
      .locator('#root')
      .evaluate((element) => element.innerHTML.slice(0, 500))
      .catch(() => '(unavailable)')
    throw new Error(
      `Timed out waiting for the React app shell. Root HTML: ${rootHtml}. Electron output: ${
        output.join('\n') || '(none)'
      }`,
      { cause: error },
    )
  }
}

type ElectronTestLaunchOptions = {
  openTargets?: string[]
  trustedCertificateSpki?: string
}

export const launchElectronTestSession = async (
  rendererUrl: string,
  options: ElectronTestLaunchOptions = {},
): Promise<ElectronTestSession> => {
  const testRunRoot = path.join(e2eOutputRoot, `${Date.now()}-${process.pid}`)
  fs.mkdirSync(testRunRoot, { recursive: true })
  const output: string[] = []
  const app = await electron.launch({
    args: [
      ...(options.trustedCertificateSpki
        ? [`--ignore-certificate-errors-spki-list=${options.trustedCertificateSpki}`]
        : []),
      '--disable-dev-shm-usage',
      '--disable-features=VizDisplayCompositor',
      '--disable-gpu',
      '--disable-gpu-compositing',
      '--disable-gpu-sandbox',
      '--no-sandbox',
      '--use-angle=swiftshader',
      `--user-data-dir=${path.join(testRunRoot, 'user-data')}`,
      electronMain,
      ...(options.openTargets ?? []),
    ],
    cwd: repoRoot,
    env: {
      ...pickProcessEnv(['COMSPEC', 'Path', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'WINDIR']),
      APPDATA: path.join(testRunRoot, 'appdata'),
      ELECTRON_ENABLE_LOGGING: '1',
      HOME: testRunRoot,
      LOCALAPPDATA: path.join(testRunRoot, 'localappdata'),
      MARKLAB_E2E: '1',
      USERPROFILE: testRunRoot,
      VITE_DEV_SERVER_URL: rendererUrl,
    },
  })
  const collect = (chunk: Buffer) => output.push(chunk.toString('utf8').trim())
  app.process().stdout?.on('data', collect)
  app.process().stderr?.on('data', collect)
  try {
    const page = await waitForMainWindow(app, rendererUrl, output)
    await page.setViewportSize({ width: 1280, height: 900 })
    await waitForRendererAppShell(page, output)
    return { app, output, page, testRunRoot }
  } catch (error) {
    await app.close().catch(() => undefined)
    fs.rmSync(testRunRoot, { recursive: true, force: true })
    throw error
  }
}

export const revealElectronWindow = (
  app: ElectronApplication,
  mainWindowUrl: string,
  contentSize?: { width: number; height: number },
) =>
  app.evaluate(
    ({ BrowserWindow }, { url, contentSize }) => {
      const window = BrowserWindow.getAllWindows().find(
        (candidate) => candidate.webContents.getURL() === url,
      )
      if (!window) throw new Error('Main renderer window was not found')
      if (window.isMinimized()) window.restore()
      if (contentSize) window.setContentSize(contentSize.width, contentSize.height)
      window.show()
      window.focus()
    },
    { url: mainWindowUrl, contentSize },
  )

export const snapshotWebContentsViews = (app: ElectronApplication, mainWindowUrl: string) =>
  app.evaluate(({ BrowserWindow, WebContentsView }, url) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.getURL() === url,
    )
    if (!window) throw new Error('Main renderer window was not found')
    return window.contentView.children
      .filter((child): child is Electron.WebContentsView => child instanceof WebContentsView)
      .map((view) => ({
        bounds: view.getBounds(),
        title: view.webContents.getTitle(),
        url: view.webContents.getURL(),
        visible: view.getVisible(),
        webContentsId: view.webContents.id,
      }))
  }, mainWindowUrl)

export const snapshotWebTabContents = (app: ElectronApplication, mainWindowUrl: string) =>
  app.evaluate(({ BrowserWindow, WebContentsView, webContents, session }, url) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.getURL() === url,
    )
    if (!window) throw new Error('Main renderer window was not found')
    const attachedIds = new Set(
      window.contentView.children
        .filter((child): child is Electron.WebContentsView => child instanceof WebContentsView)
        .map((view) => view.webContents.id),
    )
    const tabSession = session.fromPartition(`marklab-web-tabs-${window.id}`)
    return webContents
      .getAllWebContents()
      .filter((contents) => contents.session === tabSession)
      .map((contents) => ({
        attached: attachedIds.has(contents.id),
        url: contents.getURL(),
        webContentsId: contents.id,
      }))
      .sort((left, right) => left.url.localeCompare(right.url))
  }, mainWindowUrl)

export const snapshotStartupOpenTargetState = (page: Page) =>
  page.evaluate(async () => {
    const rendererWindow = window as Window & {
      marklabElectron?: {
        commands?: { invoke: (command: string) => Promise<unknown> }
        lifecycle?: { getLaunchInfo: () => Promise<{ args: string[]; cwd: string }> }
      }
    }
    const bridge = rendererWindow.marklabElectron
    const [launchInfo, rootInfo] = await Promise.all([
      bridge?.lifecycle?.getLaunchInfo(),
      bridge?.commands?.invoke('fs_get_root_info'),
    ])
    return { launchInfo, rootInfo }
  })

export const closeElectronTestSession = async (session: ElectronTestSession | undefined) => {
  await session?.app.close().catch(() => undefined)
  if (session) fs.rmSync(session.testRunRoot, { recursive: true, force: true })
}

export const firstVisibleLocator = async (locators: Locator[], description: string) => {
  for (const locator of locators) {
    const candidate = locator.first()
    if (await candidate.isVisible().catch(() => false)) return candidate
  }
  throw new Error(`Unable to find visible ${description}`)
}
