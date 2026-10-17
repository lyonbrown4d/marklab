/* eslint-disable no-restricted-imports -- Renderer E2E helpers are test-only sibling modules. */
import { test, expect } from './rendererTest.js'
/* eslint-enable no-restricted-imports */

test('initializes the production renderer and its named Tauri adapter', async ({ session }) => {
  const { page } = session
  await expect(page).toHaveTitle(/marklab/i)
  expect(
    await page.evaluate(() => ({
      adapter: typeof window.marklabTauri?.commands.invoke,
      genericNode: 'require' in window || 'ipcRenderer' in window,
    })),
  ).toEqual({ adapter: 'function', genericNode: false })
  expect(session.backend.phases.some((signal) => signal.phase === 'workspace-interactive')).toBe(
    true,
  )
})

test('opens modal shells promptly without blank first paint', async ({ session: { page } }) => {
  const commandStartedAt = Date.now()
  await page.keyboard.press('ControlOrMeta+P')
  const command = page.getByRole('dialog', { name: /Command palette|命令面板/i })
  await expect(command).toBeVisible({ timeout: 2_000 })
  expect(Date.now() - commandStartedAt).toBeLessThan(2_000)
  await expect(command.getByRole('combobox')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(command).toBeHidden()
  const settingsStartedAt = Date.now()
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.getByRole('dialog', { name: /Settings|设置/i })
  await expect(settings).toBeVisible({ timeout: 2_000 })
  expect(Date.now() - settingsStartedAt).toBeLessThan(2_000)
  await expect(settings.getByRole('tablist', { name: /Settings|设置/i })).toBeVisible()
})

test('keeps settings centered in the browser viewport', async ({ session: { page } }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.getByRole('dialog', { name: /Settings|设置/i })
  await expect(settings).toBeVisible()
  await expect
    .poll(() =>
      settings.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return Math.max(
          Math.abs(box.x - (innerWidth - box.width) / 2),
          Math.abs(box.y - (innerHeight - box.height) / 2),
        )
      }),
    )
    .toBeLessThanOrEqual(1)
})

test('uses the shared contextual-menu surface', async ({ session: { page } }) => {
  await page.getByRole('button', { name: /^Workspace:|^工作区:/i }).click()
  const menu = page.getByRole('menu').first()
  await expect(menu).toBeVisible()
  expect(
    await menu.evaluate((element) => ({
      backdropFilter: getComputedStyle(element).backdropFilter,
      borderRadius: getComputedStyle(element).borderRadius,
    })),
  ).toEqual({ backdropFilter: 'blur(16px)', borderRadius: '12px' })
  expect(
    await menu
      .getByRole('menuitem')
      .first()
      .evaluate((element) => ({
        borderRadius: getComputedStyle(element).borderRadius,
        fontSize: getComputedStyle(element).fontSize,
      })),
  ).toEqual({ borderRadius: '8px', fontSize: '13px' })
})

test('toggles the bottom status bar through its edge handle', async ({ session: { page } }) => {
  const status = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
  const hide = page.getByRole('button', { name: /Hide status bar|隐藏状态栏/i })
  await expect(status).toBeVisible()
  await expect(hide).toHaveAttribute('aria-expanded', 'true')
  await hide.click()
  await expect(status).toBeHidden()
  const show = page.getByRole('button', { name: /Show status bar|显示状态栏/i })
  await expect(show).toHaveAttribute('aria-expanded', 'false')
  await show.click()
  await expect(status).toBeVisible()
})

test('makes the read-only toggle visibly switch and prevents typing', async ({
  session: { page },
}) => {
  const editor = page.getByTestId('markdown-editor')
  const toggle = page
    .getByRole('contentinfo', { name: /Status bar|状态栏/i })
    .locator('button[data-read-only]')
  await expect(toggle).toHaveAccessibleName(/Enter read-only browsing|进入只读浏览/i)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAccessibleName(/Resume editing|退出只读浏览/i)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(editor).toHaveAttribute('contenteditable', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(editor).toHaveAttribute('contenteditable', 'true')
})
