import type { Locator, Page } from '@playwright/test'
import { utils, write } from 'xlsx'
// eslint-disable-next-line no-restricted-imports -- Browser-only renderer regression fixture.
import { test, expect } from './rendererTest.js'

const workbookPath = 'docs/performance/rules/管理岗位评分规则.xlsx'
const workbook = utils.book_new()
utils.book_append_sheet(
  workbook,
  utils.aoa_to_sheet(
    Array.from({ length: 201 }, (_, index) => [
      `Row ${String(index + 1).padStart(3, '0')}`,
      `Description ${index + 1}`,
      index + 1,
      'Reviewed',
    ]),
  ),
  'Scores',
)

test.use({
  documents: {
    'docs/performance/README.md': '# Performance\n\n[Workbook](rules/管理岗位评分规则.xlsx)\n',
    [workbookPath]: new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' })),
  },
  initialFile: 'docs/performance/README.md',
})

const width = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Expected visible element geometry')
  return box.width
}

const height = async (element: Locator) => {
  const box = await element.boundingBox()
  if (!box) throw new Error('Expected visible element geometry')
  return box.height
}

const dragHorizontally = async (page: Page, handle: Locator, delta: number) => {
  const box = await handle.boundingBox()
  if (!box) throw new Error('Expected visible resize handle')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + delta, y, { steps: 8 })
  await page.mouse.up()
}

const capture = async (page: Page, name: string) => {
  const output = test.info().outputPath(`${name}.png`)
  await page.screenshot({ path: output })
  await test.info().attach(name, { path: output, contentType: 'image/png' })
}

test('opens a local Chinese workbook link before its lazy directory is expanded', async ({
  session: { page },
}) => {
  // The explorer stays collapsed: only the initial tree projection is loaded.
  await page.getByRole('link', { name: 'Workbook', exact: true }).click({
    modifiers: ['ControlOrMeta'],
  })

  await expect
    .poll(() => decodeURIComponent(new URL(page.url()).hash))
    .toContain(`/files/preview/${workbookPath}`)
  const grid = page.getByRole('grid')
  await expect(grid).toBeVisible()
  await expect(grid).toContainText('Row 001')
  await expect(page.getByRole('heading', { name: /^(File not found|未找到文件)$/ })).toHaveCount(0)
})

test('switches Markdown content between standard and full-view widths', async ({
  session: { page },
}) => {
  const heading = page.getByRole('heading', { name: 'Performance', exact: true })
  const standard = await width(heading)
  expect(standard).toBeLessThanOrEqual(780)
  const chooseWidth = async (option: RegExp) => {
    await page.keyboard.press('ControlOrMeta+Comma')
    const settings = page.getByRole('dialog')
    await settings.getByRole('tab', { name: /^(Editing|编辑)$/ }).click()
    await settings.getByRole('combobox', { name: /Content width|正文宽度/ }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await settings.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(settings).toHaveCount(0)
  }
  await chooseWidth(/Fill view|撑满视图/)
  await expect.poll(() => width(heading)).toBeGreaterThan(standard + 100)
  await chooseWidth(/Standard|标准/)
  await expect.poll(() => width(heading)).toBeCloseTo(standard, 0)
})

test('resizes expanded workbook windows and columns while preserving widths across pages', async ({
  session: { page },
}) => {
  await page.getByRole('button', { name: /^(Preview|预览): Workbook$/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Workbook', exact: true })
  await expect(dialog).toBeVisible()
  const grid = dialog.getByRole('grid')
  await expect(grid).toContainText('Row 001')
  expect(await width(dialog)).toBeGreaterThan(page.viewportSize()!.width * 0.85)
  const desktop = page.viewportSize()!
  await page.setViewportSize({ width: 900, height: 700 })
  await expect.poll(() => width(dialog)).toBeCloseTo(900 * 0.92, 0)
  await expect.poll(() => height(dialog)).toBeCloseTo(700 * 0.92, 0)
  await page.setViewportSize(desktop)
  await expect.poll(() => width(dialog)).toBeCloseTo(desktop.width * 0.92, 0)
  const resize = dialog.locator('[role="separator"][data-resize-direction="e"]')
  await expect(resize).toHaveAccessibleName(/^(Resize preview width|调整预览宽度)$/)
  const initial = await width(dialog)
  await dragHorizontally(page, resize, -140)
  await expect.poll(() => width(dialog)).toBeLessThan(initial - 200)
  const narrowed = await width(dialog)
  await resize.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => width(dialog)).toBeCloseTo(narrowed + 16, 0)
  await page.keyboard.press('End')
  await expect.poll(() => width(dialog)).toBeCloseTo(page.viewportSize()!.width * 0.96, 0)

  const beforeCorner = { width: await width(dialog), height: await height(dialog) }
  const corner = await dialog.locator('[data-resize-direction="se"]').boundingBox()
  if (!corner) throw new Error('Expected visible corner resize handle')
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
  await page.mouse.down()
  await page.mouse.move(corner.x + corner.width / 2 - 60, corner.y + corner.height / 2 - 40, {
    steps: 8,
  })
  await page.mouse.up()
  await expect.poll(() => width(dialog)).toBeLessThan(beforeCorner.width - 100)
  await expect.poll(() => height(dialog)).toBeLessThan(beforeCorner.height - 60)

  const column = grid.getByRole('columnheader', { name: 'A', exact: true })
  expect(await width(column)).toBeGreaterThanOrEqual(200)
  const initialColumn = await width(column)
  await dragHorizontally(page, column.locator('.rdg-resize-handle'), 100)
  await expect.poll(() => width(column)).toBeGreaterThan(initialColumn + 75)
  const resizedColumn = await width(column)
  await dialog.getByRole('button', { name: /^(Next|下一页)$/ }).click()
  await expect(grid).toContainText('Row 201')
  await expect.poll(() => width(column)).toBeCloseTo(resizedColumn, 0)
  await dialog.getByRole('button', { name: /^(Previous|上一页)$/ }).click()
  await expect(grid).toContainText('Row 001')
  await expect.poll(() => width(column)).toBeCloseTo(resizedColumn, 0)
  await capture(page, 'spreadsheet-desktop')

  await page.setViewportSize({ width: 760, height: 700 })
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
      }),
    )
    .toBe(true)
  await resize.focus()
  await page.keyboard.press('Home')
  await expect.poll(() => width(dialog)).toBeCloseTo(480, 0)
  await page.keyboard.press('End')
  await expect.poll(() => width(dialog)).toBeCloseTo(760 * 0.96, 0)
  await capture(page, 'spreadsheet-small-window')
})
