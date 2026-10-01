import { expect, test, type Page } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

test.describe('Compact titlebar overflow menu', () => {
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
    await page.setViewportSize({ width: 820, height: 700 })
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('keeps a collision-flipped submenu visible and reachable', async () => {
    await page.getByRole('button', { name: /^(More|更多)$/i }).click()
    const viewTrigger = page.getByRole('menuitem', {
      name: /WYSIWYG|所见即所得/i,
    })
    await viewTrigger.hover()

    const sourceItem = page.getByRole('menuitemradio', { name: /Source|源码/i })
    await expect(sourceItem).toBeVisible()
    const submenu = sourceItem.locator('xpath=ancestor::*[@role="menu"][1]')
    const [triggerBox, submenuBox] = await Promise.all([
      viewTrigger.boundingBox(),
      submenu.boundingBox(),
    ])
    expect(triggerBox).not.toBeNull()
    expect(submenuBox).not.toBeNull()
    if (!triggerBox || !submenuBox) return

    expect(submenuBox.x).toBeGreaterThanOrEqual(8)
    expect(submenuBox.x + submenuBox.width).toBeLessThanOrEqual(812)
    const gap = Math.min(
      Math.abs(submenuBox.x + submenuBox.width - triggerBox.x),
      Math.abs(triggerBox.x + triggerBox.width - submenuBox.x),
    )
    expect(gap).toBeLessThanOrEqual(8)

    await page.mouse.move(submenuBox.x + submenuBox.width / 2, submenuBox.y + submenuBox.height / 2)
    await expect(sourceItem).toBeVisible()
  })

  test('keeps the document outline open after the menu dismisses', async () => {
    await page.getByRole('button', { name: /^(More|更多)$/i }).click()
    await page.getByRole('menuitem', { name: /Document outline|文档大纲/i }).click()

    const drawer = page.getByRole('dialog', { name: /Document outline|文档大纲/i })
    await expect(drawer).toBeVisible()
    await page.waitForTimeout(250)
    await expect(drawer).toBeVisible()
  })
})
