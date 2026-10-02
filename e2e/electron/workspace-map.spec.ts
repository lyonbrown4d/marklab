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

type LayoutFrame = Record<string, string>

type LayoutCaptureWindow = Window & {
  workspaceMapLayoutCapture?: {
    done: boolean
    frames: LayoutFrame[]
  }
}

const startLayoutCapture = async (page: Page) => {
  await page.evaluate(() => {
    const rendererWindow = window as LayoutCaptureWindow
    const capture = { done: false, frames: [] as LayoutFrame[] }
    rendererWindow.workspaceMapLayoutCapture = capture

    const sample = () => {
      const nodes = [
        ...document.querySelectorAll<HTMLElement>('.workspace-map-canvas .react-flow__node'),
      ]
      if (nodes.length > 0) {
        capture.frames.push(
          Object.fromEntries(nodes.map((node) => [node.dataset.id ?? '', node.style.transform])),
        )
      }
      if (capture.frames.length >= 6) {
        capture.done = true
        return
      }
      window.requestAnimationFrame(sample)
    }

    window.requestAnimationFrame(sample)
  })
}

const readLayoutCapture = (page: Page) =>
  page.evaluate(() => (window as LayoutCaptureWindow).workspaceMapLayoutCapture)

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

  test('renders a stable single-node map and opens its embedded editor', async () => {
    const tabsDock = page.getByTestId('tabs-dock')
    await expect(tabsDock).toBeVisible()
    await startLayoutCapture(page)

    const mapSwitch = page.getByRole('radio', { name: /^(Map|地图)$/i })
    await expect(mapSwitch).toBeVisible({ timeout: 10_000 })
    await mapSwitch.click()

    await expect(tabsDock).toHaveCount(0)
    const canvas = page.getByLabel(/Workspace map canvas|工作区地图画布/i)
    await expect(canvas).toBeVisible({ timeout: 15_000 })
    await expect
      .poll(async () => (await readLayoutCapture(page))?.done ?? false, { timeout: 10_000 })
      .toBe(true)

    const capture = await readLayoutCapture(page)
    expect(capture?.frames).toHaveLength(6)
    expect(new Set(capture?.frames.map((frame) => JSON.stringify(frame))).size).toBe(1)

    await expect(canvas.locator('.react-flow__node')).toHaveCount(1)
    await expect(canvas.locator('.react-flow__minimap')).toHaveCount(0)
    await expectNoHorizontalOverflow(page)

    await canvas.getByRole('button', { name: /Untitled/i }).click()

    const embeddedEditor = page.getByTestId('workspace-map-editor-surface')
    await expect(embeddedEditor).toBeVisible({ timeout: 15_000 })
    await expect(embeddedEditor).toHaveAccessibleName(/Editing Untitled|正在编辑 Untitled/i)
    await expect(embeddedEditor.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 })
    await expectNoHorizontalOverflow(page)
  })
})
