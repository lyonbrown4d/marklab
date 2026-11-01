import type { Page, TestInfo } from '@playwright/test'
/* eslint-disable no-restricted-imports -- Dense graph acceptance uses only test-host fixtures. */
import { test, expect } from './rendererTest.js'
import { denseDocuments, densePaths, denseGraphFixture } from './denseGraphFixture.js'
import {
  expectDockContentFits,
  attachLayoutFixtureDiagnostics,
  trackWorkbenchRoutes,
} from './workbenchLayout.js'
import { tabs, revealDockTabs, tabMenu } from './workbenchDriver.js'
/* eslint-enable no-restricted-imports */

test.use({ documents: denseDocuments, initialFile: densePaths[0] })
test.beforeEach(async ({ session: { page } }) => trackWorkbenchRoutes(page))
test.afterEach(async ({ session }, info) => attachLayoutFixtureDiagnostics(session, info))

const capture = async (page: Page, info: TestInfo, name: string) => {
  await expectDockContentFits(page)
  await info.attach(name, {
    body: await page.screenshot({ path: info.outputPath(name), animations: 'disabled' }),
    contentType: 'image/png',
  })
}
const switchTheme = async (page: Page, dark: boolean) => {
  await page.keyboard.press('ControlOrMeta+Comma')
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true })
  await settings.getByRole('tab', { name: 'Appearance', exact: true }).click()
  await settings
    .getByRole('radio', { name: dark ? 'Dark Mode' : 'Light Mode', exact: true })
    .click()
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  await expect
    .poll(() => page.locator('html').getAttribute('data-theme'))
    .toBe(dark ? 'ink' : 'paper')
}

test('keeps dense multilingual graph labels legible around icons at full and beside-editor widths in both themes', async ({
  session: { page, backend },
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(tabs(page, densePaths[0])).toHaveCount(1)
  backend.setGraph(denseGraphFixture())
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const graph = page.getByTestId('knowledge-graph')
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  await expect(graph).toHaveAttribute('data-graph-node-count', '36')
  expect(
    await graph
      .locator('canvas')
      .evaluateAll((canvases) =>
        canvases.some(
          (canvas) => canvas instanceof HTMLCanvasElement && canvas.getContext('webgl2') !== null,
        ),
      ),
  ).toBe(true)
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click()
  await capture(page, info, 'dense-labels-full-light.png')

  // Search remains lossless even when viewport labels must be shortened or hidden.
  const path = densePaths[4]
  const title = path.slice(0, -3)
  const search = graph.getByRole('textbox', { name: 'Search documents', exact: true })
  await search.fill(title)
  const result = graph.getByRole('button', { name: `${title} ${path}`, exact: true })
  await expect(result).toBeVisible()
  await result.click()
  await expect(result).toBeFocused()
  const editor = page.getByTestId('markdown-editor').filter({ visible: true })
  await expect(editor.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await search.fill('')
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click()
  expect((await graph.boundingBox())!.width).toBeLessThanOrEqual(722)
  expect((await editor.boundingBox())!.width).toBeGreaterThanOrEqual(300)
  await capture(page, info, 'dense-labels-beside-selected-light.png')

  const bounds = (await graph.getByRole('region').boundingBox())!
  await page.mouse.move(bounds.x + bounds.width * 0.6, bounds.y + bounds.height * 0.55)
  await page.keyboard.down('Control')
  try {
    await page.mouse.wheel(0, -30)
  } finally {
    await page.keyboard.up('Control')
  }
  // Camera persistence is a normal product capability, not a private renderer probe.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const value = JSON.parse(localStorage.getItem('marklab.knowledgeGraph.views') ?? '{}') as {
          state?: { entries?: { camera: { ratio: number } }[] }
        }
        return value.state?.entries?.[0]?.camera.ratio
      }),
    )
    .toBeLessThan(1)
  await capture(page, info, 'dense-labels-beside-zoom-light.png')
  await switchTheme(page, true)
  await capture(page, info, 'dense-labels-beside-zoom-dark.png')
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click()
  await capture(page, info, 'dense-labels-beside-selected-dark.png')
  await expect(editor.getByRole('heading', { name: title, exact: true })).toBeVisible()
  for (const nextPath of densePaths.slice(0, 8).filter((candidate) => candidate !== path)) {
    await search.fill(nextPath.slice(0, -3))
    await graph
      .getByRole('button', { name: `${nextPath.slice(0, -3)} ${nextPath}`, exact: true })
      .click()
    await expect(
      editor.getByRole('heading', { name: nextPath.slice(0, -3), exact: true }),
    ).toBeVisible()
  }
  await search.fill('')
  const currentPath = densePaths[7]
  const documentTab = tabs(page, currentPath)
  await revealDockTabs(documentTab)
  const group = documentTab.locator(
    'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " dv-groupview ")]',
  )
  await expect(group.getByRole('tab', { includeHidden: true })).toHaveCount(8)
  // The community SDK overflow control has no ARIA name; exercise its real popup and activation.
  const overflow = group.locator('.dv-tabs-overflow-dropdown-root')
  await expect(overflow).toBeVisible()
  const groupBox = (await group.boundingBox())!
  const headerBox = (await group.locator('.dv-tabs-and-actions-container').boundingBox())!
  const overflowBox = (await overflow.boundingBox())!
  expect(headerBox.x).toBeGreaterThanOrEqual(groupBox.x - 2)
  expect(headerBox.x + headerBox.width).toBeLessThanOrEqual(groupBox.x + groupBox.width + 2)
  expect(overflowBox.x + overflowBox.width).toBeLessThanOrEqual(groupBox.x + groupBox.width + 2)
  await expectDockContentFits(page)
  await overflow.click()
  const hiddenEntry = page.locator('.dv-tabs-overflow-container [title]').first()
  const hiddenPath = (await hiddenEntry.getAttribute('title'))!
  expect(densePaths).toContain(hiddenPath)
  await hiddenEntry.click()
  await expect(
    editor.getByRole('heading', { name: hiddenPath.slice(0, -3), exact: true }),
  ).toBeVisible()
  await expect(group.getByRole('tab', { includeHidden: true })).toHaveCount(8)
  await capture(page, info, 'dense-tabs-overflow-dark.png')
  await tabMenu(page, tabs(page, hiddenPath), 'Close All in Group')
  await expect(group).toHaveCount(0)
  await expect(page.locator('.dv-groupview')).toHaveCount(1)
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  await expect(graph).toBeVisible()
  await expect(editor).toBeHidden()
  await graph.getByRole('button', { name: 'Clear selection', exact: true }).click()
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click()
  expect((await graph.boundingBox())!.width).toBeGreaterThanOrEqual(1400)
  await capture(page, info, 'dense-labels-full-dark.png')
  await expect(page.getByText(/Could not (save|load) the workspace layout/)).toHaveCount(0)
})
