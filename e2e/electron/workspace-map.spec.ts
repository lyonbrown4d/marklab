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
    await expect(statusBar.getByText(/\d+\s+(lines|行)$/i)).toHaveCount(1)
    await expect(statusBar.getByText(/\d+\s+(words|词)$/i)).toHaveCount(1)
    await expect(statusBar.getByText(/\d+\s+(chars|字符)$/i)).toHaveCount(1)

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
})
