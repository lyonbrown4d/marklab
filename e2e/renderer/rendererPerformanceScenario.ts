import { expect, type Browser, type TestInfo } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
/* eslint-disable no-restricted-imports -- Production-renderer performance retains the existing pure probes. */
import { measureFrames } from '../performance/frameMeasurement.js'
import type { LargeDocumentFixture } from '../performance/largeDocumentFixture.js'
import { measureInputLatency } from '../performance/plateInputLatencyMetrics.js'
import {
  captureEditorState,
  captureSentinelOrder,
  dragNativeScrollbar,
  exerciseWheel,
  PLATE_EDITOR_SELECTOR,
  EDITABLE_PLATE_EDITOR_SELECTOR,
  selectionState,
} from '../performance/platePerformanceMetrics.js'
import {
  assertRendererHealthy,
  attachRendererDiagnostics,
  flushRendererFixture,
  launchRendererSession,
  type RendererSession,
} from './rendererHarness.js'
/* eslint-enable no-restricted-imports */

export const runRendererPerformanceSample = async ({
  browser,
  rendererUrl,
  createFixture,
  runIndex,
  testInfo,
  warmup,
}: {
  browser: Browser
  rendererUrl: string
  createFixture: (root: string) => LargeDocumentFixture
  runIndex: number
  testInfo: TestInfo
  warmup: boolean
}) => {
  const runtimeRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-renderer-performance-'))
  let session: RendererSession | undefined
  try {
    const fixture = createFixture(runtimeRoot)
    session = await launchRendererSession(
      browser,
      rendererUrl,
      fixture.workspacePath,
      fixture.fileName,
    )
    const { page } = session
    const viewport = page.locator(PLATE_EDITOR_SELECTOR)
    const editor = page.locator(EDITABLE_PLATE_EDITOR_SELECTOR)
    const initial = await captureEditorState(page)
    const hydration = await captureSentinelOrder(page, fixture.sentinels)
    if (!warmup)
      await testInfo.attach(`renderer-run-${runIndex}-initial.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    const focusStartedAt = performance.now()
    await editor.locator('[data-slate-node="text"]').first().click()
    const focusMs = performance.now() - focusStartedAt
    const firstMarker = `marklab-first-input-${runIndex}-${Date.now()}`
    const firstInput = await measureInputLatency(page, editor, firstMarker)
    const beforeWheel = await viewport.evaluate((element) => element.scrollTop)
    const wheel = await measureFrames(page, () => exerciseWheel(page, viewport))
    const afterWheel = await viewport.evaluate((element) => element.scrollTop)
    let browserScrollbar: Awaited<ReturnType<typeof dragNativeScrollbar>> | undefined
    const scrollbar = await measureFrames(page, async () => {
      browserScrollbar = await dragNativeScrollbar(page, viewport)
    })
    // Establish a real Slate caret after the scrollbar moved focus out of the editor.
    await editor
      .locator('[data-slate-string]')
      .last()
      .click({ position: { x: 2, y: 2 } })
    await expect(editor).toBeFocused()
    await page.keyboard.press('ControlOrMeta+A')
    try {
      await expect
        .poll(async () => {
          const selection = await selectionState(page)
          const blocks = selection.blockSelection
          return (
            (selection.insideEditor && selection.textLength > 0) ||
            (blocks?.shadowInputFocused &&
              blocks.blockCount > 0 &&
              blocks.selectedBlockCount === blocks.blockCount)
          )
        })
        .toBe(true)
    } catch (error) {
      await testInfo.attach(`select-all-failure-${runIndex}.json`, {
        body: JSON.stringify(await selectionState(page, true)),
        contentType: 'application/json',
      })
      throw error
    }
    const selection = await selectionState(page)
    const mode: 'text' | 'blocks' =
      selection.insideEditor && selection.textLength > 0 ? 'text' : 'blocks'
    const selectAll = { ...selection, mode }
    await page.keyboard.press('Escape')
    await expect
      .poll(async () => (await selectionState(page, true)).blockSelection?.selectedBlockCount)
      .toBe(0)
    const selectionAfterEscape = await selectionState(page, true)
    await editor
      .locator('[data-slate-string]')
      .last()
      .click({ position: { x: 2, y: 2 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
    await expect
      .poll(async () => {
        const selection = await selectionState(page)
        return selection.insideEditor && selection.textLength === 0
      })
      .toBe(true)
    const marker = `responsive-${runIndex}-${Date.now()}`
    let continuousInput: Awaited<ReturnType<typeof measureInputLatency>> | undefined
    const typing = await measureFrames(page, async () => {
      continuousInput = await measureInputLatency(page, editor, marker)
    })
    if (!continuousInput) throw new Error('Continuous input probe did not produce metrics')
    await editor.evaluate((element) => element.blur())
    let flushResult: number | undefined
    await expect
      .poll(
        async () => {
          flushResult = await flushRendererFixture(page)
          return (await fs.readFile(fixture.filePath, 'utf8')).includes(marker)
        },
        { timeout: 30_000, intervals: [50, 100, 250, 500] },
      )
      .toBe(true)
    const persisted = await fs.readFile(fixture.filePath, 'utf8')
    const original = persisted.replaceAll(firstMarker, '').replaceAll(marker, '')
    const positions = fixture.sentinels.map((sentinel) => original.indexOf(sentinel))
    const finalState = await captureEditorState(page)
    if (!warmup)
      await testInfo.attach(`renderer-run-${runIndex}-final.png`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      })
    assertRendererHealthy(session)
    return {
      runIndex,
      warmup,
      sourceStats: fixture.sourceStats,
      initial,
      finalState,
      hydration,
      initialization: session.initialization,
      focusMs,
      firstInput,
      continuousInput,
      selectAll,
      selectionAfterEscape,
      wheel: { ...wheel, distance: afterWheel - beforeWheel },
      scrollbar: { ...scrollbar, browser: browserScrollbar },
      typing,
      persistence: {
        contract: 'renderer-buffer-to-test-fixture',
        flushCompleted: typeof flushResult === 'number',
        flushResult,
        firstMarkerPersisted: persisted.includes(firstMarker),
        markerPersisted: persisted.includes(marker),
        sentinels: {
          positions,
          allPresent: positions.every((position) => position >= 0),
          ordered: positions.every(
            (position, index) => index === 0 || position > positions[index - 1],
          ),
        },
      },
    }
  } catch (error) {
    if (session)
      await testInfo.attach(`renderer-attempt-${runIndex}-failure.png`, {
        body: await session.page.screenshot(),
        contentType: 'image/png',
      })
    throw error
  } finally {
    try {
      if (session) {
        await attachRendererDiagnostics(session, testInfo, `renderer-attempt-${runIndex}`)
      }
    } finally {
      try {
        await session?.context.close()
      } finally {
        await fs.rm(runtimeRoot, { recursive: true, force: true })
      }
    }
  }
}

export type RendererPerformanceSample = Awaited<ReturnType<typeof runRendererPerformanceSample>>
