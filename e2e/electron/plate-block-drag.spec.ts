import { expect, test, type Page, type TestInfo } from '@playwright/test'
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
// eslint-disable-next-line no-restricted-imports -- Runtime diagnostics are an E2E-only concern.
import {
  assertNoRuntimeErrors,
  attachDiagnostics,
  monitorRuntime,
  type RuntimeDiagnostics,
} from './electronRuntimeDiagnostics.js'
// eslint-disable-next-line no-restricted-imports -- Drag helpers exercise real pointer input.
import {
  blockByMarker,
  cancelBlockDrag,
  dragBlockAfter,
  dragBlockWithAutoScroll,
  installNativeDragProbe,
  openMarkdownDocument,
  readNativeDragProbe,
  readRenderedBlockOrder,
  selectBlocksByMarker,
  type NativeDragEventSnapshot,
} from './plateBlockDragHarness.js'
// eslint-disable-next-line no-restricted-imports -- Product fixtures must stay outside production bundles.
import {
  createPlateBlockDragFixture,
  readPersistedBlockOrder,
  removePlateBlockDragFixture,
  type PlateBlockDragFixture,
} from './plateBlockDragFixture.js'

test.describe('Plate block drag and drop', () => {
  let diagnostics: RuntimeDiagnostics | undefined
  let fixture: PlateBlockDragFixture | undefined
  let nativeDragSnapshots: NativeDragEventSnapshot[] = []
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.beforeEach(async () => {
    nativeDragSnapshots = []
    fixture = createPlateBlockDragFixture()
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    diagnostics = monitorRuntime(session)
    await revealElectronWindow(session.app, session.page, { height: 720, width: 1100 })
    await openMarkdownDocument(session, fixture.root, fixture.documentName)
    await installNativeDragProbe(session.page)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires a fixtures argument.
  test.afterEach(async ({}, testInfo: TestInfo) => {
    if (session && diagnostics) {
      await attachDiagnostics(session, diagnostics, testInfo)
      nativeDragSnapshots.push(...(await readNativeDragProbe(session.page)))
      await testInfo.attach('native-drag-events.json', {
        body: JSON.stringify(nativeDragSnapshots, null, 2),
        contentType: 'application/json',
      })
    }
    await closeElectronTestSession(session)
    session = undefined
    diagnostics = undefined
    removePlateBlockDragFixture(fixture)
    fixture = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('changes the real block order and preserves it after reopening', async () => {
    if (!session || !fixture || !diagnostics) throw new Error('Drag test is not initialized')
    const editor = session.page.getByTestId('markdown-editor')
    const sourceMarker = fixture.markers[1]!
    const targetMarker = fixture.markers[5]!

    await dragBlockAfter(
      session.page,
      blockByMarker(editor, sourceMarker),
      blockByMarker(editor, targetMarker),
    )
    await expect
      .poll(() => readRenderedBlockOrder(editor))
      .toEqual([
        fixture.markers[0],
        ...fixture.markers.slice(2, 6),
        sourceMarker,
        ...fixture.markers.slice(6),
      ])
    await expect
      .poll(() => readPersistedBlockOrder(fixture!.documentPath))
      .toEqual(await readRenderedBlockOrder(editor))
    assertNoRuntimeErrors(diagnostics)

    nativeDragSnapshots.push(...(await readNativeDragProbe(session.page)))
    await closeElectronTestSession(session)
    session = undefined
    diagnostics = undefined
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    diagnostics = monitorRuntime(session)
    await openMarkdownDocument(session, fixture.root, fixture.documentName)
    await installNativeDragProbe(session.page)
    await expect
      .poll(() => readRenderedBlockOrder(session!.page.getByTestId('markdown-editor')))
      .toEqual(readPersistedBlockOrder(fixture.documentPath))
    assertNoRuntimeErrors(diagnostics)
  })

  test('auto-scrolls the editor and drops into an initially invisible position', async () => {
    if (!session || !fixture || !diagnostics) throw new Error('Drag test is not initialized')
    const page = session.page
    const editor = page.getByTestId('markdown-editor')
    const sourceMarker = fixture.markers[0]!
    const targetMarker = fixture.markers[19]!
    const target = blockByMarker(editor, targetMarker)
    await expect(target).not.toBeInViewport()

    await dragBlockWithAutoScroll(page, editor, blockByMarker(editor, sourceMarker), target)

    await expect
      .poll(async () => (await readRenderedBlockOrder(editor)).indexOf(sourceMarker))
      .toBeGreaterThan((await readRenderedBlockOrder(editor)).indexOf(targetMarker))
    assertNoRuntimeErrors(diagnostics)
  })

  test('drags a disjoint block selection as a group and undoes it atomically', async () => {
    if (!session || !fixture || !diagnostics) throw new Error('Drag test is not initialized')
    const page = session.page
    const editor = page.getByTestId('markdown-editor')
    const selectedMarkers: [string, string] = [fixture.markers[1]!, fixture.markers[3]!]
    const targetMarker = fixture.markers[5]!
    const initialOrder = await readRenderedBlockOrder(editor)
    const expectedOrder = initialOrder.filter((marker) => !selectedMarkers.includes(marker))
    expectedOrder.splice(expectedOrder.indexOf(targetMarker) + 1, 0, ...selectedMarkers)

    await selectBlocksByMarker(editor, selectedMarkers)
    await expect(page.getByTestId('plate-block-selection-count')).toHaveText('2')
    await dragBlockAfter(
      page,
      blockByMarker(editor, selectedMarkers[0]),
      blockByMarker(editor, targetMarker),
    )

    await expect.poll(() => readRenderedBlockOrder(editor)).toEqual(expectedOrder)
    await expect.poll(() => readPersistedBlockOrder(fixture!.documentPath)).toEqual(expectedOrder)

    await page.locator('.slate-shadow-input').focus()
    await page.keyboard.press('ControlOrMeta+Z')
    await expect.poll(() => readRenderedBlockOrder(editor)).toEqual(initialOrder)
    await expect.poll(() => readPersistedBlockOrder(fixture!.documentPath)).toEqual(initialOrder)
    assertNoRuntimeErrors(diagnostics)
  })

  test('selects and moves blocks entirely from the keyboard with one Tab stop', async () => {
    if (!session || !fixture || !diagnostics) throw new Error('Drag test is not initialized')
    const page = session.page
    const editor = page.getByTestId('markdown-editor')
    const handles = editor.locator('button[data-block-drag-handle="true"]')
    const initialOrder = await readRenderedBlockOrder(editor)

    await expect
      .poll(() =>
        handles.evaluateAll((items) => items.filter((item) => item.tabIndex === 0).length),
      )
      .toBe(1)
    const firstSelectedHandle = blockByMarker(editor, fixture.markers[1]!).locator(
      'button[data-block-drag-handle="true"]',
    )
    await firstSelectedHandle.focus()
    await page.keyboard.press('Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Shift+Space')
    await expect(page.getByTestId('plate-block-selection-count')).toHaveText('3')
    await page.keyboard.press('ControlOrMeta+Space')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ControlOrMeta+Space')
    await expect(page.getByTestId('plate-block-selection-count')).toHaveText('3')

    await page.keyboard.press('Alt+ArrowDown')
    await expect.poll(() => readRenderedBlockOrder(editor)).not.toEqual(initialOrder)
    await page.keyboard.press('ControlOrMeta+Z')
    await expect.poll(() => readRenderedBlockOrder(editor)).toEqual(initialOrder)
    assertNoRuntimeErrors(diagnostics)
  })

  test('keeps the block order unchanged when Escape cancels a drag', async () => {
    if (!session || !fixture || !diagnostics) throw new Error('Drag test is not initialized')
    const page: Page = session.page
    const editor = page.getByTestId('markdown-editor')
    const initialOrder = await readRenderedBlockOrder(editor)

    await cancelBlockDrag(
      page,
      blockByMarker(editor, fixture.markers[2]!),
      blockByMarker(editor, fixture.markers[6]!),
    )

    await expect.poll(() => readRenderedBlockOrder(editor)).toEqual(initialOrder)
    expect(readPersistedBlockOrder(fixture.documentPath)).toEqual(fixture.markers)
    assertNoRuntimeErrors(diagnostics)
  })
})
