import { expect, test, type Page } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

test.describe('Responsive desktop chrome', () => {
  let page: Page
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.beforeEach(async () => {
    session = await launchElectronTestSession(rendererUrl)
    page = session.page
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('adapts settings and titlebar chrome while the window is resized', async () => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.keyboard.press('Control+Comma')
    const settingsDialog = page.getByRole('dialog', { name: /Settings|设置/i })
    await expect(settingsDialog).toBeVisible({ timeout: 2_000 })
    const largeDialog = await settingsDialog.boundingBox()
    expect(largeDialog).not.toBeNull()

    await page.setViewportSize({ width: 640, height: 480 })
    await expect
      .poll(async () => (await settingsDialog.boundingBox())?.width)
      .toBeLessThan((largeDialog?.width ?? 0) - 100)
    const compactDialog = await settingsDialog.boundingBox()
    expect(compactDialog).not.toBeNull()
    if (compactDialog) {
      expect(compactDialog.x).toBeGreaterThanOrEqual(8)
      expect(compactDialog.y).toBeGreaterThanOrEqual(8)
      expect(compactDialog.x + compactDialog.width).toBeLessThanOrEqual(632)
      expect(compactDialog.y + compactDialog.height).toBeLessThanOrEqual(472)
    }

    await page.keyboard.press('Escape')
    await expect(settingsDialog).toBeHidden()
    const titlebarGeometry = await page.locator('.app-titlebar').evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(titlebarGeometry.scrollWidth).toBeLessThanOrEqual(titlebarGeometry.clientWidth)
    await expect(page.locator('[data-slot="compact-titlebar-actions"]')).toBeVisible()
  })
})
