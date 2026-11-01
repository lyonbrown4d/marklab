import fs from 'node:fs/promises'
/* eslint-disable no-restricted-imports -- Production renderer acceptance reuses test-only fixtures. */
import { test, expect } from './rendererTest.js'
import {
  tabs,
  visiblePanes,
  activeEditor,
  tabMenu,
  append,
  openFromExplorer,
  pointerDrag,
  revealDockTabs,
  expectFloatingDisclosure,
} from './workbenchDriver.js'
import { flushRendererFixture } from './rendererHarness.js'
import {
  attachLayoutFixtureDiagnostics,
  trackWorkbenchRoutes,
  captureWorkbenchLayout,
  workbenchGroupProportions,
  expectDockContentFits,
} from './workbenchLayout.js'
/* eslint-enable no-restricted-imports */

const alphaDocument = '# Alpha\n\nAlpha original.\n\nIndependent last paragraph.\n'

test.use({
  documents: {
    'Alpha.md': alphaDocument,
    'Beta.md': '# Beta\n\nBeta original.\n',
  },
  initialFile: 'Alpha.md',
})

test.beforeEach(async ({ session: { page } }) => trackWorkbenchRoutes(page))
test.afterEach(async ({ session }, info) => attachLayoutFixtureDiagnostics(session, info))

test("splits right and down, restores native layout and saves shared document content to each file's own path", async ({
  session: { page, backend },
}, info) => {
  await expect(visiblePanes(page)).toHaveCount(1)
  await expectFloatingDisclosure(page)
  await tabMenu(page, tabs(page, 'Alpha.md'), 'Split Right')
  await expect(visiblePanes(page)).toHaveCount(2)
  await expectDockContentFits(page)
  const alphaEditors = page.getByTestId('markdown-editor').filter({ visible: true })
  await expect(alphaEditors).toHaveCount(2)
  const left = (await alphaEditors.nth(0).boundingBox())!
  const right = (await alphaEditors.nth(1).boundingBox())!
  expect(right.x).toBeGreaterThan(left.x + left.width / 2)
  await append(page, ' Shared edit from right.')
  await expect(alphaEditors.nth(0)).toContainText('Shared edit from right.')
  await expect(alphaEditors.nth(1)).toContainText('Shared edit from right.')

  await alphaEditors.nth(0).getByRole('heading', { name: 'Alpha', exact: true }).click()
  await expect(activeEditor(page)).toHaveCount(1)
  await page.keyboard.press('Home')
  const leftPaneId = await activeEditor(page).evaluate((element) =>
    element.closest('[data-workbench-pane]')?.getAttribute('data-workbench-pane'),
  )
  await alphaEditors.nth(1).getByText('Independent last paragraph.', { exact: false }).click()
  await page.keyboard.press('End')
  await alphaEditors.nth(0).getByRole('heading', { name: 'Alpha', exact: true }).click()
  await expect
    .poll(() =>
      activeEditor(page).evaluate((element) =>
        element.closest('[data-workbench-pane]')?.getAttribute('data-workbench-pane'),
      ),
    )
    .toBe(leftPaneId)

  await openFromExplorer(page, 'Beta.md')
  await append(page, ' Beta-only edit.')
  await tabMenu(page, tabs(page, 'Beta.md'), 'Split Down')
  await expect(visiblePanes(page)).toHaveCount(3)
  await expectDockContentFits(page)
  const betaEditors = page
    .getByTestId('markdown-editor')
    .filter({ hasText: 'Beta original.' })
    .filter({ visible: true })
  await expect(betaEditors).toHaveCount(2)
  const upper = (await betaEditors.nth(0).boundingBox())!
  const lower = (await betaEditors.nth(1).boundingBox())!
  expect(Math.abs(lower.x - upper.x)).toBeLessThan(5)
  expect(lower.y).toBeGreaterThan(upper.y + upper.height / 2)
  await append(page, ' Bottom edit.')
  await expect(betaEditors.nth(0)).toContainText('Bottom edit.')
  await expect
    .poll(async () => (await backend.buffers.snapshot('Alpha.md')).content)
    .toContain('Shared edit from right.')
  await expect
    .poll(async () => (await backend.buffers.snapshot('Beta.md')).content)
    .toContain('Bottom edit.')
  await flushRendererFixture(page)
  const alpha = await fs.readFile(backend.buffers.target('Alpha.md'), 'utf8')
  const beta = await fs.readFile(backend.buffers.target('Beta.md'), 'utf8')
  expect(alpha).not.toContain('Beta-only edit.')
  expect(alpha).not.toContain('Bottom edit.')
  expect(beta).toContain('Beta-only edit.')
  expect(beta).toContain('Bottom edit.')
  expect(beta).not.toContain('Shared edit from right.')
  // The backend owns layout persistence; clearing browser storage must not erase it.
  await expect.poll(() => Object.keys(backend.workspaceLayout.read()?.panels ?? {}).length).toBe(4)
  const persisted = backend.workspaceLayout.read()!
  const beforeReload = await workbenchGroupProportions(page)
  await page.evaluate(() => localStorage.clear())
  const writes = backend.workspaceLayout.writes()
  await page.reload()
  await expect(visiblePanes(page)).toHaveCount(3)
  await expect(page.getByTestId('markdown-editor').filter({ visible: true })).toHaveCount(3)
  await expectDockContentFits(page)
  expect(backend.workspaceLayout.read()).toEqual(persisted)
  expect(backend.workspaceLayout.writes()).toBe(writes)
  const restored = await workbenchGroupProportions(page)
  expect(restored).toHaveLength(beforeReload.length)
  restored.forEach((box, index) => {
    expect(box.x).toBeCloseTo(beforeReload[index].x, 3)
    expect(box.y).toBeCloseTo(beforeReload[index].y, 3)
    expect(box.width).toBeCloseTo(beforeReload[index].width, 3)
    expect(box.height).toBeCloseTo(beforeReload[index].height, 3)
  })
  await info.attach('workbench-three-panes.png', {
    body: await page.screenshot({ path: info.outputPath('workbench-three-panes.png') }),
    contentType: 'image/png',
  })

  await tabMenu(page, tabs(page, 'Beta.md').last(), 'Close All in Group')
  await expect(visiblePanes(page)).toHaveCount(2)
  await revealDockTabs(tabs(page, 'Beta.md'))
  await tabs(page, 'Beta.md')
    .getByRole('button', { name: /^Close Tab /i })
    .click()
  await expect(tabs(page, 'Beta.md')).toHaveCount(0)
  await openFromExplorer(page, 'Beta.md')
  await expect(activeEditor(page)).toContainText('Beta-only edit.')
  await expect(activeEditor(page)).toContainText('Bottom edit.')
})

