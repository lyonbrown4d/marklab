import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

const FIXTURE_PREFIX = 'marklab-plate-integrations-'

type GeometryRect = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

type SelectionToolbarGeometry = {
  editorScrollTop: number
  selection: GeometryRect
  toolbar: GeometryRect
  viewport: { height: number; width: number }
}

const createWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  const filler = Array.from({ length: 45 }, (_, index) => `Paragraph ${index + 1}.`).join('\n\n')
  fs.writeFileSync(
    path.join(root, 'Editor.md'),
    `# Editor integrations\n\nSelectable phrase for toolbar placement.\n\nInline $x^2$.[^note]\n\n$$\ny = 2\n$$\n\n${filler}\n\n[^note]: Footnote body.\n`,
    'utf8',
  )
  fs.writeFileSync(path.join(root, 'Second.md'), '# Second document\n', 'utf8')
  return root
}

const removeWorkspace = (root: string | undefined) => {
  if (!root) return
  const resolved = path.resolve(root)
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith(FIXTURE_PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected E2E workspace: ${resolved}`)
  }
  fs.rmSync(resolved, { force: true, recursive: true })
}

const openFile = async (page: Page, fileName: string) => {
  const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
  if (!(await explorer.isVisible().catch(() => false)))
    await page.keyboard.press('ControlOrMeta+Shift+L')
  const file = explorer.getByRole('button', { exact: true, name: fileName })
  await expect(file).toBeVisible({ timeout: 30_000 })
  await file.click()
  await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  })
}

const selectPhrase = async (page: Page, phrase: string) => {
  await expect(async () => {
    const points = await page.getByTestId('markdown-editor').evaluate((editor, target) => {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let textNode = walker.nextNode()
      while (textNode) {
        const start = textNode.textContent?.indexOf(target) ?? -1
        if (start >= 0) {
          const startRange = document.createRange()
          const endRange = document.createRange()
          startRange.setStart(textNode, start)
          startRange.setEnd(textNode, start + 1)
          endRange.setStart(textNode, start + target.length - 1)
          endRange.setEnd(textNode, start + target.length)
          const startRect = startRange.getBoundingClientRect()
          const endRect = endRange.getBoundingClientRect()
          return {
            end: { x: endRect.right - 1, y: endRect.top + endRect.height / 2 },
            start: { x: startRect.left + 1, y: startRect.top + startRect.height / 2 },
          }
        }
        textNode = walker.nextNode()
      }
      throw new Error(`Unable to select phrase: ${target}`)
    }, phrase)
    await page.mouse.move(points.start.x, points.start.y)
    await page.mouse.down()
    await page.mouse.move(points.end.x, points.end.y, { steps: 6 })
    await page.mouse.up()
    expect(await page.evaluate(() => window.getSelection()?.toString())).toContain(phrase)
  }).toPass({ intervals: [100, 250, 500], timeout: 10_000 })
}

const readSelectionToolbarGeometry = async (page: Page) => {
  const toolbar = page.getByRole('toolbar', { name: /^(Text|文本)$/i })
  await expect(toolbar).toBeVisible()
  return toolbar.evaluate((toolbarElement): SelectionToolbarGeometry => {
    const editor = document.querySelector<HTMLElement>('[data-testid="markdown-editor"]')
    const selection = window.getSelection()
    const floating = toolbarElement.closest<HTMLElement>('[data-slot="popover-content"]')
    if (!editor || !selection?.rangeCount || !floating) {
      throw new Error('Selection toolbar geometry is unavailable')
    }
    const toRect = (rect: DOMRect): GeometryRect => ({
      bottom: rect.bottom,
      height: rect.height,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      width: rect.width,
    })
    return {
      editorScrollTop: editor.scrollTop,
      selection: toRect(selection.getRangeAt(0).getBoundingClientRect()),
      toolbar: toRect(floating.getBoundingClientRect()),
      viewport: { height: window.innerHeight, width: window.innerWidth },
    }
  })
}

const horizontalOverlap = (left: GeometryRect, right: GeometryRect) =>
  Math.min(left.right, right.right) - Math.max(left.left, right.left)

const verticalAnchorGap = (geometry: SelectionToolbarGeometry) =>
  Math.min(
    Math.abs(geometry.toolbar.bottom - geometry.selection.top),
    Math.abs(geometry.toolbar.top - geometry.selection.bottom),
  )

const rectDelta = (left: GeometryRect, right: GeometryRect) =>
  Math.max(
    Math.abs(left.left - right.left),
    Math.abs(left.top - right.top),
    Math.abs(left.width - right.width),
    Math.abs(left.height - right.height),
  )

const isToolbarAnchored = (geometry: SelectionToolbarGeometry) =>
  geometry.selection.width > 0 &&
  geometry.toolbar.width > 0 &&
  horizontalOverlap(geometry.selection, geometry.toolbar) > 0 &&
  verticalAnchorGap(geometry) <= 24 &&
  geometry.toolbar.left >= -1 &&
  geometry.toolbar.top >= -1 &&
  geometry.toolbar.right <= geometry.viewport.width + 1 &&
  geometry.toolbar.bottom <= geometry.viewport.height + 1

const expectAnchoredToolbar = async (
  page: Page,
  response?: (geometry: SelectionToolbarGeometry) => boolean,
) => {
  let latest: SelectionToolbarGeometry | undefined
  try {
    await expect
      .poll(
        async () => {
          latest = await readSelectionToolbarGeometry(page)
          return isToolbarAnchored(latest) && (response?.(latest) ?? true)
        },
        { message: 'selection toolbar should remain anchored to the selected range' },
      )
      .toBe(true)
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nLatest geometry: ${JSON.stringify(latest)}`,
      { cause: error },
    )
  }
  if (!latest) throw new Error('Selection toolbar geometry was not measured')

  expect(horizontalOverlap(latest.selection, latest.toolbar)).toBeGreaterThan(0)
  expect(verticalAnchorGap(latest)).toBeLessThanOrEqual(24)
  return latest
}

