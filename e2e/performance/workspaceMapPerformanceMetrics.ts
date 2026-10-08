import { expect, type Locator, type Page } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Performance helpers are colocated Node-run modules.
import { measureFrames } from './frameMeasurement.js'
// eslint-disable-next-line no-restricted-imports -- Performance helpers are colocated Node-run modules.
import { profileRendererInteraction } from './rendererCpuProfile.js'

type Viewport = {
  x: number
  y: number
  zoom: number
}

const readViewport = (canvas: Locator) =>
  canvas.evaluate((element): Viewport => {
    const viewport = element.querySelector<HTMLElement>('.react-flow__viewport')
    const transform = viewport ? window.getComputedStyle(viewport).transform : ''
    if (!transform || transform === 'none') return { x: 0, y: 0, zoom: 1 }
    const matrix = new DOMMatrix(transform)
    return { x: matrix.e, y: matrix.f, zoom: matrix.a }
  })

const findClearPanePoint = (canvas: Locator) =>
  canvas.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    const candidates = [
      [0.82, 0.78],
      [0.18, 0.78],
      [0.82, 0.22],
      [0.18, 0.22],
      [0.5, 0.86],
    ]
    for (const [horizontal, vertical] of candidates) {
      const x = bounds.x + bounds.width * horizontal
      const y = bounds.y + bounds.height * vertical
      const target = document.elementFromPoint(x, y) as HTMLElement | null
      const obstructed = target?.closest(
        '.react-flow__node, .react-flow__controls, .react-flow__minimap, button, input',
      )
      if (target && element.contains(target) && !obstructed) return { x, y }
    }
    throw new Error('Workspace Map has no unobstructed pane point for a real pan gesture')
  })

const stripRawProfile = <Result>(
  measured: Awaited<ReturnType<typeof profileRendererInteraction<Result>>>,
) => {
  const { rawCpuProfile, ...profile } = measured.profile
  return { profile, rawCpuProfile, result: measured.result }
}

const openWorkspaceMap = async (page: Page) => {
  await page.locator('[role="radio"][aria-label="Map"], [role="radio"][aria-label="地图"]').click()
  const canvas = page.locator('.workspace-map-canvas')
  await expect(canvas).toBeVisible({ timeout: 60_000 })
  const nodes = canvas.locator('.react-flow__node')
  await expect.poll(() => nodes.count(), { timeout: 60_000 }).toBeGreaterThan(10)
  await expect.poll(() => canvas.locator('.react-flow__edge').count()).toBeGreaterThan(0)
  return {
    edgeCount: await canvas.locator('.react-flow__edge').count(),
    nodeCount: await nodes.count(),
  }
}

const exerciseZoom = async (canvas: Locator) => {
  const before = await readViewport(canvas)
  const zoomIn = canvas.getByRole('button', { name: /Zoom in|放大/i })
  await expect(zoomIn).toBeVisible()
  await zoomIn.click()
  await zoomIn.click()
  await expect.poll(async () => (await readViewport(canvas)).zoom).toBeGreaterThan(before.zoom)
  return { after: await readViewport(canvas), before, input: 'zoom-control' as const }
}

const exercisePan = async (page: Page, canvas: Locator) => {
  const before = await readViewport(canvas)
  const start = await findClearPanePoint(canvas)
  const end = { x: start.x - 120, y: start.y - 72 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(async () => {
      const after = await readViewport(canvas)
      return Math.hypot(after.x - before.x, after.y - before.y)
    })
    .toBeGreaterThan(8)
  return { after: await readViewport(canvas), before, input: 'pointer-drag' as const }
}

const revealDraggableNode = async (page: Page, canvas: Locator) => {
  const searchName = /Find a node|Search(?: workspace)? nodes|(?:搜索|查找)(?:工作区)?节点/i
  await page.getByRole('button', { name: searchName }).click()
  const search = page.getByRole('combobox', { name: searchName })
  await search.fill('Home')
  await page.getByRole('option', { name: /Home.*Home\.md/i }).click()
  const node = canvas.getByLabel(/^Home$/i).first()
  await expect(node).toBeVisible()
  return node
}

const exerciseNodeDrag = async (page: Page, node: Locator) => {
  const handle = node.getByTestId('workspace-map-resource-drag-handle')
  const dragTarget = (await handle.count()) > 0 ? handle : node
  const before = await node.boundingBox()
  const dragTargetBox = await dragTarget.boundingBox()
  if (!before || !dragTargetBox) throw new Error('Workspace Map draggable node has no geometry')
  const start = {
    x: dragTargetBox.x + dragTargetBox.width / 2,
    y: dragTargetBox.y + dragTargetBox.height / 2,
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 96, start.y + 64, { steps: 12 })
  await page.mouse.up()
  await expect
    .poll(async () => {
      const after = await node.boundingBox()
      return after ? Math.hypot(after.x - before.x, after.y - before.y) : 0
    })
    .toBeGreaterThan(8)
  return {
    after: await node.boundingBox(),
    before,
    input: (dragTarget === handle ? 'node-drag-handle' : 'node-body') as
      'node-body' | 'node-drag-handle',
  }
}

const measureInteraction = async <Result>(page: Page, interaction: () => Promise<Result>) => {
  let gesture: Result | undefined
  const frames = await measureFrames(page, async () => {
    gesture = await interaction()
  })
  if (!gesture) throw new Error('Workspace Map interaction did not return gesture metrics')
  return { frames, gesture }
}

export const profileWorkspaceMap = async (page: Page) => {
  const open = stripRawProfile(
    await profileRendererInteraction(page, 'workspace-map-open', async () => {
      let map: Awaited<ReturnType<typeof openWorkspaceMap>> | undefined
      const frames = await measureFrames(page, async () => {
        map = await openWorkspaceMap(page)
      })
      if (!map) throw new Error('Workspace Map did not return metrics')
      return { frames, map }
    }),
  )
  const canvas = page.locator('.workspace-map-canvas')
  const draggableNode = await revealDraggableNode(page, canvas)
  const interactions = stripRawProfile(
    await profileRendererInteraction(page, 'workspace-map-gestures', async () => ({
      nodeDrag: await measureInteraction(page, () => exerciseNodeDrag(page, draggableNode)),
      pan: await measureInteraction(page, () => exercisePan(page, canvas)),
      zoom: await measureInteraction(page, () => exerciseZoom(canvas)),
    })),
  )
  return {
    rawProfiles: {
      interactions: interactions.rawCpuProfile,
      open: open.rawCpuProfile,
    },
    report: {
      interactionProfile: interactions.profile,
      interactions: interactions.result,
      profile: open.profile,
      ...open.result,
    },
  }
}
