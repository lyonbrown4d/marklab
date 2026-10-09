import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
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

const captureDesignScreenshot = async (page: Page, fileName: string) => {
  const captureDirectory = path.join(repoRoot, '.tmp', 'design-qa')
  fs.mkdirSync(captureDirectory, { recursive: true })
  await page.screenshot({ animations: 'disabled', path: path.join(captureDirectory, fileName) })
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
    await expect(page.locator('.app-titlebar')).toBeVisible({ timeout: 10_000 })
    const commandStartedAt = Date.now()
    await page.keyboard.press('ControlOrMeta+P')
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

  test('centers the settings dialog within the Electron viewport', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.keyboard.press('Control+Comma')
    const settingsDialog = page.getByRole('dialog', { name: /Settings|设置/i })
    await expect(settingsDialog).toBeVisible({ timeout: 2_000 })
    const dialogBox = await settingsDialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    if (!dialogBox) return
    const expectedX = (1280 - dialogBox.width) / 2
    const expectedY = (900 - dialogBox.height) / 2
    expect(Math.abs(dialogBox.x - expectedX)).toBeLessThanOrEqual(1)
    expect(Math.abs(dialogBox.y - expectedY)).toBeLessThanOrEqual(1)
    await captureDesignScreenshot(page, 'settings-dialog-position.png')
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
    await captureDesignScreenshot(page, 'unified-titlebar-menu.png')
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

    await captureDesignScreenshot(page, 'collapsed-status-bar-handle.png')

    await showHandle.click()
    await expect(statusBar).toBeVisible()
  })

  test('makes the bottom read-only toggle visibly switch between unlocked and locked', async () => {
    const statusBar = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
    const readOnlyToggle = statusBar.locator('button[data-read-only]')

    await expect(readOnlyToggle).toBeVisible()
    await expect(readOnlyToggle).toHaveAccessibleName(/Enter read-only browsing|进入只读浏览/i)
    await expect(readOnlyToggle).toHaveAttribute('aria-pressed', 'false')
    await expect(readOnlyToggle).toHaveAttribute('data-read-only', 'false')
    await expect(readOnlyToggle).toContainText(/Editable|可编辑/i)

    await readOnlyToggle.click()

    await expect(readOnlyToggle).toHaveAccessibleName(/Resume editing|退出只读浏览/i)
    await expect(readOnlyToggle).toHaveAttribute('aria-pressed', 'true')
    await expect(readOnlyToggle).toHaveAttribute('data-read-only', 'true')
    await expect(readOnlyToggle).toContainText(/Read-only|只读/i)

    const captureDirectory = path.join(repoRoot, '.tmp', 'design-qa')
    fs.mkdirSync(captureDirectory, { recursive: true })
    await statusBar.screenshot({
      animations: 'disabled',
      path: path.join(captureDirectory, 'readonly-status-toggle.png'),
    })

    await readOnlyToggle.click()
    await expect(readOnlyToggle).toHaveAttribute('aria-pressed', 'false')
  })

  test('updates document statistics after normal rich-text typing', async () => {
    const editor = page.getByTestId('markdown-editor')
    const statusBar = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
    await expect(editor).toBeVisible({ timeout: 10_000 })

    await editor.click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText('one two')
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('three')

    await expect(editor).toContainText('one two')
    await expect(editor).toContainText('three')
    await expect(statusBar).toContainText(/[1-9]\d*\s+(Lines|行)/i, { timeout: 5_000 })
    await expect(statusBar).toContainText(/3\s+(Words|词)/i)
    await expect(statusBar).toContainText(/11\s+(Characters|字符)/i)
  })

  test('releases the canvas after a hover-preview sidebar closes', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const hoverZone = page.getByTestId('sidebar-hover-zone')
    const drawer = page.getByRole('dialog', { name: /Toggle sidebar|切换侧边栏/i })

    await hoverZone.hover()
    await expect(drawer).toBeVisible({ timeout: 1_500 })

    await page.mouse.move(700, 450)
    await expect(drawer).toBeHidden({ timeout: 1_500 })
    const drawerInterceptsCanvas = await page.evaluate(() =>
      Boolean(document.elementFromPoint(100, 100)?.closest('[role="dialog"]')),
    )
    expect(drawerInterceptsCanvas).toBe(false)
  })

  test('toggles and focuses the sidebar from its app shortcut', async () => {
    const drawer = page.getByRole('dialog', { name: /Toggle sidebar|切换侧边栏/i })
    const fileSearch = page.locator(
      'input[placeholder*="Search files"], input[placeholder*="搜索文件"]',
    )

    await page.keyboard.press('Control+Shift+L')
    await expect(drawer).toBeVisible({ timeout: 1_500 })
    await expect(fileSearch).toBeFocused({ timeout: 1_500 })

    await page.keyboard.press('Control+Shift+L')
    await expect(drawer).toBeHidden({ timeout: 1_500 })
  })

  test('tracks system color-scheme changes in both directions', async () => {
    const electronApp = session?.app
    expect(electronApp).toBeDefined()
    if (!electronApp) return

    const setNativeTheme = (themeSource: 'dark' | 'light' | 'system') =>
      electronApp.evaluate(({ nativeTheme }, source) => {
        nativeTheme.themeSource = source
      }, themeSource)

    try {
      await setNativeTheme('light')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')), {
          timeout: 3_000,
        })
        .toBe(false)

      await setNativeTheme('dark')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')), {
          timeout: 3_000,
        })
        .toBe(true)

      await setNativeTheme('light')
      await expect
        .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')), {
          timeout: 3_000,
        })
        .toBe(false)
    } finally {
      await setNativeTheme('system')
    }
  })
})
