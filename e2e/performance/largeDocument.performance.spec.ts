import { expect, test, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Performance E2E reuses the production-build renderer server.
import { closeRendererServer, startRendererServer } from '../electron/electronTestHarness.js'
/* eslint-disable no-restricted-imports -- Node-run Playwright helpers use explicit relative ESM imports. */
import {
  closePerformanceSession,
  launchPerformanceSession,
  openWorkspaceWindow,
  resizeElectronWindow,
  type ElectronPerformanceSession,
  type GraphicsMode,
} from './electronPerformanceHarness.js'
import { measureFrames, waitForAnimationFrames, type FrameMetrics } from './frameProbe.js'
import { LARGE_DOCUMENT_FILE_NAME, writeLargeDocumentWorkspace } from './largeDocumentFixture.js'
import { performanceBudgetForProject } from './performanceBudgets.js'
/* eslint-enable no-restricted-imports */

const captureEditorState = (page: Page) =>
  page.evaluate(() => {
    const paragraphStyle = (element: HTMLElement | null) => {
      if (!element) return null
      const style = getComputedStyle(element)
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        marginBottom: style.marginBottom,
        marginTop: style.marginTop,
        paddingBottom: style.paddingBottom,
        paddingTop: style.paddingTop,
      }
    }
    const viewport = document.querySelector<HTMLElement>('.crepe-playground > .milkdown')
    return {
      activeEditors: viewport?.querySelectorAll('.ProseMirror[contenteditable="true"]').length ?? 0,
      activeParagraphStyle: paragraphStyle(
        viewport?.querySelector<HTMLElement>('.ProseMirror[contenteditable="true"] p') ?? null,
      ),
      scrollHeight: viewport?.scrollHeight ?? 0,
      usedJsHeapBytes:
        'memory' in performance
          ? (performance as Performance & { memory: { usedJSHeapSize: number } }).memory
              .usedJSHeapSize
          : null,
      viewportHeight: viewport?.clientHeight ?? 0,
    }
  })

const captureScreenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  const path = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path })
  await testInfo.attach(name, { contentType: 'image/png', path })
}

const dragNativeScrollbar = async (page: Page) => {
  const viewport = page.locator('.crepe-playground > .milkdown')
  const box = await viewport.boundingBox()
  if (!box) throw new Error('Editor viewport has no bounding box')
  const scroll = await viewport.evaluate((element) => {
    const viewportElement = element as HTMLElement
    return {
      clientHeight: viewportElement.clientHeight,
      clientWidth: viewportElement.clientWidth,
      offsetWidth: viewportElement.offsetWidth,
      scrollHeight: viewportElement.scrollHeight,
      scrollTop: viewportElement.scrollTop,
    }
  })
  const thumbHeight = Math.max(24, scroll.clientHeight ** 2 / scroll.scrollHeight)
  const availableTrack = scroll.clientHeight - thumbHeight
  const thumbTop =
    scroll.scrollTop === 0
      ? 0
      : (scroll.scrollTop / (scroll.scrollHeight - scroll.clientHeight)) * availableTrack
  const startY = box.y + thumbTop + thumbHeight / 2
  const endY = box.y + box.height - 10
  const scrollbarWidth = scroll.offsetWidth - scroll.clientWidth
  const scrollbarCenterX =
    scrollbarWidth > 0 ? box.x + scroll.clientWidth + scrollbarWidth / 2 : box.x + box.width - 6
  const xCandidates = [
    scrollbarCenterX,
    box.x + box.width - 4,
    box.x + box.width - 8,
    box.x + box.width - 12,
  ]
  for (const x of [...new Set(xCandidates)]) {
    await page.mouse.move(x, startY)
    await page.mouse.down()
    for (let step = 1; step <= 40; step += 1) {
      await page.mouse.move(x, startY + ((endY - startY) * step) / 40)
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      )
    }
    await page.mouse.up()
    if ((await viewport.evaluate((element) => element.scrollTop)) > scroll.scrollTop) return
  }
}

const exerciseWheel = async (page: Page) => {
  const viewport = page.locator('.crepe-playground > .milkdown')
  const box = await viewport.boundingBox()
  if (!box) throw new Error('Editor viewport has no bounding box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let index = 0; index < 36; index += 1) {
    await page.mouse.wheel(0, 620)
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    )
  }
}

const assertFrameBudget = (
  label: string,
  metrics: FrameMetrics,
  budget: ReturnType<typeof performanceBudgetForProject>,
) => {
  expect.soft(metrics.blankFrames, `${label} produced blank editor frames`).toBe(0)
  expect.soft(metrics.loadingFrames, `${label} exposed a loading editor surface`).toBe(0)
  expect
    .soft(metrics.layoutShift, `${label} layout shift exceeded its budget`)
    .toBeLessThanOrEqual(budget.maxLayoutShift)
  expect
    .soft(metrics.maxVisibleSurfaces, `${label} exposed too many editor surfaces in one frame`)
    .toBeLessThanOrEqual(budget.maxVisibleSurfaces)
  expect
    .soft(metrics.p95FrameMs, `${label} p95 frame time exceeded its budget`)
    .toBeLessThanOrEqual(budget.p95FrameMs)
  expect
    .soft(metrics.maxFrameMs, `${label} maximum frame time exceeded its budget`)
    .toBeLessThanOrEqual(budget.maxFrameMs)
}

