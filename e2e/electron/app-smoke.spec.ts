import { expect, test, type Page } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  firstVisibleLocator,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

type RendererWindow = Window & {
  ipcRenderer?: unknown
  marklabElectron?: unknown
  require?: unknown
}

test.describe('Electron desktop shell', () => {
  let page: Page
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })

  test.afterAll(async () => closeRendererServer(server))

  test.beforeEach(async () => {
    session = await launchElectronTestSession(rendererUrl)
    page = session.page
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('loads the renderer through a narrow secure preload bridge', async () => {
    await expect(page).toHaveTitle(/marklab/i)

    const bridge = await page.evaluate(() => {
      const rendererWindow = window as RendererWindow
      return {
        hasGenericIpc: typeof rendererWindow.ipcRenderer !== 'undefined',
        hasMarklabElectronBridge: typeof rendererWindow.marklabElectron === 'object',
        hasNodeRequire: typeof rendererWindow.require === 'function',
      }
    })

    expect(bridge).toEqual({
      hasGenericIpc: false,
      hasMarklabElectronBridge: true,
      hasNodeRequire: false,
    })
  })

  test('opens modal shells promptly without blank first paint', async () => {
    await expect(page).toHaveTitle(/marklab/i)

    const commandTrigger = await firstVisibleLocator(
      [
        page.locator('.command-trigger'),
        page.getByRole('button', { name: /Search workspace|搜索工作区/i }),
        page.getByRole('button', { name: /Search files|搜索文件/i }),
        page.getByRole('button', { name: /^Search$|^搜索$/i }),
      ],
      'command palette trigger',
    )
    const commandStartedAt = Date.now()
    await commandTrigger.click()

    const commandDialog = page.getByRole('dialog', { name: /Command palette|命令面板/i })
    await expect(commandDialog).toBeVisible({ timeout: 2_000 })
    expect(Date.now() - commandStartedAt).toBeLessThan(2_000)
    await expect(commandDialog.getByRole('combobox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(commandDialog).toBeHidden({ timeout: 2_000 })

    const settingsStartedAt = Date.now()
    await page.keyboard.press('Control+Comma')
    const settingsDialog = page.getByRole('dialog', { name: /Settings|设置/i })
    await expect(settingsDialog).toBeVisible({ timeout: 2_000 })
    expect(Date.now() - settingsStartedAt).toBeLessThan(2_000)
    await expect(settingsDialog.getByRole('tablist', { name: /Settings|设置/i })).toBeVisible()
  })
})
