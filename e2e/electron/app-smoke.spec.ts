import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  firstVisibleLocator,
  launchElectronTestSession,
  repoRoot,
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

  test('uses the shared contextual-menu surface for titlebar menus', async () => {
    const workspaceMenuTrigger = page.getByRole('button', {
      name: /^Workspace:|^工作区:/i,
    })
    await expect(workspaceMenuTrigger).toBeVisible()
    await workspaceMenuTrigger.click()

    const menu = page.getByRole('menu').first()
    await expect(menu).toBeVisible()
    const menuStyle = await menu.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        backdropFilter: style.backdropFilter,
        borderRadius: style.borderRadius,
      }
    })
    expect(menuStyle).toEqual({ backdropFilter: 'blur(16px)', borderRadius: '12px' })

    const firstItem = menu.getByRole('menuitem').first()
    const itemStyle = await firstItem.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return { borderRadius: style.borderRadius, fontSize: style.fontSize }
    })
    expect(itemStyle).toEqual({ borderRadius: '8px', fontSize: '13px' })

    const captureDirectory = path.join(repoRoot, '.tmp', 'design-qa')
    fs.mkdirSync(captureDirectory, { recursive: true })
    await page.screenshot({
      animations: 'disabled',
      path: path.join(captureDirectory, 'unified-titlebar-menu.png'),
    })
  })

  test('toggles the bottom status bar from a click-only edge handle', async () => {
    const statusBar = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
    const hideHandle = page.getByRole('button', { name: /Hide status bar|隐藏状态栏/i })

    await expect(statusBar).toBeVisible()
    await expect(hideHandle).toHaveAttribute('aria-expanded', 'true')
    await hideHandle.click()
    await expect(statusBar).toBeHidden()

    const showHandle = page.getByRole('button', { name: /Show status bar|显示状态栏/i })
    await expect(showHandle).toHaveAttribute('aria-expanded', 'false')
    await showHandle.hover()
    await page.waitForTimeout(350)
    await expect(statusBar).toBeHidden()

    const captureDirectory = path.join(repoRoot, '.tmp', 'design-qa')
    fs.mkdirSync(captureDirectory, { recursive: true })
    await page.screenshot({
      animations: 'disabled',
      path: path.join(captureDirectory, 'collapsed-status-bar-handle.png'),
    })

    await showHandle.click()
    await expect(statusBar).toBeVisible()
  })
})
