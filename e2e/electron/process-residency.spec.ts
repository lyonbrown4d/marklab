import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'

// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

type WorkspaceRuntime = { pid?: number; state: string; workspaceId: string }

const invokeCommand = <T>(page: Page, command: string, args?: Record<string, unknown>) =>
  page.evaluate(
    async ({ args, command }) => {
      const bridge = (
        window as Window & {
          marklabElectron?: {
            commands?: {
              invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
            }
          }
        }
      ).marklabElectron
      if (!bridge?.commands) throw new Error('Secure preload command bridge is unavailable')
      return bridge.commands.invoke(command, args)
    },
    { args, command },
  ) as Promise<T>

test.describe('Electron process residency', () => {
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.afterAll(async () => closeRendererServer(server))

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('destroys the startup window and shares one utility process across workspaces', async () => {
    session = await launchElectronTestSession(rendererUrl)
    await invokeCommand(session.page, 'fs_get_snapshot')

    const workspacePath = path.join(session.testRunRoot, 'second-workspace')
    fs.mkdirSync(workspacePath, { recursive: true })
    fs.writeFileSync(path.join(workspacePath, 'README.md'), '# Second workspace\n')

    await invokeCommand(session.page, 'open_path_in_new_window', { path: workspacePath })

    let workspacePage: Page | undefined
    await expect
      .poll(
        async () => {
          const candidates = session?.app.windows().filter((page) => page !== session?.page) ?? []
          for (const page of candidates) {
            if (
              await page
                .locator('.app-titlebar')
                .isVisible()
                .catch(() => false)
            ) {
              workspacePage = page
              return true
            }
          }
          return false
        },
        { timeout: 20_000 },
      )
      .toBe(true)
    if (!workspacePage) throw new Error('Second workspace renderer was not found')
    await workspacePage.waitForSelector('#root > *')
    await invokeCommand(workspacePage, 'fs_get_snapshot')

    let runtimes: WorkspaceRuntime[] = []
    await expect
      .poll(async () => {
        runtimes = await invokeCommand<WorkspaceRuntime[]>(
          session!.page,
          'knowledge.engine.workspaces',
        )
        return runtimes.filter((runtime) => runtime.state === 'ready' && runtime.pid).length
      })
      .toBeGreaterThanOrEqual(2)

    expect(new Set(runtimes.map((runtime) => runtime.pid).filter(Boolean)).size).toBe(1)
    const windowUrls = await session.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => window.webContents.getURL()),
    )
    expect(windowUrls.some((url) => url.includes('splashscreen.html'))).toBe(false)
    await expect
      .poll(
        () =>
          session!.app
            .windows()
            .filter(
              (page) =>
                page !== session?.page &&
                page !== workspacePage &&
                page.url().includes('marklab-standby=1'),
            ).length,
        { timeout: 20_000 },
      )
      .toBe(1)
  })
})
