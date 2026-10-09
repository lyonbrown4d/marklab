import { expect, type Locator, type Page } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import type { ElectronTestSession } from './electronTestHarness.js'

const BLOCK_WRAPPER = '[data-block-drag-wrapper="true"]'
const DRAG_HANDLE = 'button[data-block-drag-handle="true"]'
const EDGE_DROP_CLEARANCE_PX = 88

export type NativeDragEventSnapshot = {
  blockId: string | null
  defaultPrevented: boolean
  type: string
  x: number
  y: number
}

export const installNativeDragProbe = (page: Page) =>
  page.evaluate(() => {
    const snapshots: NativeDragEventSnapshot[] = []
    Object.assign(window, { __marklabNativeDragEvents: snapshots })
    for (const type of ['dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) {
      document.addEventListener(
        type,
        (event) => {
          const dragEvent = event as DragEvent
          const target = dragEvent.target instanceof Element ? dragEvent.target : null
          snapshots.push({
            blockId: target?.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null,
            defaultPrevented: dragEvent.defaultPrevented,
            type,
            x: dragEvent.clientX,
            y: dragEvent.clientY,
          })
        },
        true,
      )
    }
  })

export const readNativeDragProbe = (page: Page) =>
  page.evaluate(
    () =>
      (window as Window & { __marklabNativeDragEvents?: NativeDragEventSnapshot[] })
        .__marklabNativeDragEvents ?? [],
  )

const setWorkspaceRoot = async (session: ElectronTestSession, workspacePath: string) => {
  const root = await session.page.evaluate(async (nextPath) => {
    const bridge = (
      window as Window & {
        marklabElectron?: {
          commands?: { invoke: (name: string, args?: object) => Promise<unknown> }
        }
      }
    ).marklabElectron
    if (!bridge?.commands) throw new Error('Secure preload command bridge is unavailable')
    return bridge.commands.invoke('fs_set_root', { path: nextPath }) as Promise<{
      kind: 'external'
      path: string
    }>
  }, workspacePath)
  const windowHandle = await session.app.browserWindow(session.page)
  try {
    await windowHandle.evaluate(
      (window, state) => window.webContents.send('workspace-session-seed', { state }),
      { activeTabId: null, rootKind: root.kind, rootPath: root.path, tabs: [] },
    )
  } finally {
    await windowHandle.dispose()
  }
}

export const openMarkdownDocument = async (
  session: ElectronTestSession,
  workspacePath: string,
  fileName: string,
) => {
  await setWorkspaceRoot(session, workspacePath)
  const page = session.page
  const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
  if (!(await explorer.isVisible().catch(() => false))) await page.keyboard.press('Control+Shift+L')
  await expect(explorer).toBeVisible({ timeout: 10_000 })
  const file = explorer.getByRole('button', { exact: true, name: fileName })
  await expect(file).toBeVisible({ timeout: 20_000 })
  await file.click()
  await expect(explorer).toBeHidden()
  const editor = page.getByTestId('markdown-editor')
  await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
  await expect(editor).toContainText('DRAG-BLOCK-01')
  return editor
}

export const blockByMarker = (editor: Locator, marker: string) =>
  editor.locator(BLOCK_WRAPPER).filter({ hasText: marker }).first()

export const selectBlocksByMarker = async (editor: Locator, markers: [string, ...string[]]) => {
  await blockByMarker(editor, markers[0]).locator(DRAG_HANDLE).click()
  const additiveModifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  for (const marker of markers.slice(1)) {
    await blockByMarker(editor, marker)
      .locator(DRAG_HANDLE)
      .click({ modifiers: [additiveModifier] })
  }
}

export const readRenderedBlockOrder = (editor: Locator) =>
  editor
    .locator(BLOCK_WRAPPER)
    .evaluateAll((blocks) =>
      blocks.flatMap((block) => block.textContent?.match(/DRAG-BLOCK-\d{2}/g) ?? []),
    )

const center = (box: { height: number; width: number; x: number; y: number }) => ({
  x: box.x + box.width / 2,
  y: box.y + box.height / 2,
})

const requireBox = async (locator: Locator, description: string) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`${description} has no visible geometry`)
  return box
}

