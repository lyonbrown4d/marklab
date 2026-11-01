import type { Page } from '@playwright/test'
import type { FsGraph } from '@/services/fsGraphSchemas'
/* eslint-disable no-restricted-imports -- Renderer browser fixtures are test-only sibling modules. */
import { test, expect } from './rendererTest.js'
import { captureWorkbenchLayout, expectDockContentFits } from './workbenchLayout.js'
/* eslint-enable no-restricted-imports */

test.use({
  documents: {
    'Alpha.md': '# Alpha\n\nStart document. [Beta](Beta.md) and [missing](Missing.md).\n',
    'Beta.md': '# Beta\n\nBeta preview content. [Gamma](Gamma.md).\n',
    'Gamma.md': '# Gamma\n\nGamma document content.\n',
  },
  initialFile: 'Alpha.md',
})

const attachments = [
  { preview_kind: 'audio', path: 'assets/theme.mp3' },
  { preview_kind: 'docx', path: 'assets/brief.docx' },
  { preview_kind: 'drawio', path: 'assets/architecture.drawio' },
  { preview_kind: 'excalidraw', path: 'assets/sketch.excalidraw' },
  { preview_kind: 'image', path: 'assets/diagram.png' },
  { preview_kind: 'pdf', path: 'assets/manual.pdf' },
  { preview_kind: 'source', path: 'assets/example.ts' },
  { preview_kind: 'spreadsheet', path: 'assets/budget.xlsx' },
  { preview_kind: 'video', path: 'assets/demo.mp4' },
] as const

const graphFixture = (): FsGraph => ({
  mode: 'relations',
  revision: 'fixture-relations-1',
  topology_key: 'fixture-topology-1',
  truncated: false,
  total_nodes: 13,
  total_edges: 12,
  nodes: [
    ...['Alpha', 'Beta', 'Gamma'].map((label, index) => ({
      position: { x: -index * 2, y: -index },
      id: `file:${label}.md`,
      kind: 'file' as const,
      label,
      path: `${label}.md`,
      group: { key: '.', label: '.', source: 'path' as const },
    })),
    ...attachments.map(({ preview_kind, path }, index) => ({
      position: {
        x: 4 * Math.cos((index * Math.PI * 2) / attachments.length),
        y: 4 * Math.sin((index * Math.PI * 2) / attachments.length),
      },
      id: `preview:${preview_kind}`,
      kind: 'preview' as const,
      label: `${preview_kind} attachment`,
      path,
      preview_kind,
      source_path: 'Alpha.md',
      target: path,
    })),
    {
      id: 'missing:Missing.md',
      position: { x: -1, y: -4 },
      kind: 'missing',
      label: 'Missing',
      path: 'Missing.md',
      preview_kind: 'source',
      source_path: 'Alpha.md',
      target: 'Missing.md',
    },
  ],
  edges: [
    ...attachments.map(({ preview_kind }) => ({
      id: `alpha-${preview_kind}`,
      source: 'file:Alpha.md',
      target: `preview:${preview_kind}`,
      kind: 'previews' as const,
      count: 1,
    })),
    {
      id: 'alpha-beta',
      source: 'file:Alpha.md',
      target: 'file:Beta.md',
      kind: 'links_to',
      count: 2,
    },
    {
      id: 'beta-gamma',
      source: 'file:Beta.md',
      target: 'file:Gamma.md',
      kind: 'links_to',
      count: 1,
    },
    {
      id: 'alpha-missing',
      source: 'file:Alpha.md',
      target: 'missing:Missing.md',
      kind: 'links_to',
      count: 1,
    },
  ],
})

type Camera = { x: number; y: number; ratio: number; angle: number }
const readCamera = (page: Page) =>
  page.evaluate(() => {
    const value = localStorage.getItem('marklab.knowledgeGraph.views')
    if (!value) return null
    const cache = JSON.parse(value) as { state: { entries: { viewKey: string; camera: Camera }[] } }
    return cache.state.entries.find((entry) => entry.viewKey.startsWith('pane:'))?.camera ?? null
  })