test.describe('large Markdown document @performance @blackbox', () => {
  let rendererServer: http.Server | undefined
  let rendererUrl = ''

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererServer = renderer.server
    rendererUrl = renderer.url
  })

  test.afterAll(async () => closeRendererServer(rendererServer))

  // eslint-disable-next-line no-empty-pattern -- Electron owns the browser lifecycle; Playwright still requires a destructured fixture argument.
  test('captures rich-editor rendering and interaction regressions', async ({}, testInfo) => {
    const graphicsMode = testInfo.project.name as GraphicsMode
    const budget = performanceBudgetForProject(testInfo.project.name)
    let session: ElectronPerformanceSession | undefined
    try {
      session = await launchPerformanceSession(rendererUrl, graphicsMode)
      const fixture = writeLargeDocumentWorkspace(session.runtimeRoot)
      const loadStartedAt = performance.now()
      const { page, result: openResult } = await openWorkspaceWindow(
        session,
        fixture.workspacePath,
        LARGE_DOCUMENT_FILE_NAME,
      )
      await resizeElectronWindow(session, page, { height: 960, width: 1440 })
      const viewport = page.locator('.crepe-playground > .milkdown')
      const activeEditor = viewport.locator('.ProseMirror[contenteditable="true"]')
      await expect(viewport).toBeVisible()
      await expect(activeEditor).toBeVisible()
      const loadMs = performance.now() - loadStartedAt
      const initial = await captureEditorState(page)
      await captureScreenshot(page, testInfo, 'large-document-initial')

      const wheel = await measureFrames(page, () => exerciseWheel(page))
      await viewport.evaluate((element) => {
        element.scrollTop = element.scrollHeight * 0.1
      })
      await waitForAnimationFrames(page, 12)
      const beforeDrag = await viewport.evaluate((element) => element.scrollTop)
      const scrollbarDrag = await measureFrames(page, () => dragNativeScrollbar(page))
      const afterDrag = await viewport.evaluate((element) => element.scrollTop)
      await captureScreenshot(page, testInfo, 'large-document-after-scrollbar-drag')

      const focusStartedAt = performance.now()
      await activeEditor.click()
      const focusMs = performance.now() - focusStartedAt
      await page.keyboard.press('Control+A')
      const selectAll = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>(
          '.crepe-playground > .milkdown > .ProseMirror[contenteditable="true"]',
        )
        const selection = window.getSelection()
        return {
          insideEditor:
            Boolean(selection?.anchorNode && editor?.contains(selection.anchorNode)) &&
            Boolean(selection?.focusNode && editor?.contains(selection.focusNode)),
          textLength: selection?.toString().length ?? 0,
        }
      })
      await page.keyboard.press('Control+End')
      const marker = ` responsive typing ${Date.now()}`
      const typingStartedAt = performance.now()
      const typing = await measureFrames(page, () =>
        activeEditor.pressSequentially(marker, { delay: 10 }),
      )
      const typingMs = performance.now() - typingStartedAt
      const renderedDocumentText = await viewport.textContent()
      const typingApplied = renderedDocumentText?.includes(marker.trim()) ?? false
      const activeEditorSurvived = (await activeEditor.count()) === 1
      const finalState = await captureEditorState(page)
      await captureScreenshot(page, testInfo, 'large-document-after-typing')

      const results = {
        finalState,
        focusMs: Number(focusMs.toFixed(2)),
        graphicsMode,
        initial,
        loadMs: Number(loadMs.toFixed(2)),
        openResult,
        scrollbarDrag: { ...scrollbarDrag, afterDrag, beforeDrag },
        sourceStats: fixture.sourceStats,
        selectAll,
        typing: {
          ...typing,
          activeEditorSurvived,
          applied: typingApplied,
          durationMs: Number(typingMs.toFixed(2)),
        },
        wheel,
      }
      const metricsPath = testInfo.outputPath('large-document-metrics.json')
      fs.writeFileSync(metricsPath, JSON.stringify(results, null, 2))
      await testInfo.attach('large-document-metrics', {
        contentType: 'application/json',
        path: metricsPath,
      })

      expect.soft(initial.activeEditors).toBe(1)
      expect.soft(finalState.activeEditors).toBe(1)
      expect.soft(selectAll.insideEditor, 'Ctrl+A selection escaped the editor').toBe(true)
      expect
        .soft(selectAll.textLength, 'Ctrl+A did not select the complete large document')
        .toBeGreaterThan(1_000)
      expect
        .soft(afterDrag, 'native scrollbar drag did not move the viewport')
        .toBeGreaterThan(beforeDrag)
      expect.soft(activeEditorSurvived, 'active editor was replaced while typing').toBe(true)
      expect.soft(typingApplied, 'typed content was not applied to the editor').toBe(true)
      expect
        .soft(loadMs, 'large document load exceeded its budget')
        .toBeLessThanOrEqual(budget.loadMs)
      expect.soft(focusMs, 'editor focus exceeded its budget').toBeLessThanOrEqual(budget.focusMs)
      expect
        .soft(typingMs, 'typing interaction exceeded its budget')
        .toBeLessThanOrEqual(budget.typingMs)
      assertFrameBudget('wheel scrolling', wheel, budget)
      assertFrameBudget('native scrollbar dragging', scrollbarDrag, budget)
      assertFrameBudget('typing', typing, budget)
    } finally {
      await closePerformanceSession(session)
    }
  })
})