export const beginBlockDrag = async (page: Page, block: Locator) => {
  await block.scrollIntoViewIfNeeded()
  await block.hover()
  const handle = block.locator(DRAG_HANDLE)
  await expect(handle).toBeVisible()
  await expect(handle).toHaveAttribute('draggable', 'true')
  await expect(handle).toHaveCSS('pointer-events', 'auto')
  const start = center(await requireBox(handle, 'Block drag handle'))
  await handle.hover()
  await expect.poll(() => handle.evaluate((element) => element.matches(':hover'))).toBe(true)
  await page.mouse.down()
  await page.mouse.move(start.x + 2, start.y + 2)
  await page.mouse.move(start.x + 8, start.y + 8, { steps: 6 })
}

export const dropBlockAfter = async (page: Page, target: Locator) => {
  const hitPoints = await target.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const points: Array<{ x: number; y: number }> = []
    for (const yRatio of [0.85, 0.75, 0.65, 0.55]) {
      for (const xRatio of [0.5, 0.25, 0.75]) {
        const x = box.left + box.width * xRatio
        const y = box.top + box.height * yRatio
        const hit = document.elementFromPoint(x, y)
        if (hit?.closest('[data-block-drag-wrapper="true"]') === element) points.push({ x, y })
      }
    }
    return points
  })
  if (hitPoints.length === 0) {
    throw new Error('Block drop target has no hit-testable point in its bottom half')
  }

  const dropLine = target.locator('[data-block-drop-line="bottom"]')
  for (const hitPoint of hitPoints) {
    await page.mouse.move(hitPoint.x, hitPoint.y, { steps: 8 })
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    )
    if (await dropLine.isVisible().catch(() => false)) {
      await page.mouse.up()
      return
    }
  }
  throw new Error('Block drop target did not expose its bottom drop line')
}

export const dragBlockAfter = async (page: Page, source: Locator, target: Locator) => {
  await beginBlockDrag(page, source)
  await dropBlockAfter(page, target)
}

export const cancelBlockDrag = async (page: Page, source: Locator, target: Locator) => {
  await beginBlockDrag(page, source)
  const box = await requireBox(target, 'Block cancel target')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )
}

export const dragBlockWithAutoScroll = async (
  page: Page,
  editor: Locator,
  source: Locator,
  target: Locator,
) => {
  await beginBlockDrag(page, source)
  const editorBox = await requireBox(editor, 'Markdown editor')
  await page.mouse.move(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height - 4, {
    steps: 20,
  })
  await expect
    .poll(() => editor.evaluate((element) => element.scrollTop), { timeout: 15_000 })
    .toBeGreaterThan(100)
  await expect(target).toBeInViewport({ timeout: 15_000 })
  await expect
    .poll(async () => {
      const box = await target.boundingBox()
      return box ? box.y + box.height : Number.POSITIVE_INFINITY
    })
    .toBeLessThan(editorBox.y + editorBox.height - EDGE_DROP_CLEARANCE_PX)
  await page.mouse.move(editorBox.x + editorBox.width / 2, editorBox.y + editorBox.height / 2, {
    steps: 8,
  })
  await expect
    .poll(() =>
      editor.evaluate(
        (element) =>
          new Promise<number>((resolve) => {
            requestAnimationFrame(() => {
              const previousScrollTop = element.scrollTop
              requestAnimationFrame(() => resolve(Math.abs(element.scrollTop - previousScrollTop)))
            })
          }),
      ),
    )
    .toBeLessThan(0.5)
  await expect(target).toBeInViewport()
  await dropBlockAfter(page, target)
}