test('renders real WebGL2 attachment icons and opens a full editor beside the selected graph node', async ({
  session: { page, backend },
}, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  backend.setGraph(graphFixture())
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const graph = page.getByTestId('knowledge-graph')
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  await expect(graph).toHaveAttribute('data-graph-node-count', '13')
  await expect(graph).toHaveAttribute('data-graph-edge-count', '12')
  expect(
    await graph
      .locator('canvas')
      .evaluateAll((canvases) =>
        canvases.some(
          (canvas) => canvas instanceof HTMLCanvasElement && canvas.getContext('webgl2') !== null,
        ),
      ),
  ).toBe(true)
  await expect(page.getByText('Graph unavailable. Browse documents in the list.')).toBeHidden()
  await graph.getByRole('button', { name: 'Rearrange graph', exact: true }).click()
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click()
  await expect.poll(() => readCamera(page)).not.toBeNull()
  await graph.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(async () => (await readCamera(page))?.ratio).toBeCloseTo(1.4, 5)
  await info.attach('knowledge-graph-attachment-icons.png', {
    body: await graph.screenshot({ path: info.outputPath('knowledge-graph-attachment-icons.png') }),
    contentType: 'image/png',
  })

  const search = graph.getByRole('textbox', { name: 'Search documents' })
  const editor = page.getByTestId('markdown-editor').filter({ visible: true })
  for (const [name, content] of [
    ['Alpha', 'Start document.'],
    ['Beta', 'Beta preview content.'],
  ] as const) {
    await search.fill(name)
    const result = graph.getByRole('button', { name: `${name} ${name}.md`, exact: true })
    await result.click()
    await expect(result).toBeFocused()
    await expect(editor).toContainText(content)
    await expect(graph).toBeVisible()
    await expectDockContentFits(page)
  }
  await search.fill('Beta')
  await graph.getByRole('button', { name: 'Beta Beta.md', exact: true }).click()
  await expect(editor).toContainText('Beta preview content.')
  await expect(editor).toHaveAttribute('data-state', 'ready')
  await expect(graph).toBeVisible()
  await captureWorkbenchLayout(page, info)
  await expectDockContentFits(page)
  const graphGroup = page
    .locator('.dv-groupview')
    .filter({ has: page.locator('.dv-tab [title="Graph"]') })
  const editorGroup = page
    .locator('.dv-groupview')
    .filter({ has: page.locator('.dv-tab [title="Beta.md"]') })
  const graphBox = (await graph.boundingBox())!
  const editorBox = (await editor.boundingBox())!
  const leftGroup = (await graphGroup.boundingBox())!
  const rightGroup = (await editorGroup.boundingBox())!
  expect(editorBox.width, 'Markdown editing surface has usable width').toBeGreaterThanOrEqual(300)
  expect(graphBox.width, 'graph stays within its Dockview group').toBeLessThanOrEqual(
    leftGroup.width + 2,
  )
  expect(graphBox.x + graphBox.width).toBeLessThanOrEqual(leftGroup.x + leftGroup.width + 2)
  expect(editorBox.x).toBeGreaterThanOrEqual(rightGroup.x - 2)
  expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(rightGroup.x + rightGroup.width + 2)
  for (const pane of await page.locator('[data-workbench-pane]:visible').all()) {
    expect(
      await pane.evaluate((element) => element.scrollWidth - element.clientWidth),
      'pane has no horizontal overflow',
    ).toBeLessThanOrEqual(2)
  }
  expect(editorBox.x).toBeGreaterThan(graphBox.x + graphBox.width / 2)
  await expect(
    page.getByRole('complementary', { name: 'Document preview', exact: true }),
  ).toHaveCount(0)
  await editor.click()
  await expect(editor).toHaveAttribute('contenteditable', 'true')
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' Edited beside graph.')
  await expect(editor).toContainText('Edited beside graph.')
  await expect(graph).toBeVisible()
  await info.attach('knowledge-graph-full-editor.png', {
    body: await page.screenshot({ path: info.outputPath('knowledge-graph-full-editor.png') }),
    contentType: 'image/png',
  })

  await search.fill('')
  await graph.getByRole('button', { name: 'Document list', exact: true }).click()
  const first = graph.getByRole('button', { name: 'Alpha Alpha.md', exact: true })
  await first.focus()
  await page.keyboard.press('ArrowDown')
  await expect(graph.getByRole('button', { name: 'Beta Beta.md', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  const missing = graph.getByRole('button', { name: 'Missing Missing.md', exact: true })
  await expect(missing).toBeFocused()
  const details = page.getByRole('complementary', { name: 'Document preview', exact: true })
  await expect(details).toContainText('Missing target')
  await expect(details.getByRole('button', { name: 'Open document', exact: true })).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(graph).toBeVisible()
  await expect(page.getByTestId('markdown-editor').filter({ visible: true })).toContainText(
    'Edited beside graph.',
  )
})

test('pixel trackpad wheel pans while control wheel zooms around its pointer without scaling the page', async ({
  session: { page, backend },
}) => {
  backend.setGraph(graphFixture())
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const graph = page.getByTestId('knowledge-graph')
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click()
  await expect.poll(() => readCamera(page)).not.toBeNull()
  const before = (await readCamera(page))!
  const region = graph.getByRole('region')
  const bounds = (await region.boundingBox())!
  const pointer = { x: bounds.x + bounds.width * 0.75, y: bounds.y + bounds.height * 0.65 }
  const scale = await page.evaluate(() => ({ scale: visualViewport?.scale, width: innerWidth }))
  await page.mouse.move(pointer.x, pointer.y)
  await page.mouse.wheel(80, 50)
  await expect
    .poll(async () => {
      const camera = await readCamera(page)
      return camera && Math.hypot(camera.x - before.x, camera.y - before.y)
    })
    .toBeGreaterThan(0.01)
  const panned = (await readCamera(page))!
  expect(panned.ratio).toBeCloseTo(before.ratio, 6)
  expect(panned.angle).toBe(before.angle)
  await page.keyboard.down('Control')
  try {
    await page.mouse.wheel(0, -30)
    await expect.poll(async () => (await readCamera(page))?.ratio).toBeLessThan(panned.ratio)
    const zoomed = (await readCamera(page))!
    expect(zoomed.ratio).toBeCloseTo(panned.ratio * Math.exp(-0.3), 5)
    // An off-center anchor must translate the camera as well as change its ratio.
    expect(Math.hypot(zoomed.x - panned.x, zoomed.y - panned.y)).toBeGreaterThan(0.01)
    await page.mouse.wheel(0, 30)
    await expect.poll(async () => (await readCamera(page))?.ratio).toBeCloseTo(panned.ratio, 5)
    const restored = (await readCamera(page))!
    expect(restored.x).toBeCloseTo(panned.x, 5)
    expect(restored.y).toBeCloseTo(panned.y, 5)
  } finally {
    await page.keyboard.up('Control')
  }
  expect(await page.evaluate(() => ({ scale: visualViewport?.scale, width: innerWidth }))).toEqual(
    scale,
  )
})
