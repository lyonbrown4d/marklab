import type { Locator } from '@playwright/test'
/* eslint-disable no-restricted-imports -- Graph resize acceptance uses existing renderer fixtures. */
import { test, expect } from './rendererTest.js'
import { denseDocuments, densePaths, denseGraphFixture } from './denseGraphFixture.js'
import { pointerDrag } from './workbenchDriver.js'
/* eslint-enable no-restricted-imports */

test.use({ documents: denseDocuments, initialFile: densePaths[0] })

const paintedPixels = async (canvas: Locator) => {
  // Read a composited screenshot: WebGL's default buffer is not preserved for readPixels.
  const png = await canvas.screenshot({ animations: 'disabled' })
  return canvas.page().evaluate(async (base64) => {
    const image = await createImageBitmap(
      await (await fetch(`data:image/png;base64,${base64}`)).blob(),
    )
    const surface = new OffscreenCanvas(image.width, image.height)
    const context = surface.getContext('2d')!
    context.drawImage(image, 0, 0)
    image.close()
    const pixels = context.getImageData(0, 0, surface.width, surface.height).data
    let painted = 0
    // Exclude the floating toolbar and edge controls composited over the canvas.
    const background = (90 * surface.width + 30) * 4
    for (let y = 80; y < surface.height - 70; y++) {
      for (let x = 30; x < surface.width - 30; x++) {
        const index = (y * surface.width + x) * 4
        const difference =
          Math.abs(pixels[index] - pixels[background]) +
          Math.abs(pixels[index + 1] - pixels[background + 1]) +
          Math.abs(pixels[index + 2] - pixels[background + 2])
        if (difference > 50) painted++
      }
    }
    return painted
  }, png.toString('base64'))
}

test('repaints the real graph after dragging the editor splitter narrow and wide without moving the camera', async ({
  session: { page, backend },
}, info) => {
  backend.setGraph(denseGraphFixture())
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const graph = page.getByTestId('knowledge-graph')
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  const search = graph.getByRole('textbox', { name: 'Search documents', exact: true })
  await search.fill(densePaths[0].slice(0, -3))
  await graph
    .getByRole('button', { name: `${densePaths[0].slice(0, -3)} ${densePaths[0]}`, exact: true })
    .click()
  await expect(page.getByTestId('markdown-editor').filter({ visible: true })).toBeVisible()
  await search.fill('')
  await graph.getByRole('button', { name: 'Fit graph', exact: true }).click()
  const canvas = graph.locator('canvas').first()
  expect(
    await canvas.evaluate(
      (element) => element instanceof HTMLCanvasElement && element.getContext('webgl2') !== null,
    ),
  ).toBe(true)
  await expect.poll(() => paintedPixels(canvas)).toBeGreaterThan(1000)
  const readCamera = () =>
    page.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('marklab.knowledgeGraph.views') ?? '{}') as {
        state?: { entries?: { camera: unknown }[] }
      }
      return value.state?.entries?.[0]?.camera
    })
  await expect.poll(readCamera).toBeDefined()
  const camera = await readCamera()
  const initialWidth = (await graph.boundingBox())!.width
  for (const [name, delta] of [
    ['narrow', -180],
    ['wide', 300],
  ] as const) {
    const sash = page.locator('.dv-sash-container .dv-sash:visible').first()
    const handle = (await sash.boundingBox())!
    const before = (await graph.boundingBox())!.width
    await pointerDrag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: handle.x + handle.width / 2 + delta, y: handle.y + handle.height / 2 },
    )
    await expect
      .poll(async () => Math.abs((await graph.boundingBox())!.width - before))
      .toBeGreaterThan(100)
    await expect
      .poll(() => paintedPixels(canvas), {
        message: `${name} graph canvas has visible nodes, edges and labels`,
      })
      .toBeGreaterThan(1000)
    expect(await readCamera()).toEqual(camera)
    await info.attach(`graph-splitter-${name}.png`, {
      body: await page.screenshot({ path: info.outputPath(`graph-splitter-${name}.png`) }),
      contentType: 'image/png',
    })
  }
  expect((await graph.boundingBox())!.width).toBeGreaterThan(initialWidth)
})

test('uses native pointer, grab and grabbing cursors through node drag, stage pan and release outside', async ({
  session: { page, backend },
}, info) => {
  const fixture = denseGraphFixture()
  backend.setGraph({
    ...fixture,
    nodes: fixture.nodes.slice(0, 1),
    edges: [],
    total_nodes: 1,
    total_edges: 0,
  })
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const graph = page.getByTestId('knowledge-graph')
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  const region = graph.getByRole('region')
  const bounds = (await region.boundingBox())!
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  const blank = { x: bounds.x + 40, y: bounds.y + bounds.height * 0.7 }
  await page.mouse.move(blank.x, blank.y)
  await expect(region).toHaveCSS('cursor', 'grab')
  await page.mouse.move(center.x, center.y)
  await expect(region).toHaveCSS('cursor', 'pointer')
  await page.mouse.down()
  await page.mouse.move(center.x + 30, center.y + 25, { steps: 5 })
  await expect(region).toHaveCSS('cursor', 'grabbing')
  await page.mouse.up()
  // Sigma fits a singleton back to the center after its coordinates change.
  // The release point is now blank; hovering its visible icon must still resolve to pointer.
  await expect(region).toHaveCSS('cursor', 'grab')
  await info.attach('cursor-after-node-drag.png', {
    body: await page.screenshot({ path: info.outputPath('cursor-after-node-drag.png') }),
    contentType: 'image/png',
  })
  await page.mouse.move(center.x, center.y)
  await expect(region).toHaveCSS('cursor', 'pointer')
  await page.mouse.move(blank.x, blank.y)
  await expect(region).toHaveCSS('cursor', 'grab')
  await page.mouse.down()
  await page.mouse.move(blank.x + 30, blank.y + 25, { steps: 5 })
  await expect(region).toHaveCSS('cursor', 'grabbing')
  // Native captors track release outside the canvas; no app-level drag handlers are needed.
  await page.mouse.move(bounds.x + 50, bounds.y - 20)
  await page.mouse.up()
  await expect(region).toHaveCSS('cursor', 'grab')
  await page.mouse.move(blank.x, blank.y)
  await expect(region).toHaveCSS('cursor', 'grab')
  await region.focus()
  await expect(region).toBeFocused()
})
