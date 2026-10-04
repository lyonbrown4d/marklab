import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Performance E2E reuses the production-build renderer server.
import { repoRoot } from '../electron/electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Performance E2E helpers are Node-run sibling modules.
import {
  trackPerformancePage,
  waitForPlateReadyProbe,
  type PageTracking,
  type PlateInitializationMetrics,
} from './plateReadyProbe.js'

// eslint-disable-next-line no-restricted-imports -- Performance E2E helpers are Node-run sibling modules.
export type { PlateInitializationMetrics } from './plateReadyProbe.js'

export type GraphicsMode = 'native-gpu' | 'software-rendering'

export type ElectronPerformanceSession = {
  app: ElectronApplication
  gpuFeatureStatus: object
  isolation: Record<string, string>
  launcherPage: Page
  output: string[]
  pageTracking: Map<Page, PageTracking>
  runtimeRoot: string
}

const electronMain = path.join(repoRoot, 'dist-electron', 'main.js')
const runtimeParent = path.join(os.tmpdir(), 'marklab-electron-performance')
const APP_CLOSE_TIMEOUT_MS = 10_000
const WINDOW_READY_TIMEOUT_MS = 90_000

const pickProcessEnv = (keys: string[]) =>
  keys.reduce<Record<string, string>>((env, key) => {
    const value = process.env[key]
    if (value) env[key] = value
    return env
  }, {})

