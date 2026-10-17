/* eslint-disable no-restricted-imports -- Renderer fixtures are outside production. */
import { PANEL_TOGGLE_GUARD_MS } from '@/utils/toggleGuard'
import { test, expect } from './rendererTest.js'
/* eslint-enable no-restricted-imports */

test('keeps the editor aligned with responsive Chromium viewport sizes', async ({
  session: { page },
}) => {
  for (const size of [
    { width: 1280, height: 900 },
    { width: 900, height: 700 },
    { width: 1440, height: 960 },
  ]) {
    await page.setViewportSize(size)
    expect(await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))).toEqual(size)
    await expect(page.getByTestId('markdown-editor')).toBeInViewport()
  }
})

test('releases the canvas after a hover-preview sidebar closes', async ({ session: { page } }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const drawer = page.getByRole('dialog', { name: /Toggle sidebar|切换侧边栏/i })
  await page.getByTestId('sidebar-hover-zone').hover()
  await expect(drawer).toBeVisible({ timeout: 1_500 })
  await page.mouse.move(700, 450)
  await expect(drawer).toBeHidden({ timeout: 1_500 })
  expect(
    await page.evaluate(() =>
      Boolean(document.elementFromPoint(100, 100)?.closest('[role="dialog"]')),
    ),
  ).toBe(false)
})

test('toggles and focuses the sidebar from its shortcut', async ({ session: { page } }) => {
  await page.mouse.move(700, 450)
  const drawer = page.getByRole('dialog', { name: /Toggle sidebar|切换侧边栏/i })
  await page.keyboard.press('ControlOrMeta+Shift+L')
  await expect(drawer).toBeVisible({ timeout: 1_500 })
  await expect(
    page.locator('input[placeholder*="Search files"], input[placeholder*="搜索文件"]'),
  ).toBeFocused()
  await page.waitForTimeout(PANEL_TOGGLE_GUARD_MS)
  await page.keyboard.press('ControlOrMeta+Shift+L')
  await expect(page.locator('main[data-sidebar-pinned]')).toHaveAttribute(
    'data-sidebar-pinned',
    'false',
  )
  await expect(drawer).toBeHidden()
})

test('hands navigation focus to Search Everywhere without preempting settings', async ({
  session: { page },
}) => {
  const doubleShift = async () => {
    await page.keyboard.press('Shift')
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await page.keyboard.press('Shift')
  }
  const drawer = page.getByRole('dialog', { name: /Toggle sidebar|切换侧边栏/i })
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/i })
  await page.keyboard.press('ControlOrMeta+Shift+L')
  await expect(drawer).toBeVisible()
  await doubleShift()
  await expect(palette).toBeVisible()
  await expect(drawer).toBeHidden()
  await expect(palette.getByRole('combobox')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-app-focus-fallback="sidebar-toggle"]')).toBeFocused()
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.getByRole('dialog', { name: /Settings|设置/i })
  await expect(settings).toBeVisible()
  await doubleShift()
  await expect(settings).toBeVisible()
  await expect(palette).toBeHidden()
})

test('tracks browser system color-scheme changes in both directions', async ({
  session: { page },
}) => {
  for (const colorScheme of ['light', 'dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.classList.contains('dark')))
      .toBe(colorScheme === 'dark')
  }
})

test.describe('document statistics', () => {
  test.use({ documents: { 'Statistics.md': '' }, initialFile: 'Statistics.md' })
  test('updates counts after normal rich-text typing', async ({ session: { page } }) => {
    const editor = page.getByTestId('markdown-editor')
    await editor.locator('p').first().click()
    await page.keyboard.insertText('one two')
    await page.keyboard.press('Enter')
    await page.keyboard.insertText('three')
    await expect(editor).toContainText('one two')
    await expect(editor).toContainText('three')
    const status = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
    await expect(status).toContainText(/[1-9]\d*\s+(Lines|行)/i)
    await expect(status.locator('span').filter({ hasText: /^3\s+(Words|词)$/i })).toBeVisible()
    await expect(status.locator('span').filter({ hasText: /^11\s+(Chars|字符)$/i })).toBeVisible()
  })
})
