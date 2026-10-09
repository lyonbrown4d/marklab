import { expect, test } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Runtime diagnostics stay outside production bundles.
import {
  assertNoRuntimeErrors,
  attachDiagnostics,
  monitorRuntime,
} from './electronRuntimeDiagnostics.js'
// eslint-disable-next-line no-restricted-imports -- Scenario helpers stay outside production bundles.
import {
  createInteractionWorkspace,
  invokeInteractionCommand,
  openInteractionFile,
  openInteractionWorkspace,
  readMapScale,
  readMapViewport,
  removeInteractionWorkspace,
  waitForMapScaleToSettle,
} from './interactionContinuityHarness.js'

test.describe('Interaction continuity acceptance', () => {
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined
  let workspaceRoot: string | undefined

  test.beforeAll(async () => {
    workspaceRoot = createInteractionWorkspace()
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.beforeEach(async () => {
    session = await launchElectronTestSession(rendererUrl)
    await revealElectronWindow(session.app, session.page, { height: 900, width: 1280 })
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test.afterEach(async ({}, testInfo) => {
    await closeElectronTestSession(session)
    session = undefined
    await testInfo.attach('workspace-root.txt', {
      body: workspaceRoot ?? '(missing)',
      contentType: 'text/plain',
    })
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeInteractionWorkspace(workspaceRoot)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('restores navigation history, MRU tabs, and recent locations', async ({}, testInfo) => {
    if (!session) throw new Error('Electron test session is unavailable')
    await openInteractionWorkspace(session, workspaceRoot!)
    const diagnostics = monitorRuntime(session)
    const page = session.page
    try {
      await openInteractionFile(page, 'Home.md')
      await expect(page.getByTestId('markdown-editor')).toContainText('Home continuity marker')
      await openInteractionFile(page, 'Topic.md')
      await expect(page.getByTestId('markdown-editor')).toContainText('Topic continuity marker')

      await page.getByRole('button', { name: /^(Workspace|工作区):/i }).focus()
      await page.keyboard.press('Alt+ArrowLeft')
      await expect(page.getByTestId('markdown-editor')).toContainText('Home continuity marker')
      await page.getByRole('button', { name: /^(Workspace|工作区):/i }).focus()
      await page.keyboard.press('Alt+ArrowRight')
      await expect(page.getByTestId('markdown-editor')).toContainText('Topic continuity marker')
      await page.keyboard.press('Control+Tab')
      await expect(page.getByTestId('markdown-editor')).toContainText('Home continuity marker')

      await page.keyboard.down('Shift')
      await page.keyboard.up('Shift')
      await page.evaluate(() => new Promise(requestAnimationFrame))
      await page.keyboard.down('Shift')
      await page.keyboard.up('Shift')
      const palette = page.getByRole('dialog', { name: /Command palette|命令面板/i })
      await expect(palette).toBeVisible()
      await expect(palette.getByText(/Home\.md/i).first()).toBeVisible()
      await expect(palette.getByText(/Topic\.md/i).first()).toBeVisible()
      assertNoRuntimeErrors(diagnostics)
    } finally {
      await attachDiagnostics(session, diagnostics, testInfo)
    }
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('keeps graph zoom, focus, LOD, and toolbar navigation predictable', async ({}, testInfo) => {
    if (!session) throw new Error('Electron test session is unavailable')
    await openInteractionWorkspace(session, workspaceRoot!)
    const diagnostics = monitorRuntime(session)
    const page = session.page
    try {
      await expect
        .poll(async () => {
          const graph = await invokeInteractionCommand<{ nodes: unknown[] }>(
            page,
            'fs_get_workspace_graph',
          )
          return graph.nodes.length
        })
        .toBeGreaterThanOrEqual(12)
      await page.getByRole('radio', { name: /^(Map|地图)$/i }).click()
      const canvas = page.getByLabel(/Workspace map canvas|工作区地图画布/i)
      await expect(canvas).toBeVisible({ timeout: 30_000 })
      const toolbar = page.getByRole('toolbar', { name: /Workspace map toolbar|工作区图工具栏/i })
      const search = toolbar.getByRole('button', { name: /Find a node|查找节点/i })
      await search.focus()
      await page.keyboard.press('ArrowRight')
      await expect(toolbar.getByRole('button', { name: /Focus mode|聚焦/i })).toBeFocused()

      const scaleBeforeZoom = await readMapScale(page)
      await canvas.getByRole('button', { name: /Zoom in|放大/i }).click()
      await expect.poll(() => readMapScale(page)).toBeGreaterThan(scaleBeforeZoom)
      const scaleBeforeReset = await readMapScale(page)
      await canvas.locator('.react-flow__pane').dblclick({ position: { x: 24, y: 72 } })
      await expect.poll(() => readMapScale(page)).toBeLessThan(scaleBeforeReset)
      await waitForMapScaleToSettle(page)

      const homeNode = canvas.locator('.react-flow__node[data-id="file:Home.md"]')
      const viewportBeforeFocus = await readMapViewport(page)
      const transformBeforeFocus = await page.locator('.react-flow__viewport').getAttribute('style')
      await homeNode.focus()
      await page.keyboard.press('f')
      await expect
        .poll(() => page.locator('.react-flow__viewport').getAttribute('style'))
        .not.toBe(transformBeforeFocus)
      await waitForMapScaleToSettle(page)
      await canvas.focus()
      await page.keyboard.press('Escape')
      await expect
        .poll(async () => {
          const viewport = await readMapViewport(page)
          return Math.max(
            Math.abs(viewport.x - viewportBeforeFocus.x),
            Math.abs(viewport.y - viewportBeforeFocus.y),
            Math.abs(viewport.zoom - viewportBeforeFocus.zoom),
          )
        })
        .toBeLessThan(0.5)

      await canvas.focus()
      await page.keyboard.press('-')
      await page.keyboard.press('-')
      await page.keyboard.press('-')
      await expect
        .poll(() => canvas.evaluate((element) => element.parentElement?.dataset.viewportLod))
        .toMatch(/far|mid/)
      await expect(canvas.getByLabel(/navigation minimap|导航小地图/i)).toBeVisible()
      assertNoRuntimeErrors(diagnostics)
    } finally {
      await attachDiagnostics(session, diagnostics, testInfo)
    }
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('preserves the active surface during loading and cycles application focus', async ({}, testInfo) => {
    if (!session) throw new Error('Electron test session is unavailable')
    await openInteractionWorkspace(session, workspaceRoot!)
    const diagnostics = monitorRuntime(session)
    const page = session.page
    try {
      await openInteractionFile(page, 'Home.md')
      const transition = page.locator('[data-editor-transition-phase]')
      await expect(page.getByTestId('markdown-editor')).toContainText('Home continuity marker')
      await openInteractionFile(page, 'Large.md')
      await expect
        .poll(
          () =>
            transition.evaluate((element) => {
              const editor = element.querySelector('[data-testid="markdown-editor"]')
              if (editor?.textContent?.includes('Large document interaction line 4000')) {
                return 'ready'
              }
              const content = element.querySelector('[data-testid="editor-transition-content"]')
              const phase = element.getAttribute('data-editor-transition-phase')
              const preserved =
                /^(loading|parsing|restoring)$/.test(phase ?? '') &&
                content?.hasAttribute('inert') &&
                content.textContent?.includes('Home continuity marker')
              return preserved ? 'preserved' : 'pending'
            }),
          { timeout: 30_000 },
        )
        .toMatch(/^(preserved|ready)$/)
      await expect(page.getByTestId('markdown-editor')).toContainText(
        'Large document interaction line 4000',
        { timeout: 30_000 },
      )

      const workspaceButton = page.getByRole('button', { name: /^(Workspace|工作区):/i })
      await workspaceButton.focus()
      await page.keyboard.press('F6')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.activeElement?.closest<HTMLElement>('[data-app-focus-zone]')?.dataset
                .appFocusZone,
          ),
        )
        .toBe('editor')
      await page.keyboard.press('Shift+F6')
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.activeElement?.closest<HTMLElement>('[data-app-focus-zone]')?.dataset
                .appFocusZone,
          ),
        )
        .toBe('titlebar')

      const statusCenter = page.getByRole('button', { name: /Status center|状态中心/i })
      await statusCenter.click()
      const dialog = page.getByRole('dialog', { name: /Status center|状态中心/i })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText(/Background tasks|后台任务/i)).toBeVisible()
      await expect(
        dialog.getByText(/Active buffer|Current buffer|活动缓冲区|当前缓冲区/i),
      ).toBeVisible()
      await page.keyboard.press('ControlOrMeta+Shift+B')
      await expect(dialog).toBeHidden()
      const statusBarEdge = page.locator('[data-status-bar-edge-handle]')
      await expect(statusBarEdge).toHaveAttribute('aria-expanded', 'false')
      await expect(statusBarEdge).toBeFocused()
      assertNoRuntimeErrors(diagnostics)
    } finally {
      await attachDiagnostics(session, diagnostics, testInfo)
    }
  })
})
