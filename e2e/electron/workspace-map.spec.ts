import { expect, test, type Locator, type Page } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

type ElementBox = NonNullable<Awaited<ReturnType<Locator['boundingBox']>>>

const readBox = async (locator: Locator): Promise<ElementBox> => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('Expected a visible element with measurable geometry')
  return box
}

const expectStableBox = (before: ElementBox, after: ElementBox) => {
  expect(after.x).toBeCloseTo(before.x, 0)
  expect(after.y).toBeCloseTo(before.y, 0)
  expect(after.width).toBeCloseTo(before.width, 0)
  expect(after.height).toBeCloseTo(before.height, 0)
}

const expectBoxInside = (inner: ElementBox, outer: ElementBox) => {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x - 1)
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1)
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width + 1)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1)
}

const expectNoHorizontalOverflow = async (page: Page) => {
  const metrics = await page.evaluate(() => ({
    bodyClientWidth: document.body.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    rootClientWidth: document.documentElement.clientWidth,
    rootScrollWidth: document.documentElement.scrollWidth,
  }))

  expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.rootClientWidth)
  expect(metrics.bodyScrollWidth).toBeLessThanOrEqual(metrics.bodyClientWidth)
}

test.describe('Workspace map', () => {
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
    await page.setViewportSize({ width: 1280, height: 900 })
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('keeps the native editor stable, zoomable, responsive, and represented once', async () => {
    const tabsDock = page.getByTestId('tabs-dock')
    await expect(tabsDock).toBeVisible()

    const mapSwitch = page.getByRole('radio', { name: /^(Map|地图)$/i })
    await expect(mapSwitch).toBeVisible({ timeout: 10_000 })
    await mapSwitch.click()

    await expect(tabsDock).toHaveCount(0)
    const canvas = page.getByLabel(/Workspace map canvas|工作区地图画布/i)
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    const editorSurface = page.getByTestId('workspace-map-editor-surface')
    await expect(editorSurface).toBeVisible({ timeout: 15_000 })
    await expect(editorSurface).toHaveAccessibleName(/Untitled/i)
    await expect(editorSurface).toHaveAttribute('data-editor-active', 'false')

    const zoomIn = canvas.getByRole('button', { name: /Zoom in/i })
    const zoomOut = canvas.getByRole('button', { name: /Zoom out/i })
    const fitView = canvas.getByRole('button', { name: /Fit view/i })
    await expect(zoomIn).toBeVisible()
    await expect(zoomOut).toBeVisible()
    await expect(fitView).toBeVisible()

    const fittedEditorBox = await readBox(editorSurface)
    await canvas.focus()
    await page.keyboard.press('ControlOrMeta+=')
    await expect
      .poll(async () => (await readBox(editorSurface)).width)
      .toBeGreaterThan(fittedEditorBox.width)
    await page.keyboard.press('0')
    await expect
      .poll(async () => (await readBox(editorSurface)).width)
      .toBeCloseTo(fittedEditorBox.width, 0)

    const documentPreview = editorSurface.getByTestId('workspace-map-document-preview')
    const editor = editorSurface.getByRole('textbox')
    await expect(documentPreview).toBeVisible()
    await expect(editor).toHaveCount(0)
    const canvasBeforeActivation = await readBox(canvas)
    const editorBeforeActivation = await readBox(editorSurface)
    await editorSurface.click()

    await expect(editorSurface).toHaveAttribute('data-editor-active', 'true')
    await expect(editorSurface).toHaveAccessibleName(/Editing Untitled|正在编辑 Untitled/i)
    await expect(documentPreview).toHaveCount(0)
    await expect(editor).toHaveCount(1)
    await expect(editor).toHaveAttribute('contenteditable', 'true')
    await expect(editor).toBeFocused()
    expectStableBox(canvasBeforeActivation, await readBox(canvas))
    const editorAfterActivation = await readBox(editorSurface)
    expect(editorAfterActivation.width).toBeGreaterThan(editorBeforeActivation.width)
    expect(editorAfterActivation.height).toBeGreaterThan(editorBeforeActivation.height)

    const statusBar = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
    if (!(await statusBar.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Show status bar|显示状态栏/i }).click()
    }
    await expect(statusBar).toBeVisible()

    if (!session) throw new Error('Electron test session is unavailable')
    await revealElectronWindow(session.app, page, { width: 720, height: 640 })
    await expect
      .poll(async () => {
        const inner = await readBox(editorSurface)
        const outer = await readBox(canvas)
        return inner.x + inner.width <= outer.x + outer.width + 1
      })
      .toBe(true)
    await expectBoxInside(await readBox(editorSurface), await readBox(canvas))
    await expectNoHorizontalOverflow(page)
  })

  test('keeps a long embedded document inside the React Flow node viewport', async () => {
    const pageEditor = page.getByTestId('markdown-editor')
    const longDocument = Array.from(
      { length: 180 },
      (_, index) => `Workspace map viewport regression line ${index + 1}`,
    ).join('\n')
    await pageEditor.click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(longDocument)
    await expect(pageEditor).toContainText('Workspace map viewport regression line 180')

    await page.getByRole('radio', { name: /^(Map|地图)$/i }).click()
    const editorSurface = page.getByTestId('workspace-map-editor-surface')
    await expect(editorSurface).toBeVisible({ timeout: 15_000 })
    await editorSurface.click()
    await expect(editorSurface).toHaveAttribute('data-editor-active', 'true')
    const embeddedViewport = editorSurface.getByTestId('workspace-map-editor-viewport')
    const embeddedGeometry = await embeddedViewport.evaluate((viewport) => {
      const editorRoot = viewport.firstElementChild
      const plateShell = editorRoot?.firstElementChild
      const scrollSurface = viewport.querySelector<HTMLElement>('[data-testid="markdown-editor"]')
      return {
        contain: getComputedStyle(viewport).contain,
        editorRootHeight: editorRoot?.getBoundingClientRect().height ?? 0,
        plateShellHeight: plateShell?.getBoundingClientRect().height ?? 0,
        scrollClientHeight: scrollSurface?.clientHeight ?? 0,
        scrollHeight: scrollSurface?.scrollHeight ?? 0,
        viewportHeight: viewport.getBoundingClientRect().height,
      }
    })
    expect(embeddedGeometry.contain).toBe('strict')
    expect(embeddedGeometry.editorRootHeight).toBeCloseTo(embeddedGeometry.viewportHeight, 0)
    expect(embeddedGeometry.plateShellHeight).toBeCloseTo(embeddedGeometry.viewportHeight, 0)
    expect(embeddedGeometry.scrollClientHeight).toBeCloseTo(embeddedGeometry.viewportHeight, 0)
    expect(embeddedGeometry.scrollHeight).toBeGreaterThan(embeddedGeometry.scrollClientHeight)

    const scrollSurface = embeddedViewport.getByTestId('markdown-editor')
    const flowViewport = page.locator('.react-flow__viewport')
    await expect
      .poll(async () => flowViewport.getAttribute('style'))
      .not.toBe('transform: translate(0px, 0px) scale(1);')
    const canvasTransformBeforeScroll = await flowViewport.getAttribute('style')
    const scrollTopBefore = await scrollSurface.evaluate((element) => element.scrollTop)
    await scrollSurface.hover()
    await page.mouse.wheel(0, 480)

    await expect
      .poll(async () => scrollSurface.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(scrollTopBefore)
    expect(await flowViewport.getAttribute('style')).toBe(canvasTransformBeforeScroll)
  })
})