const removeRuntimeRoot = (runtimeRoot: string) => {
  const relative = path.relative(runtimeParent, path.resolve(runtimeRoot))
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove performance runtime outside ${runtimeParent}`)
  }
  fs.rmSync(runtimeRoot, { force: true, maxRetries: 10, recursive: true, retryDelay: 100 })
}

const revealElectronWindow = async (app: ElectronApplication, page: Page) => {
  const targetUrl = page.url()
  await app.evaluate(({ BrowserWindow }, url) => {
    const windows = BrowserWindow.getAllWindows()
    const exact = windows.find((candidate) => candidate.webContents.getURL() === url)
    const sameDocument = windows.filter(
      (candidate) => candidate.webContents.getURL().split('#')[0] === url.split('#')[0],
    )
    const window = exact ?? (sameDocument.length === 1 ? sameDocument[0] : undefined)
    if (!window) throw new Error(`Unable to reveal Electron window for ${url}`)
    window.setOpacity(1)
    window.show()
    window.focus()
  }, targetUrl)
}

const closeElectronApp = async (app: ElectronApplication) => {
  let closedGracefully = false
  await Promise.race([
    app.close().then(() => {
      closedGracefully = true
    }),
    new Promise<void>((resolve) => setTimeout(resolve, APP_CLOSE_TIMEOUT_MS)),
  ]).catch(() => undefined)
  if (!closedGracefully && app.process().exitCode === null) app.process().kill()
}

const waitForLauncherPage = async (
  app: ElectronApplication,
  rendererUrl: string,
  output: string[],
) => {
  const deadline = Date.now() + WINDOW_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      if (!page.url().startsWith(rendererUrl) || page.url().endsWith('window-opening.html'))
        continue
      if (
        (await page
          .locator('#root > *')
          .count()
          .catch(() => 0)) > 0
      )
        return page
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `Unable to find launcher page. URLs: ${app
      .windows()
      .map((page) => page.url())
      .join(', ')}. Electron output: ${output.join('\n') || '(none)'}`,
  )
}

export const launchPerformanceSession = async (
  rendererUrl: string,
  graphicsMode: GraphicsMode,
  options: { trustedCertificateSpki?: string } = {},
): Promise<ElectronPerformanceSession> => {
  fs.mkdirSync(runtimeParent, { recursive: true })
  const runtimeRoot = fs.mkdtempSync(path.join(runtimeParent, 'run-'))
  const isolation = {
    appData: path.join(runtimeRoot, 'appdata'),
    cache: path.join(runtimeRoot, 'cache'),
    home: path.join(runtimeRoot, 'home'),
    localAppData: path.join(runtimeRoot, 'localappdata'),
    temp: path.join(runtimeRoot, 'temp'),
    userData: path.join(runtimeRoot, 'user-data'),
  }
  Object.values(isolation).forEach((directory) => fs.mkdirSync(directory, { recursive: true }))
  const output: string[] = []
  const env = {
    ...pickProcessEnv(['COMSPEC', 'Path', 'PATH', 'SystemRoot', 'WINDIR']),
    APPDATA: isolation.appData,
    ELECTRON_ENABLE_LOGGING: '1',
    HOME: isolation.home,
    LOCALAPPDATA: isolation.localAppData,
    TEMP: isolation.temp,
    TMP: isolation.temp,
    USERPROFILE: isolation.home,
    VITE_DEV_SERVER_URL: rendererUrl,
    XDG_CACHE_HOME: isolation.cache,
    XDG_CONFIG_HOME: isolation.appData,
    ...(graphicsMode === 'software-rendering' ? { MARKLAB_E2E: '1' } : {}),
  }
  const app = await electron.launch({
    args: [
      ...(options.trustedCertificateSpki
        ? [`--ignore-certificate-errors-spki-list=${options.trustedCertificateSpki}`]
        : []),
      '--enable-precise-memory-info',
      `--user-data-dir=${isolation.userData}`,
      electronMain,
    ],
    cwd: repoRoot,
    env,
  })
  const collect = (chunk: Buffer) => output.push(chunk.toString('utf8').trim())
  app.process().stdout?.on('data', collect)
  app.process().stderr?.on('data', collect)
  const pageTracking = new Map<Page, PageTracking>()
  app.on('window', (page) => void trackPerformancePage(pageTracking, page))
  app.windows().forEach((page) => void trackPerformancePage(pageTracking, page))
  try {
    const launcherPage = await waitForLauncherPage(app, rendererUrl, output)
    await trackPerformancePage(pageTracking, launcherPage)
    await revealElectronWindow(app, launcherPage)
    const gpuFeatureStatus = await app.evaluate(({ app: electronApp }) =>
      electronApp.getGPUFeatureStatus(),
    )
    return { app, gpuFeatureStatus, isolation, launcherPage, output, pageTracking, runtimeRoot }
  } catch (error) {
    await closeElectronApp(app)
    removeRuntimeRoot(runtimeRoot)
    throw error
  }
}

export const openWorkspaceWindow = async (
  session: ElectronPerformanceSession,
  workspacePath: string,
  fileName: string,
) => {
  const openRequestedAtEpochMs = Date.now()
  await Promise.all(
    session.app.windows().map((page) => trackPerformancePage(session.pageTracking, page)),
  )
  const result = await session.launcherPage.evaluate(async (targetPath) => {
    const api = (
      window as typeof window & {
        marklabElectron?: {
          commands: {
            invoke: (command: string, args: Record<string, unknown>) => Promise<unknown>
          }
        }
      }
    ).marklabElectron
    if (!api) throw new Error('Secure preload API is unavailable')
    return api.commands.invoke('open_path_in_new_window', { path: targetPath })
  }, workspacePath)

  const deadline = Date.now() + 90_000
  const revealedPages = new WeakSet<Page>()
  while (Date.now() < deadline) {
    for (const page of session.app.windows()) {
      if (!decodeURIComponent(page.url()).includes(`/files/edit/${fileName}`)) continue
      const tracked = session.pageTracking.get(page)
      await (tracked?.installTask ?? trackPerformancePage(session.pageTracking, page))
      if (!revealedPages.has(page)) {
        await revealElectronWindow(session.app, page)
        revealedPages.add(page)
      }
      const editor = page.locator('[data-testid="markdown-editor"][data-editor-engine="plate"]')
      if (await editor.isVisible().catch(() => false)) {
        const probe = await waitForPlateReadyProbe(page, WINDOW_READY_TIMEOUT_MS)
        const windowOpenedAtEpochMs =
          session.pageTracking.get(page)?.windowOpenedAtEpochMs ?? openRequestedAtEpochMs
        const initialization: PlateInitializationMetrics = {
          ...probe,
          openRequestToReadyMs: probe.readyAtEpochMs - openRequestedAtEpochMs,
          windowOpenToReadyMs: probe.readyAtEpochMs - windowOpenedAtEpochMs,
        }
        return { initialization, page, result }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(
    `Large document did not become interactive. URLs: ${session.app
      .windows()
      .map((page) => page.url())
      .join(', ')}. Electron output: ${session.output.join('\n')}`,
  )
}

export const resizeElectronWindow = async (
  session: ElectronPerformanceSession,
  page: Page,
  size: { height: number; width: number },
) => {
  const targetUrl = page.url()
  await session.app.evaluate(
    ({ BrowserWindow }, { height, targetUrl, width }) => {
      const window = BrowserWindow.getAllWindows().find(
        (candidate) => candidate.webContents.getURL() === targetUrl,
      )
      if (!window) throw new Error(`Unable to resize Electron window for ${targetUrl}`)
      window.setContentSize(width, height)
      window.center()
    },
    { ...size, targetUrl },
  )
}

export const flushWorkspaceBuffers = async (page: Page) =>
  page.evaluate(async () => {
    const api = (
      window as typeof window & {
        marklabElectron?: {
          commands: {
            invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
          }
        }
      }
    ).marklabElectron
    if (!api) throw new Error('Secure preload API is unavailable')
    return api.commands.invoke('fs_flush_buffers')
  })

export const closePerformanceSession = async (session: ElectronPerformanceSession | undefined) => {
  if (session) await closeElectronApp(session.app)
  if (session) removeRuntimeRoot(session.runtimeRoot)
}
