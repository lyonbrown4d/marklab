import { expect, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
/* eslint-disable no-restricted-imports -- Performance E2E helpers are Node-run sibling modules. */
import {
  closePerformanceSession,
  flushWorkspaceBuffers,
  launchPerformanceSession,
  openWorkspaceWindow,
  resizeElectronWindow,
  type ElectronPerformanceSession,
  type GraphicsMode,
} from './electronPerformanceHarness.js'
import { measureFrames } from './frameProbe.js'
import { LARGE_DOCUMENT_FILE_NAME, writeLargeDocumentWorkspace } from './largeDocumentFixture.js'
import { measureInputLatency } from './plateInputLatencyMetrics.js'
import {
  captureEditorState,
  dragNativeScrollbar,
  EDITABLE_PLATE_EDITOR_SELECTOR,
  exerciseWheel,
  PLATE_EDITOR_SELECTOR,
  selectionState,
} from './platePerformanceMetrics.js'
/* eslint-enable no-restricted-imports */

const SAVE_TIMEOUT_MS = 30_000

const captureScreenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: screenshotPath })
  await testInfo.attach(name, { contentType: 'image/png', path: screenshotPath })
}

const endOfDocumentShortcut = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'

export const runLargeDocumentSample = async ({
  graphicsMode,
  rendererUrl,
  runIndex,
  testInfo,
  warmup,
}: {
  graphicsMode: GraphicsMode
  rendererUrl: string
  runIndex: number
  testInfo: TestInfo
  warmup: boolean
}) => {
  let session: ElectronPerformanceSession | undefined
  const electronOutput: string[] = []
  try {
    session = await launchPerformanceSession(rendererUrl, graphicsMode)
    const fixture = writeLargeDocumentWorkspace(session.runtimeRoot)
    const {
      initialization,
      page,
      result: openResult,
    } = await openWorkspaceWindow(session, fixture.workspacePath, LARGE_DOCUMENT_FILE_NAME)
    await resizeElectronWindow(session, page, { height: 960, width: 1440 })
    const viewport = page.locator(PLATE_EDITOR_SELECTOR)
    const activeEditor = page.locator(EDITABLE_PLATE_EDITOR_SELECTOR)
    await expect(viewport).toBeVisible()
    await expect(activeEditor).toBeVisible()
    const initial = await captureEditorState(page)
    if (!warmup) {
      await captureScreenshot(page, testInfo, `large-document-run-${runIndex}-initial`)
    }

    const focusStartedAt = performance.now()
    await activeEditor.locator('[data-slate-node="text"]').first().click()
    const focusMs = performance.now() - focusStartedAt
    const firstMarkers = ['q', 'z', 'j', 'k'] as const
    const firstMarker = firstMarkers[runIndex] ?? `m${runIndex}`
    const firstInput = await measureInputLatency(page, activeEditor, firstMarker, {
      allowUnapplied: true,
    })

    const beforeWheel = await viewport.evaluate((element) => element.scrollTop)
    const wheelFrames = await measureFrames(page, () => exerciseWheel(page, viewport))
    const afterWheel = await viewport.evaluate((element) => element.scrollTop)
    const beforeDrag = await viewport.evaluate((element) => element.scrollTop)
    let nativeScrollbar: Awaited<ReturnType<typeof dragNativeScrollbar>> | undefined
    const scrollbarFrames = await measureFrames(page, async () => {
      nativeScrollbar = await dragNativeScrollbar(page, viewport)
    })
    const afterDrag = await viewport.evaluate((element) => element.scrollTop)

    await page.keyboard.press('ControlOrMeta+A')
    const selectAll = await selectionState(page)
    await page.keyboard.press(endOfDocumentShortcut)
    await activeEditor.locator('[data-slate-node="text"]').first().click()

    const continuousMarker = `responsive-${runIndex}-${Date.now()}`
    let continuousInput: Awaited<ReturnType<typeof measureInputLatency>> | undefined
    const typingFrames = await measureFrames(page, async () => {
      continuousInput = await measureInputLatency(page, activeEditor, continuousMarker)
    })
    if (!continuousInput) throw new Error('Continuous input probe did not return metrics')

    await activeEditor.evaluate((element) => element.blur())
    let flushResult: unknown
    await expect
      .poll(
        async () => {
          flushResult = await flushWorkspaceBuffers(page)
          return fs.readFileSync(fixture.filePath, 'utf8').includes(continuousMarker)
        },
        { intervals: [50, 100, 250, 500], timeout: SAVE_TIMEOUT_MS },
      )
      .toBe(true)
    const persistedContent = fs.readFileSync(fixture.filePath, 'utf8')
    const finalState = await captureEditorState(page)
    if (!warmup) {
      await captureScreenshot(page, testInfo, `large-document-run-${runIndex}-final`)
    }

    return {
      continuousInput,
      electronOutput,
      finalState,
      firstInput,
      focusMs: Number(focusMs.toFixed(2)),
      gpuFeatureStatus: session.gpuFeatureStatus,
      graphicsMode,
      initial,
      initialization,
      isolation: session.isolation,
      openResult,
      persistence: {
        firstMarkerPersisted: persistedContent.includes(firstMarker),
        flushCompleted: true,
        flushResult,
        markerPersisted: persistedContent.includes(continuousMarker),
      },
      runIndex,
      scrollbar: {
        ...scrollbarFrames,
        afterScrollTop: afterDrag,
        beforeScrollTop: beforeDrag,
        native: nativeScrollbar,
      },
      selectAll,
      sourceStats: fixture.sourceStats,
      typing: typingFrames,
      warmup,
      wheel: {
        ...wheelFrames,
        afterScrollTop: afterWheel,
        beforeScrollTop: beforeWheel,
        distance: afterWheel - beforeWheel,
      },
    }
  } finally {
    if (session) electronOutput.push(...session.output)
    await closePerformanceSession(session)
    if (electronOutput.length > 0) {
      await testInfo.attach(`electron-output-run-${runIndex}`, {
        body: Buffer.from(electronOutput.join('\n'), 'utf8'),
        contentType: 'text/plain',
      })
    }
  }
}

export type PerformanceSample = Awaited<ReturnType<typeof runLargeDocumentSample>>
