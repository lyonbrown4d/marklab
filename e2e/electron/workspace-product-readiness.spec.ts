import { expect, test, type Locator, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  snapshotStartupOpenTargetState,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  assertNoRuntimeErrors,
  attachDiagnostics,
  monitorRuntime,
} from './electronRuntimeDiagnostics.js'
// eslint-disable-next-line no-restricted-imports -- Product fixtures must stay outside production bundles.
import {
  removeWorkspaceProductFixture,
  resolveWorkspaceProductFixture,
  type WorkspaceProductFixture,
} from './workspaceProductFixture.js'

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const readScale = (canvas: Locator) =>
  canvas.evaluate((element) => {
    const viewport = element.querySelector<HTMLElement>('.react-flow__viewport')
    const transform = viewport ? window.getComputedStyle(viewport).transform : ''
    return transform && transform !== 'none' ? new DOMMatrix(transform).a : 1
  })

const openWorkspaceInNewWindow = async (
  session: ElectronTestSession,
  sourcePage: Page,
  fixture: WorkspaceProductFixture,
) => {
  await session.app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, fixture.root)
  await sourcePage.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
  await sourcePage
    .getByRole('menuitem', { name: /Open Workspace in New Window|在新窗口打开工作区/i })
    .click()

  const workspaceName = escapeRegExp(fixture.workspaceName)
  const workspaceButton = new RegExp(`^(Workspace|工作区):.*${workspaceName}`, 'i')
  let workspacePage: Page | undefined
  await expect
    .poll(
      async () => {
        for (const candidate of session.app.windows()) {
          if (await candidate.getByRole('button', { name: workspaceButton }).isVisible()) {
            workspacePage = candidate
            return true
          }
        }
        return false
      },
      { timeout: 60_000 },
    )
    .toBe(true)
  if (!workspacePage) throw new Error('The workspace window did not become available')
  return workspacePage
}

const expectNoHorizontalOverflow = async (page: Page) => {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
          document.body.scrollWidth <= document.body.clientWidth,
      ),
    )
    .toBe(true)
}

