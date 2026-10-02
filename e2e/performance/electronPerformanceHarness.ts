import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Performance E2E reuses the production-build renderer server.
import { repoRoot } from '../electron/electronTestHarness.js'

export type GraphicsMode = 'native-gpu' | 'software-rendering'

export type ElectronPerformanceSession = {
  app: ElectronApplication
  launcherPage: Page
  output: string[]
  runtimeRoot: string
}

const electronMain = path.join(repoRoot, 'dist-electron', 'main.js')
const runtimeParent = path.join(repoRoot, '.tmp')
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
  fs.rmSync(runtimeRoot, { force: true, recursive: true })
}

const revealElectronWindow = async (app: ElectronApplication, page: Page) => {
  const targetUrl = page.url()
  await app.evaluate(({ BrowserWindow }, url) => {
    const window = BrowserWindow.getAllWindows().find(
      (candidate) => candidate.webContents.getURL() === url,
    )
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
      if ((await page.locator('#root > *').count()) > 0) return page
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
): Promise<ElectronPerformanceSession> => {
  fs.mkdirSync(runtimeParent, { recursive: true })
  const runtimeRoot = fs.mkdtempSync(path.join(runtimeParent, 'electron-performance-'))
  const output: string[] = []
  const env = {
    ...pickProcessEnv(['COMSPEC', 'Path', 'PATH', 'SystemRoot', 'TEMP', 'TMP', 'WINDIR']),
    ELECTRON_ENABLE_LOGGING: '1',
    VITE_DEV_SERVER_URL: rendererUrl,
    ...(graphicsMode === 'software-rendering' ? { MARKLAB_E2E: '1' } : {}),
  }
  const app = await electron.launch({
    args: [
      '--enable-precise-memory-info',
      `--user-data-dir=${path.join(runtimeRoot, 'user-data')}`,
      electronMain,
    ],
    cwd: repoRoot,
    env,
  })
  const collect = (chunk: Buffer) => output.push(chunk.toString('utf8').trim())
  app.process().stdout?.on('data', collect)
  app.process().stderr?.on('data', collect)
  try {
    const launcherPage = await waitForLauncherPage(app, rendererUrl, output)
    await revealElectronWindow(app, launcherPage)
    return { app, launcherPage, output, runtimeRoot }
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
  while (Date.now() < deadline) {
    for (const page of session.app.windows()) {
      if (!decodeURIComponent(page.url()).includes(`/files/edit/${fileName}`)) continue
      const editor = page.locator(
        '.crepe-playground > .milkdown > .ProseMirror[contenteditable="true"]',
      )
      if (await editor.isVisible().catch(() => false)) {
        await revealElectronWindow(session.app, page)
        return { page, result }
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

export const closePerformanceSession = async (session: ElectronPerformanceSession | undefined) => {
  if (session) await closeElectronApp(session.app)
  if (session) removeRuntimeRoot(session.runtimeRoot)
}