test.describe('Plate editor ecosystem integrations', () => {
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined
  let workspaceRoot: string | undefined

  test.beforeAll(async () => {
    workspaceRoot = createWorkspace()
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.beforeEach(async () => {
    session = await launchElectronTestSession(rendererUrl, { openTargets: [workspaceRoot!] })
    await revealElectronWindow(session.app, session.page, { height: 820, width: 1100 })
    await openFile(session.page, 'Editor.md')
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspace(workspaceRoot)
  })

  test('renders math and footnotes through the real Electron editor', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session

    await expect(page.getByRole('math', { name: 'x^2' })).toBeVisible()
    await expect(page.getByRole('math', { name: 'y = 2' })).toBeVisible()
    const definition = page.locator('[role="doc-footnote"][aria-label="[^note]"]')
    await expect(definition).toContainText('Footnote body.')
    const definitionId = await definition.getAttribute('id')
    expect(definitionId).toBeTruthy()
    await expect(page.getByRole('link', { name: '[^note]' })).toHaveAttribute(
      'href',
      `#${definitionId}`,
    )
  })

  test('keeps the selection toolbar anchored across scroll, zoom, IME, and tab changes', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { app, page } = session
    const editor = page.getByTestId('markdown-editor')
    await selectPhrase(page, 'Selectable phrase')
    const initialGeometry = await expectAnchoredToolbar(page)
    const toolbar = page.getByRole('toolbar', { name: /^(Text|文本)$/i })
    expect(
      await toolbar.evaluate((element) => {
        const editorElement = document.querySelector('[data-testid="markdown-editor"]')
        return editorElement?.contains(element) ?? false
      }),
    ).toBe(false)

    const expectedScrollTop = await editor.evaluate((element) => {
      const nextScrollTop = Math.min(56, element.scrollHeight - element.clientHeight)
      element.scrollTop = nextScrollTop
      element.dispatchEvent(new Event('scroll'))
      return nextScrollTop
    })
    expect(expectedScrollTop).toBeGreaterThan(0)
    const scrolledGeometry = await expectAnchoredToolbar(
      page,
      (geometry) =>
        geometry.editorScrollTop >= expectedScrollTop - 1 &&
        Math.abs(geometry.selection.top - initialGeometry.selection.top) > 8 &&
        Math.abs(geometry.toolbar.top - initialGeometry.toolbar.top) > 8,
    )
    expect(scrolledGeometry.editorScrollTop).toBeGreaterThan(0)

    const windowHandle = await app.browserWindow(page)
    try {
      await windowHandle.evaluate((window) => window.webContents.setZoomFactor(1.35))
    } finally {
      await windowHandle.dispose()
    }
    await expectAnchoredToolbar(
      page,
      (geometry) =>
        Math.abs(geometry.viewport.width - scrolledGeometry.viewport.width) > 20 &&
        rectDelta(geometry.selection, scrolledGeometry.selection) > 1 &&
        rectDelta(geometry.toolbar, scrolledGeometry.toolbar) > 1,
    )

    await editor.dispatchEvent('compositionstart')
    await expect(page.getByRole('toolbar', { name: /^(Text|文本)$/i })).toBeHidden()
    await editor.dispatchEvent('compositionend')

    await openFile(page, 'Second.md')
    await expect(page.getByRole('toolbar', { name: /^(Text|文本)$/i })).toHaveCount(0)
  })
})
