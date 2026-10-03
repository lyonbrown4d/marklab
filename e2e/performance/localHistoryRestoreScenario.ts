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
import { measureFrames } from './frameMeasurement.js'
import {
  type LocalHistoryDocumentKind,
  writeLocalHistoryRestoreFixture,
} from './localHistoryRestoreFixture.js'
import { measureInputLatency } from './plateInputLatencyMetrics.js'
import {
  captureEditorState,
  EDITABLE_PLATE_EDITOR_SELECTOR,
  PLATE_EDITOR_SELECTOR,
} from './platePerformanceMetrics.js'
/* eslint-enable no-restricted-imports */

const RESTORE_TIMEOUT_MS = 90_000
const SAVE_TIMEOUT_MS = 30_000
const INPUT_MARKER = 'restore_input_probe_4v8m'
const endOfDocumentShortcut = process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End'

const historyUi = async (page: Page) => {
  await page.keyboard.press('Control+Shift+L')
  const drawer = page.getByRole('dialog', { name: /Toggle sidebar|切换侧边栏/i })
  await expect(drawer).toBeVisible()

  const previewButton = drawer.getByRole('button', { name: /Preview version|预览.*版本/i }).first()
  await expect(previewButton).toBeVisible()
  await previewButton.click()

  const previewDialog = page.getByRole('dialog', {
    name: /Local history preview|本地历史预览/i,
  })
  await expect(previewDialog).toBeVisible()
  await previewDialog.getByRole('button', { name: /^(Restore|恢复)$/i }).click()

  const confirmation = page.getByRole('alertdialog')
  await expect(confirmation).toBeVisible()
  return {
    confirmation,
    confirmRestore: confirmation.getByRole('button', { name: /^(Restore|恢复)$/i }),
    drawer,
    previewDialog,
  }
}

const markerRendered = (page: Page, marker: string) =>
  page.evaluate(
    ({ expectedMarker, selector }) =>
      document.querySelector<HTMLElement>(selector)?.textContent?.includes(expectedMarker) ?? false,
    { expectedMarker: marker, selector: PLATE_EDITOR_SELECTOR },
  )

const waitForRestoredMarker = (page: Page, marker: string) =>
  page.waitForFunction(
    ({ expectedMarker, selector }) =>
      document.querySelector<HTMLElement>(selector)?.textContent?.includes(expectedMarker) ?? false,
    { expectedMarker: marker, selector: PLATE_EDITOR_SELECTOR },
    { timeout: RESTORE_TIMEOUT_MS },
  )

export const runLocalHistoryRestoreSample = async ({
  documentKind = 'text-heavy',
  graphicsMode,
  rendererUrl,
  testInfo,
}: {
  documentKind?: LocalHistoryDocumentKind
  graphicsMode: GraphicsMode
  rendererUrl: string
  testInfo: TestInfo
}) => {
  let session: ElectronPerformanceSession | undefined
  const electronOutput: string[] = []
  try {
    session = await launchPerformanceSession(rendererUrl, graphicsMode)
    const fixture = await writeLocalHistoryRestoreFixture(
      session.runtimeRoot,
      session.isolation.userData,
      documentKind,
    )
    const {
      initialization,
      page,
      result: openResult,
    } = await openWorkspaceWindow(session, fixture.workspacePath, fixture.fileName)
    await resizeElectronWindow(session, page, { height: 960, width: 1440 })
    const viewport = page.locator(PLATE_EDITOR_SELECTOR)
    const activeEditor = page.locator(EDITABLE_PLATE_EDITOR_SELECTOR)
    await expect(viewport).toBeVisible()
    await expect(activeEditor).toBeVisible()
    await expect.poll(() => markerRendered(page, fixture.marker)).toBe(false)

    const ui = await historyUi(page)
    const restoreStartedAt = performance.now()
    const restoreFrames = await measureFrames(page, async () => {
      await ui.confirmRestore.click()
      await expect(viewport).toHaveAttribute('data-state', 'loading', {
        timeout: RESTORE_TIMEOUT_MS,
      })
      await expect(viewport).toHaveAttribute('data-state', 'ready', {
        timeout: RESTORE_TIMEOUT_MS,
      })
    })
    await waitForRestoredMarker(page, fixture.marker)
    const restoreToMarkerMs = performance.now() - restoreStartedAt
    const restoredMarkerRendered = await markerRendered(page, fixture.marker)
    const restoredFileMatchedSnapshot =
      fs.readFileSync(fixture.filePath, 'utf8') === fixture.historyContent

    await expect(ui.confirmation).toBeHidden()
    await expect(ui.previewDialog).toBeHidden()
    await page.keyboard.press('Control+Shift+L')
    await expect(ui.drawer).toBeHidden()

    await activeEditor.locator('[data-slate-node="text"]').first().click()
    await page.keyboard.press(endOfDocumentShortcut)
    const input = await measureInputLatency(page, activeEditor, INPUT_MARKER)
    await activeEditor.evaluate((element) => element.blur())

    let flushResult: unknown
    await expect
      .poll(
        async () => {
          flushResult = await flushWorkspaceBuffers(page)
          return fs.readFileSync(fixture.filePath, 'utf8').includes(INPUT_MARKER)
        },
        { intervals: [50, 100, 250, 500], timeout: SAVE_TIMEOUT_MS },
      )
      .toBe(true)
    const inputPersisted = fs.readFileSync(fixture.filePath, 'utf8').includes(INPUT_MARKER)
    const finalState = await captureEditorState(page)

    return {
      electronOutput,
      finalState,
      fixture: {
        historyBytes: fixture.historyStats.bytes,
        historyBlocks: fixture.historyStats.blockCount,
        historyEntryId: fixture.historyEntryId,
        historyLines: fixture.historyStats.lines,
        marker: fixture.marker,
      },
      flushResult,
      gpuFeatureStatus: session.gpuFeatureStatus,
      graphicsMode,
      initialization,
      input,
      inputPersisted,
      isolation: session.isolation,
      openResult,
      restoredFileMatchedSnapshot,
      restoredMarkerRendered,
      restoreFrames,
      restoreToMarkerMs: Number(restoreToMarkerMs.toFixed(2)),
    }
  } finally {
    if (session) electronOutput.push(...session.output)
    await closePerformanceSession(session)
    if (electronOutput.length > 0) {
      await testInfo.attach('electron-output-local-history-restore', {
        body: Buffer.from(electronOutput.join('\n'), 'utf8'),
        contentType: 'text/plain',
      })
    }
  }
}

export type LocalHistoryRestoreSample = Awaited<ReturnType<typeof runLocalHistoryRestoreSample>>
