import { expect, test, type Locator } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

const setWindowLayout = async (
  session: ElectronTestSession,
  size: { width: number; height: number },
  zoom = 1,
) => {
  const windowHandle = await session.app.browserWindow(session.page)
  try {
    await windowHandle.evaluate(
      (window, layout) => {
        window.setMinimumSize(0, 0)
        window.setContentSize(layout.size.width, layout.size.height)
        window.webContents.setZoomFactor(layout.zoom)
      },
      { size, zoom },
    )
  } finally {
    await windowHandle.dispose()
  }
  await expect
    .poll(() => session.page.evaluate(() => window.innerWidth))
    .toBe(Math.round(size.width / zoom))
}

const expectContained = async (child: Locator, container: Locator) => {
  const childBox = await child.boundingBox()
  const containerBox = await container.boundingBox()
  expect(childBox).not.toBeNull()
  expect(containerBox).not.toBeNull()
  if (!childBox || !containerBox) return
  expect(childBox.x).toBeGreaterThanOrEqual(containerBox.x - 1)
  expect(childBox.y).toBeGreaterThanOrEqual(containerBox.y - 1)
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(containerBox.x + containerBox.width + 1)
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(containerBox.y + containerBox.height + 1)
}

test.describe('Settings window layout', () => {
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
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  for (const layout of [
    { name: 'short desktop window', width: 900, height: 420, zoom: 1 },
    { name: 'zoomed desktop window', width: 1100, height: 540, zoom: 1.25 },
  ]) {
    // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
    test(`scrolls the sidebar independently in a ${layout.name}`, async ({}, testInfo) => {
      const current = session!
      const page = current.page
      await setWindowLayout(current, layout, layout.zoom)
      await page.keyboard.press('ControlOrMeta+,')
      const dialog = page.getByRole('dialog', { name: /Settings|设置/i })
      await expect(dialog).toBeVisible()
      const navigation = dialog.getByRole('tablist')
      await expect(navigation).toHaveAttribute('aria-orientation', 'vertical')
      await expectContained(navigation, dialog)
      await expect
        .poll(() => navigation.evaluate((element) => element.scrollHeight - element.clientHeight))
        .toBeGreaterThan(0)

      const tabs = navigation.getByRole('tab')
      for (const tab of await tabs.all()) {
        expect((await tab.boundingBox())?.height).toBeGreaterThanOrEqual(31)
      }
      const content = dialog.locator('.settings-scroll-viewport')
      await expect(content).toBeVisible()
      const initialContentScroll = await content.evaluate((element) => element.scrollTop)
      await navigation.hover()
      await page.mouse.wheel(0, 600)
      await expect
        .poll(() => navigation.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(0)
      expect(await content.evaluate((element) => element.scrollTop)).toBe(initialContentScroll)
      await expectContained(tabs.last(), navigation)

      await tabs.first().focus()
      await page.keyboard.press('End')
      await expect(tabs.last()).toBeFocused()
      await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
      await expectContained(tabs.last(), navigation)
      await expectContained(dialog.locator('#settings-page-shortcuts'), content)
      await testInfo.attach(`${layout.name}.png`, {
        body: await page.screenshot({ animations: 'disabled' }),
        contentType: 'image/png',
      })
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    })
  }

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('keeps narrow navigation horizontally scrollable and keyboard reachable', async ({}, testInfo) => {
    const current = session!
    const page = current.page
    await setWindowLayout(current, { width: 520, height: 640 })
    await page.keyboard.press('ControlOrMeta+,')
    const dialog = page.getByRole('dialog', { name: /Settings|设置/i })
    await expect(dialog).toBeVisible()
    const navigation = dialog.getByRole('tablist')
    await expect(navigation).toHaveAttribute('aria-orientation', 'horizontal')
    await expectContained(navigation, dialog)
    await expectContained(dialog.getByRole('searchbox'), dialog)
    const metrics = await navigation.evaluate((element) => ({
      height: element.clientHeight,
      overflow: element.scrollWidth - element.clientWidth,
    }))
    expect(metrics.height).toBeGreaterThanOrEqual(48)
    expect(metrics.overflow).toBeGreaterThan(0)

    const content = dialog.locator('.settings-scroll-viewport')
    const initialContentScroll = await content.evaluate((element) => element.scrollTop)
    await navigation.hover()
    await page.mouse.wheel(900, 0)
    await expect.poll(() => navigation.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0)
    expect(await content.evaluate((element) => element.scrollTop)).toBe(initialContentScroll)
    const tabs = navigation.getByRole('tab')
    await expectContained(tabs.last(), navigation)
    await tabs.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.nth(1)).toBeFocused()
    await page.keyboard.press('End')
    await expect(tabs.last()).toBeFocused()
    await expect(tabs.last()).toHaveAttribute('aria-selected', 'true')
    await expectContained(tabs.last(), navigation)
    await expectContained(dialog.locator('#settings-page-shortcuts'), content)
    await testInfo.attach('narrow settings.png', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
  })
})
