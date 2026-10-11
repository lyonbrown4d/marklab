import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
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
// eslint-disable-next-line no-restricted-imports -- Product fixtures stay outside production bundles.
import {
  createPlateBlockDragFixture,
  removePlateBlockDragFixture,
  type PlateBlockDragFixture,
} from './plateBlockDragFixture.js'

const phrase = 'selection toolbar workflow'

type GeometryRect = {
  bottom: number
  left: number
  right: number
  top: number
}

const findPhrasePoints = (page: Page, target: string) =>
  page.getByTestId('markdown-editor').evaluate((editor, text) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let textNode = walker.nextNode()
    while (textNode) {
      const start = textNode.textContent?.indexOf(text) ?? -1
      if (start >= 0) {
        const startRange = document.createRange()
        const endRange = document.createRange()
        startRange.setStart(textNode, start)
        startRange.setEnd(textNode, start + 1)
        endRange.setStart(textNode, start + text.length - 1)
        endRange.setEnd(textNode, start + text.length)
        const startRect = startRange.getBoundingClientRect()
        const endRect = endRange.getBoundingClientRect()
        return {
          end: { x: endRect.right - 1, y: endRect.top + endRect.height / 2 },
          start: { x: startRect.left + 1, y: startRect.top + startRect.height / 2 },
        }
      }
      textNode = walker.nextNode()
    }
    throw new Error(`Unable to select phrase: ${text}`)
  }, target)

const expectTextSelection = async (page: Page, target: string) => {
  expect(await page.evaluate(() => window.getSelection()?.toString())).toContain(target)
  await expect(page.getByRole('toolbar', { name: /^(Text|文本)$/ })).toBeVisible()
}

const selectPhraseByDragging = async (page: Page, target: string) => {
  await expect(async () => {
    const points = await findPhrasePoints(page, target)
    await page.mouse.move(points.start.x, points.start.y)
    await page.mouse.down()
    for (let step = 1; step <= 6; step += 1) {
      const progress = step / 6
      await page.mouse.move(
        points.start.x + (points.end.x - points.start.x) * progress,
        points.start.y + (points.end.y - points.start.y) * progress,
      )
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      )
    }
    await page.mouse.up()
    await expectTextSelection(page, target)
  }).toPass({ intervals: [100, 250, 500], timeout: 10_000 })
}

const selectParagraphText = async (page: Page, target: string) => {
  await expect(async () => {
    const points = await findPhrasePoints(page, target)
    await page.mouse.click(points.start.x + (points.end.x - points.start.x) / 2, points.start.y, {
      clickCount: 3,
    })
    await expectTextSelection(page, target)
  }).toPass({ intervals: [100, 250, 500], timeout: 10_000 })
}

const readSelectionRect = (page: Page) =>
  page.evaluate((): GeometryRect => {
    const selection = window.getSelection()
    if (!selection?.rangeCount) throw new Error('Text selection geometry is unavailable')
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top }
  })

const expectComposerNearSelection = async (page: Page, selection: GeometryRect) => {
  const dialog = page.getByRole('dialog', { name: /^(AI writing assistant|AI 写作助手)$/ })
  await expect(dialog).toBeVisible()
  await expect
    .poll(async () => {
      const box = await dialog.boundingBox()
      if (!box) return false
      const verticalGap = box.y - selection.bottom
      const overlapsHorizontally =
        box.x <= selection.right + 12 && box.x + box.width >= selection.left - 12
      return verticalGap >= -1 && verticalGap <= 40 && overlapsHorizontally
    })
    .toBe(true)
}

const openMoreMenu = async (page: Page) => {
  await page.getByRole('button', { name: /^(More actions|更多操作)$/ }).click()
}

test.describe('Plate selection toolbar More menu', () => {
  let fixture: PlateBlockDragFixture | undefined
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.beforeEach(async () => {
    fixture = createPlateBlockDragFixture()
    fs.writeFileSync(fixture.documentPath, phrase, 'utf8')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    await revealElectronWindow(session.app, session.page, { height: 720, width: 1100 })
    const editor = session.page.getByTestId('markdown-editor')
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
    await expect(editor).toContainText(phrase)
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    removePlateBlockDragFixture(fixture)
    fixture = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('transforms blocks, copies Markdown, and opens the active AI composer', async () => {
    if (!session) throw new Error('Selection toolbar test is not initialized')
    const { app, page } = session

    await selectPhraseByDragging(page, phrase)
    await selectParagraphText(page, phrase)
    await openMoreMenu(page)
    await page.getByRole('menuitem', { name: /^(Quote|引用)$/ }).click()
    const editor = page.getByTestId('markdown-editor')
    await expect(editor.locator('blockquote')).toContainText(phrase)

    await page.keyboard.insertText('changed')
    await expect(editor.locator('blockquote')).toContainText('changed')
    await page.keyboard.press('ControlOrMeta+Z')
    await expect(editor.locator('blockquote')).toContainText(phrase)
    await page.keyboard.press('ControlOrMeta+Z')
    await expect(editor.locator('blockquote')).toHaveCount(0)
    await expect(editor.locator('p')).toContainText(phrase)

    await selectParagraphText(page, phrase)
    await openMoreMenu(page)
    await page.getByRole('menuitem', { name: /^(Heading 2|二级标题)$/ }).click()
    await expect(editor.locator('h2')).toContainText(phrase)

    await selectParagraphText(page, phrase)
    await openMoreMenu(page)
    await page.getByRole('menuitem', { name: /^(Bulleted list|无序列表)$/ }).click()
    await expect(editor.locator('ul')).toContainText(phrase)

    await selectParagraphText(page, phrase)
    await openMoreMenu(page)
    await page.getByRole('menuitem', { name: /^(Copy as Markdown|复制为 Markdown)$/ }).click()
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toBe(`- ${phrase}`)

    await selectParagraphText(page, phrase)
    const selection = await readSelectionRect(page)
    await openMoreMenu(page)
    await page.getByRole('menuitem', { name: /^(Ask AI|询问 AI)$/ }).click()
    await expectComposerNearSelection(page, selection)
  })
})