test.describe('Workspace product readiness', () => {
  let fixture: WorkspaceProductFixture
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    fixture = resolveWorkspaceProductFixture()
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspaceProductFixture(fixture)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture object destructuring.
  test('opens a workspace through the product UI and keeps its large map usable', async ({}, testInfo) => {
    session = await launchElectronTestSession(rendererUrl)
    const diagnostics = monitorRuntime(session)
    let page = session.page
    try {
      page = await openWorkspaceInNewWindow(session, page, fixture)
      await page.setViewportSize({ width: 1440, height: 960 })
      await page.getByRole('radio', { name: /^(Map|地图)$/i }).click()

      const canvas = page.getByLabel(/Workspace map canvas|工作区地图画布/i)
      await expect(canvas).toBeVisible({ timeout: 60_000 })
      const nodes = canvas.locator('.react-flow__node')
      await expect.poll(() => nodes.count(), { timeout: 60_000 }).toBeGreaterThan(10)
      await expect(page.getByRole('button', { name: /Overview mode|总览/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(page.getByRole('button', { name: /Auto arrange|自动整理/i })).toBeVisible()
      await expect
        .poll(() => canvas.locator('[data-testid^="workspace-map-group-"]').count())
        .toBeGreaterThan(0)

      const externalToggle = page.getByRole('button', {
        name: /Show.*external resources|显示.*外部资源/i,
      })
      await expect(externalToggle).toBeVisible()
      await expect(externalToggle).toContainText(/\d+/)
      await expect(canvas.locator('[data-workspace-map-kind="external"]')).toHaveCount(0)

      const collapsedNodes = canvas.locator('[data-workspace-map-collapsed="true"]')
      await expect.poll(() => collapsedNodes.count()).toBeGreaterThan((await nodes.count()) / 2)
      expect(await readScale(canvas)).toBeGreaterThanOrEqual(0.35)

      await externalToggle.click()
      await expect
        .poll(() => canvas.locator('[data-workspace-map-kind="external"]').count(), {
          timeout: 60_000,
        })
        .toBeGreaterThan(0)
      await page.getByRole('button', { name: /Hide external resources|隐藏外部资源/i }).click()
      await expect(canvas.locator('[data-workspace-map-kind="external"]')).toHaveCount(0)

      const searchName = /Find a node|Search(?: workspace)? nodes|(?:搜索|查找)(?:工作区)?节点/i
      await page.getByRole('button', { name: searchName }).click()
      const search = page.getByRole('combobox', { name: searchName })
      await search.fill('Home')
      await page.getByRole('option', { name: /Home.*Home\.md/i }).click()
      const homeNode = canvas.getByLabel(/^Home$/i).first()
      await expect(homeNode).toBeVisible()
      expect(await readScale(canvas)).toBeGreaterThanOrEqual(0.35)
      await expect
        .poll(() =>
          homeNode.evaluate((node) => {
            const bounds = node.getBoundingClientRect()
            const target = document.elementFromPoint(
              bounds.x + bounds.width / 2,
              bounds.y + bounds.height / 2,
            )
            return target === node || Boolean(target && node.contains(target))
          }),
        )
        .toBe(true)

      await homeNode.click()
      const embeddedEditor = canvas.getByLabel(/^(Editing|正在编辑) Home$/i)
      await expect(embeddedEditor).toBeVisible({ timeout: 30_000 })
      await expect(embeddedEditor.getByRole('textbox')).toBeFocused()
      await page.getByRole('button', { name: /More node actions|更多节点操作/i }).click()
      await page.getByRole('menuitem', { name: /Close editor|关闭编辑器/i }).click()
      await expect
        .poll(() => new URL(page.url()).searchParams.get('edit'), { timeout: 30_000 })
        .toBeNull()

      if (fixture.generated) {
        await page.getByRole('button', { name: searchName }).click()
        await page.getByRole('combobox', { name: searchName }).fill('pipeline.yml')
        await page.getByRole('option', { name: /pipeline\.yml/i }).click()
        const sourceNode = canvas.getByRole('group', { name: /^pipeline\.yml$/i }).first()
        await expect(sourceNode).toBeVisible()
        await sourceNode.getByRole('button', { name: /Expand node content|展开节点内容/i }).click()
        const sourcePreview = sourceNode.getByRole('article', { name: /pipeline\.yml/i })
        await expect(sourcePreview).toBeVisible()
        await expect(sourcePreview.getByText('YAML', { exact: true })).toBeVisible()
        await expect(sourcePreview).toContainText('product-readiness')
        await expect(
          sourcePreview.getByRole('list', { name: /Source lines|源码行/i }),
        ).toBeVisible()
        await page.getByRole('button', { name: searchName }).click()
        await page.getByRole('combobox', { name: searchName }).fill('Home')
        await page.getByRole('option', { name: /Home.*Home\.md/i }).click()
      }

      await expect(canvas).toBeVisible({ timeout: 60_000 })
      const zoomIn = canvas.getByRole('button', { name: /Zoom in|放大/i })
      const scaleBeforeZoom = await readScale(canvas)
      await zoomIn.click()
      await expect.poll(() => readScale(canvas)).toBeGreaterThan(scaleBeforeZoom)
      await expect(canvas.getByRole('button', { name: /Fit view|适应视图/i })).toBeVisible()
      await expect(canvas.getByLabel(/navigation minimap|导航小地图/i)).toBeVisible()

      const draggableNode = canvas.getByLabel(/^Home$/i).first()
      const beforeDrag = await draggableNode.boundingBox()
      const dragHandle = draggableNode.getByTestId('workspace-map-resource-drag-handle')
      const dragHandleBox = await dragHandle.boundingBox()
      const canvasBox = await canvas.boundingBox()
      expect(beforeDrag).not.toBeNull()
      expect(dragHandleBox).not.toBeNull()
      expect(canvasBox).not.toBeNull()
      if (beforeDrag && canvasBox && dragHandleBox) {
        const start = {
          x: dragHandleBox.x + dragHandleBox.width / 2,
          y: dragHandleBox.y + dragHandleBox.height / 2,
        }
        const end = {
          x: start.x + canvasBox.width * 0.08,
          y: start.y + canvasBox.height * 0.06,
        }
        await page.mouse.move(start.x, start.y)
        await page.mouse.down()
        await page.mouse.move(end.x, end.y, { steps: 6 })
        await page.mouse.up()
        await expect
          .poll(async () =>
            Math.abs(((await draggableNode.boundingBox())?.x ?? beforeDrag.x) - beforeDrag.x),
          )
          .toBeGreaterThan(8)
      }

      await revealElectronWindow(session.app, page, { width: 720, height: 640 })
      await expectNoHorizontalOverflow(page)

      const auditDirectory = path.resolve('output/playwright/product-audit')
      fs.mkdirSync(auditDirectory, { recursive: true })
      const artifactName = fixture.generated ? 'fixture-workspace-map' : 'real-workspace-map'
      await page.screenshot({
        animations: 'disabled',
        path: path.join(auditDirectory, `${artifactName}.png`),
      })
      fs.writeFileSync(
        path.join(auditDirectory, `${artifactName}.json`),
        `${JSON.stringify({ nodeCount: await nodes.count(), scale: await readScale(canvas) }, null, 2)}\n`,
      )
      assertNoRuntimeErrors(diagnostics)
    } finally {
      await attachDiagnostics(session, diagnostics, testInfo)
      const screenshot = await page.screenshot({ animations: 'disabled' }).catch(() => null)
      if (screenshot) {
        await testInfo.attach('workspace-product-readiness.png', {
          body: screenshot,
          contentType: 'image/png',
        })
      }
    }
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture object destructuring.
  test('opens a cold-start workspace target passed by the operating system', async ({}, testInfo) => {
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    const currentSession = session
    const diagnostics = monitorRuntime(currentSession)
    try {
      const startupState = await snapshotStartupOpenTargetState(currentSession.page)
      await testInfo.attach('startup-open-target-state.json', {
        body: JSON.stringify(startupState, null, 2),
        contentType: 'application/json',
      })
      expect(startupState.launchInfo?.args).toContain(fixture.root)
      await expect
        .poll(
          async () => {
            const state = await snapshotStartupOpenTargetState(currentSession.page)
            return (state.rootInfo as { path?: string } | undefined)?.path
          },
          { timeout: 15_000 },
        )
        .toBe(fixture.root)
      const workspaceName = escapeRegExp(fixture.workspaceName)
      await expect(
        currentSession.page.getByRole('button', {
          name: new RegExp(`^(Workspace|工作区):.*${workspaceName}`, 'i'),
        }),
      ).toBeVisible({ timeout: 45_000 })
      assertNoRuntimeErrors(diagnostics)
    } finally {
      await attachDiagnostics(currentSession, diagnostics, testInfo)
    }
  })
})
