import type { FsGraph } from '@/services/fsGraphSchemas'
import type { GraphViewSnapshot } from '@/features/knowledge-graph/graphViewCache'
import type { GraphLayoutKind } from '@/features/knowledge-graph/graphLayoutTypes'
/* eslint-disable no-restricted-imports -- Browser acceptance reuses existing renderer fixtures. */
import { test, expect } from './rendererTest.js'
import { pointerDrag } from './workbenchDriver.js'
/* eslint-enable no-restricted-imports */

const paths = [
  'docs/Alpha.md',
  'docs/Beta.md',
  'docs/Gamma.md',
  'docs/Delta.md',
  'reference/One.md',
  'reference/Two.md',
  'reference/Three.md',
  'reference/Four.md',
]
test.use({
  documents: Object.fromEntries(paths.map((path) => [path, `# ${path}\n\nLayout fixture.\n`])),
  initialFile: paths[0],
})
const fixture = (): FsGraph => ({
  mode: 'relations',
  revision: 'layouts-1',
  topology_key: 'layouts-1',
  truncated: false,
  total_nodes: paths.length,
  total_edges: paths.length - 1,
  nodes: paths.map((path) => ({
    id: `file:${path}`,
    kind: 'file',
    label: path.split('/')[1].slice(0, -3),
    path,
    group: { key: path.split('/')[0], label: path.split('/')[0], source: 'path' },
  })),
  edges: paths.slice(1).map((path) => ({
    id: `alpha-${path}`,
    source: `file:${paths[0]}`,
    target: `file:${path}`,
    kind: 'links_to',
    count: 1,
  })),
})

test('switches all layouts and restores the chosen layout, dragged node and camera after reload', async ({
  session: { page, backend },
}) => {
  backend.setGraph(fixture())
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const graph = page.getByTestId('knowledge-graph')
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  const readCache = () =>
    page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('marklab.knowledgeGraph.views') ?? '{}') as {
        version?: number
        state?: { entries?: GraphViewSnapshot[] }
      }
      return { version: value.version, entries: value.state?.entries ?? [] }
    })
  const readView = async () =>
    (await readCache()).entries.find(
      (entry) => entry.topologyKey === 'layouts-1' && entry.viewKey.startsWith('pane:'),
    )
  await expect.poll(async () => (await readView())?.layout).toBe('forceatlas2')
  const choose = async (name: string, kind: GraphLayoutKind) => {
    await graph.getByRole('button', { name: 'Graph layout', exact: true }).click()
    await page.getByRole('menuitemradio', { name, exact: true }).click()
    await expect.poll(async () => (await readView())?.layout).toBe(kind)
    await expect(graph).toHaveAttribute('data-graph-node-count', String(paths.length))
  }
  await choose('Circular', 'circular')
  const circular = (await readView())!
  const points = Object.values(circular.positions)
  expect(points).toHaveLength(paths.length)
  const center = points.reduce(
    (sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }),
    { x: 0, y: 0 },
  )
  const radii = points.map((point) => Math.hypot(point.x - center.x, point.y - center.y))
  expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.000001)

  // Selecting a document centers its real Sigma node and retains the editor beside the graph.
  const search = graph.getByRole('textbox', { name: 'Search documents', exact: true })
  await search.fill('docs/Alpha.md')
  await graph.getByRole('button', { name: 'Alpha docs/Alpha.md', exact: true }).click()
  await expect(page.getByTestId('markdown-editor').filter({ visible: true })).toContainText(
    'Layout fixture.',
  )
  await search.fill('')
  await expect(graph.getByRole('list', { name: 'Document list', exact: true })).toBeHidden()
  await expect.poll(async () => (await readView())?.camera.ratio).toBeCloseTo(0.35, 5)
  const region = graph.getByRole('region')
  let node = { x: 0, y: 0 }
  // Search removal and Dockview splitting render asynchronously. Re-enter the
  // settled stage so native GPU picking resolves the current node, not an overlay.
  await expect
    .poll(async () => {
      const bounds = (await region.boundingBox())!
      node = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      await page.mouse.move(bounds.x + 8, bounds.y + 8)
      await page.mouse.move(node.x, node.y)
      return region.evaluate((element) => getComputedStyle(element).cursor)
    })
    .toBe('pointer')
  await pointerDrag(page, node, { x: node.x + 35, y: node.y + 25 })
  await expect
    .poll(async () => Object.keys((await readView())?.manualOverrides ?? {}).length)
    .toBe(1)
  const ratio = (await readView())!.camera.ratio
  await graph.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(async () => (await readView())?.camera.ratio).toBeCloseTo(ratio * 1.4, 5)
  const saved = (await readView())!
  await page.reload()
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  await graph.getByRole('button', { name: 'Graph layout', exact: true }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Circular', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  expect((await readView())?.viewKey).toBe(saved.viewKey)
  expect((await readView())?.manualOverrides).toEqual(saved.manualOverrides)
  expect((await readView())?.camera).toEqual(saved.camera)

  await choose('Group by directory', 'grouped')
  const grouped = (await readView())!
  expect(grouped.manualOverrides).toEqual({})
  expect(grouped.positions).not.toEqual(circular.positions)
  expect(grouped.camera).toMatchObject({ x: 0.5, y: 0.5, ratio: 1, angle: 0 })
  await choose('Force-directed', 'forceatlas2')
  await expect.poll(async () => (await readView())?.layoutPending).toBe(false)
  await expect.poll(async () => (await readView())?.positions).not.toEqual(circular.positions)
  await graph.getByRole('button', { name: 'Rearrange graph', exact: true }).click()
  await expect.poll(async () => (await readView())?.layout).toBe('forceatlas2')
  const cache = await readCache()
  expect(cache.version).toBe(4)
  expect(cache.entries.length).toBeLessThanOrEqual(8)
  expect(
    cache.entries.reduce(
      (count, entry) =>
        count + Object.keys(entry.positions).length + Object.keys(entry.manualOverrides).length,
      0,
    ),
  ).toBeLessThanOrEqual(12_000)
  for (const entry of cache.entries) {
    expect(entry.camera.ratio).toBeGreaterThanOrEqual(0.05)
    expect(entry.camera.ratio).toBeLessThanOrEqual(8)
    expect(
      [...Object.values(entry.positions), ...Object.values(entry.manualOverrides)].every(
        (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
      ),
    ).toBe(true)
  }
})
