import { expect, type Locator, type Page } from '@playwright/test'

export const revealDockTabs = async (tab: Locator) => {
  const panelId = await tab.getAttribute('data-tab-panel-id')
  if (!panelId) throw new Error('Native tab has no panel identity')
  const target = tab.page().locator(`[data-tab-panel-id="${panelId}"]`)
  const group = target.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " dv-groupview ")]',
  )
  const show = group.getByRole('button', { name: /^Show open files:/ })
  if (await show.isVisible()) await show.click()
  const pin = group.getByRole('button', { name: 'Keep tabs open', exact: true })
  if (await pin.isVisible()) await pin.click()
  await expect(group.getByRole('button', { name: 'Collapse tabs', exact: true })).toBeVisible()
  await expect(target).toBeVisible()
  return target
}

export const expectFloatingDisclosure = async (page: Page) => {
  const show = page.getByRole('button', { name: 'Show open files: Alpha', exact: true })
  const pane = page.locator('[data-workbench-pane]:visible')
  await page.evaluate(() => document.fonts.ready)
  await expect
    .poll(() =>
      pane.evaluate((element) => {
        for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
          if (
            ancestor
              .getAnimations()
              .some(
                (animation) =>
                  animation.playState === 'running' &&
                  animation.effect?.getComputedTiming().iterations !== Infinity,
              )
          )
            return false
        }
        return true
      }),
    )
    .toBe(true)
  const before = (await pane.boundingBox())!
  await expect(show).toHaveAttribute('aria-expanded', 'false')
  await show.hover()
  const pin = page.getByRole('button', { name: 'Keep tabs open', exact: true })
  await expect(pin).toBeVisible()
  await pin.click()
  const collapse = page.getByRole('button', { name: 'Collapse tabs', exact: true })
  await expect(collapse).toBeVisible()
  await collapse.focus()
  await page.keyboard.press('Escape')
  await expect(show).toBeVisible()
  await expect(show).toBeFocused()
  const after = (await pane.boundingBox())!
  for (const dimension of ['x', 'y', 'width', 'height'] as const)
    expect(Math.abs(after[dimension] - before[dimension])).toBeLessThanOrEqual(1)
}

export const tabs = (page: Page, name: string) =>
  page.locator('.dv-tab').filter({ has: page.locator(`[title="${name}"]`) })
export const visiblePanes = (page: Page) => page.locator('[data-workbench-pane]:visible')
export const activeEditor = (page: Page) =>
  page.locator('[data-workbench-pane][data-pane-active="true"]').getByTestId('markdown-editor')
export const tabMenu = async (page: Page, tab: Locator, action: string) => {
  const target = await revealDockTabs(tab)
  await target.click({ button: 'right' })
  await page.getByRole('menuitem', { name: action, exact: true }).click()
  await expect(page.getByRole('menu')).toHaveCount(0)
}
export const append = async (page: Page, text: string) => {
  const editor = activeEditor(page)
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await editor.focus()
  await expect(editor).toBeFocused()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.type(text)
  await expect(editor).toContainText(text)
}
export const openFromExplorer = async (page: Page, name: string) => {
  const explorer = page.getByRole('region', { name: 'Files', exact: true })
  if (!(await explorer.isVisible())) await page.keyboard.press('ControlOrMeta+Shift+L')
  await explorer.getByRole('button', { name, exact: true }).click()
  await expect(activeEditor(page)).toContainText(name.replace('.md', ''))
}
export const pointerDrag = async (
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 12, from.y + 8, { steps: 4 })
  await page.mouse.move(to.x, to.y, { steps: 20 })
  await page.mouse.up()
}