test('native tab dragging creates and moves groups, and resizing preserves unsaved content', async ({
  session: { page, backend },
}, info) => {
  await expect(visiblePanes(page)).toHaveCount(1)
  await openFromExplorer(page, 'Beta.md')
  await append(page, ' Dragged draft.')
  const beta = tabs(page, 'Beta.md')
  await revealDockTabs(beta)
  const source = (await beta.boundingBox())!
  const pane = (await visiblePanes(page).boundingBox())!
  await pointerDrag(
    page,
    { x: source.x + source.width / 2, y: source.y + source.height / 2 },
    { x: pane.x + pane.width - 8, y: pane.y + pane.height / 2 },
  )
  await expect(visiblePanes(page)).toHaveCount(2)
  await expect(page.getByTestId('markdown-editor').filter({ visible: true })).toHaveCount(2)
  await expectDockContentFits(page)
  await expect(activeEditor(page)).toContainText('Dragged draft.')

  const editors = page.getByTestId('markdown-editor').filter({ visible: true })
  const before = (await editors.nth(0).boundingBox())!
  const sash = page.locator('.dv-sash-container .dv-sash:visible').first()
  const handle = (await sash.boundingBox())!
  await pointerDrag(
    page,
    { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
    { x: handle.x + 100, y: handle.y + handle.height / 2 },
  )
  await expect
    .poll(async () => Math.abs((await editors.nth(0).boundingBox())!.width - before.width))
    .toBeGreaterThan(50)
  await expectDockContentFits(page)
  await expect(activeEditor(page)).toContainText('Dragged draft.')
  await info.attach('workbench-native-drag-resize.png', {
    body: await page.screenshot({ path: info.outputPath('workbench-native-drag-resize.png') }),
    contentType: 'image/png',
  })

  await revealDockTabs(tabs(page, 'Alpha.md'))
  await revealDockTabs(beta)
  const target = (await tabs(page, 'Alpha.md').boundingBox())!
  const moved = (await beta.boundingBox())!
  await pointerDrag(
    page,
    { x: moved.x + moved.width / 2, y: moved.y + moved.height / 2 },
    { x: target.x + target.width - 5, y: target.y + target.height / 2 },
  )
  await expect(visiblePanes(page)).toHaveCount(1)
  await expect(beta).toBeVisible()
  await tabMenu(page, beta, 'Close Others')
  await expect(tabs(page, 'Alpha.md')).toHaveCount(0)
  await expect(activeEditor(page)).toContainText('Dragged draft.')
  await flushRendererFixture(page)
  expect(await fs.readFile(backend.buffers.target('Beta.md'), 'utf8')).toContain('Dragged draft.')
  expect(await fs.readFile(backend.buffers.target('Alpha.md'), 'utf8')).not.toContain(
    'Dragged draft.',
  )
})

test('splits real source editors down and right alongside WYSIWYG, sharing edits and undo after closing a copy', async ({
  session: { page, backend },
}, info) => {
  await tabMenu(page, tabs(page, 'Alpha.md'), 'Split Right')
  await page
    .getByRole('radiogroup', { name: 'Editing Mode', exact: true })
    .getByRole('radio', { name: 'Source', exact: true })
    .click()
  const sourceEditors = page.locator('.monaco-editor:visible')
  await expect(sourceEditors).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: 'Show open files: Alpha · Source', exact: true }),
  ).toBeVisible()
  const activeTab = () => page.locator('.dv-groupview.dv-active-group .dv-tab.dv-active-tab')
  await tabMenu(page, activeTab(), 'Split Down')
  await expect(sourceEditors).toHaveCount(2)
  await captureWorkbenchLayout(page, info)
  await expectDockContentFits(page)
  const top = (await sourceEditors.nth(0).boundingBox())!
  const bottom = (await sourceEditors.nth(1).boundingBox())!
  expect(bottom.y).toBeGreaterThan(top.y + top.height / 2)
  const activeSource = () =>
    page.locator('[data-workbench-pane][data-pane-active="true"] .monaco-editor')
  await expect(
    activeSource().locator('xpath=ancestor::*[contains(@class, "source-code-editor")]'),
  ).not.toHaveClass(/is-readonly-editor/)
  await activeSource().getByRole('textbox', { name: 'Editor content', exact: true }).focus()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.type('\nsource_shared_token')
  for (const source of await sourceEditors.all())
    await expect(source.locator('.view-lines')).toContainText('source_shared_token')
  await expect(page.getByTestId('markdown-editor').filter({ visible: true })).toContainText(
    'source_shared_token',
  )

  // Splitting must retain the existing shared model and its undo history.
  await tabMenu(page, activeTab(), 'Split Right')
  await expect(sourceEditors).toHaveCount(3)
  await expectDockContentFits(page)
  const splitLeft = (await sourceEditors.nth(1).boundingBox())!
  const splitRight = (await sourceEditors.nth(2).boundingBox())!
  expect(splitRight.x).toBeGreaterThan(splitLeft.x + splitLeft.width / 2)
  await info.attach('workbench-source-four-panes.png', {
    body: await page.screenshot({ path: info.outputPath('workbench-source-four-panes.png') }),
    contentType: 'image/png',
  })
  const closingSource = await revealDockTabs(activeTab())
  await closingSource.getByRole('button', { name: /^Close Tab /i }).click()
  await expect(sourceEditors).toHaveCount(2)
  await sourceEditors
    .last()
    .locator('.view-lines')
    .click({ position: { x: 80, y: 20 } })
  await expect(activeSource()).toHaveCount(1)
  await expect(
    activeSource().locator('xpath=ancestor::*[contains(@class, "source-code-editor")]'),
  ).not.toHaveClass(/is-readonly-editor/)
  await activeSource().getByRole('textbox', { name: 'Editor content', exact: true }).focus()
  await page.keyboard.press('ControlOrMeta+Z')
  for (const source of await sourceEditors.all())
    await expect(source.locator('.view-lines')).not.toContainText('source_shared_token')
  await expect(page.getByTestId('markdown-editor').filter({ visible: true })).not.toContainText(
    'source_shared_token',
  )
  await expect
    .poll(async () => (await backend.buffers.snapshot('Alpha.md')).content)
    .toBe(alphaDocument)
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
  await page.keyboard.type('\nsource_surviving_model')
  for (const source of await sourceEditors.all())
    await expect(source.locator('.view-lines')).toContainText('source_surviving_model')
  await expect
    .poll(async () => (await backend.buffers.snapshot('Alpha.md')).content)
    .toContain('source_surviving_model')
  await flushRendererFixture(page)
  expect(await fs.readFile(backend.buffers.target('Alpha.md'), 'utf8')).toContain(
    'source_surviving_model',
  )
  await expectDockContentFits(page)
  await expect.poll(() => Object.keys(backend.workspaceLayout.read()?.panels ?? {}).length).toBe(4)
  await expect(page.getByText(/Could not save the workspace layout/)).toHaveCount(0)
  await captureWorkbenchLayout(page, info)
  await info.attach('workbench-source-and-wysiwyg.png', {
    body: await page.screenshot({ path: info.outputPath('workbench-source-and-wysiwyg.png') }),
    contentType: 'image/png',
  })
})
