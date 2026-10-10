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
// eslint-disable-next-line no-restricted-imports -- Product fixtures must stay outside production bundles.
import {
  createPlateBlockDragFixture,
  removePlateBlockDragFixture,
  type PlateBlockDragFixture,
} from './plateBlockDragFixture.js'
// eslint-disable-next-line no-restricted-imports -- The editing loop reuses stable block locators.
import { blockByMarker } from './plateBlockDragHarness.js'

const formattedPhrase = 'formatted phrase'

const selectPhrase = (page: Page, phrase: string) =>
  page.getByTestId('markdown-editor').evaluate((editor, target) => {
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let textNode = walker.nextNode()
    while (textNode) {
      const start = textNode.textContent?.indexOf(target) ?? -1
      if (start >= 0) {
        const range = document.createRange()
        const selection = window.getSelection()
        editor.focus({ preventScroll: true })
        range.setStart(textNode, start)
        range.setEnd(textNode, start + target.length)
        selection?.removeAllRanges()
        selection?.addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
        return
      }
      textNode = walker.nextNode()
    }
    throw new Error(`Unable to select phrase: ${target}`)
  }, phrase)

const readClipboardTextFormats = (session: ElectronTestSession) =>
  session.app.evaluate(async ({ clipboard }) => {
    const [item] = await clipboard.read()
    if (!item) return {}
    const values: Record<string, string> = {}
    for (const type of item.types.filter((candidate) => candidate.startsWith('text/'))) {
      const value = await item.getType(type)
      if ('text' in value && typeof value.text === 'function') values[type] = await value.text()
    }
    return values
  })

test.describe('Plate clipboard and block menu editing loop', () => {
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
    fs.writeFileSync(
      fixture.documentPath,
      `DRAG-BLOCK-01 contains **${formattedPhrase}**.\n\nDRAG-BLOCK-02 receives content.`,
      'utf8',
    )
    session = await launchElectronTestSession(rendererUrl, {
      openTargets: [fixture.root],
    })
    await revealElectronWindow(session.app, session.page, { height: 720, width: 1100 })
    const editor = session.page.getByTestId('markdown-editor')
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
    await expect(editor).toContainText('DRAG-BLOCK-01')
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    removePlateBlockDragFixture(fixture)
    fixture = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('publishes rich and plain formats plus explicit Markdown copy', async () => {
    if (!session || !fixture) throw new Error('Clipboard test is not initialized')
    const { page } = session
    const editor = page.getByTestId('markdown-editor')

    const firstHandle = blockByMarker(editor, 'DRAG-BLOCK-01').locator(
      'button[data-block-drag-handle="true"]',
    )
    await firstHandle.click()
    await page.getByRole('menuitem', { name: /^(Copy|复制)$/ }).click()
    await expect
      .poll(async () => (await readClipboardTextFormats(session!))['text/plain'])
      .toBe(`DRAG-BLOCK-01 contains ${formattedPhrase}.`)
    const formats = await readClipboardTextFormats(session)
    expect(formats['text/html']).toContain('<strong')
    expect(formats['text/html']).toContain(formattedPhrase)

    await firstHandle.click()
    await page.getByRole('menuitem', { name: /^(Copy as Markdown|复制为 Markdown)$/ }).click()
    await expect
      .poll(() => session!.app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain(`**${formattedPhrase}**`)
  })

  test('opens the block menu from the handle and undoes duplication atomically', async () => {
    if (!session) throw new Error('Block menu test is not initialized')
    const { page } = session
    const editor = page.getByTestId('markdown-editor')
    const firstBlock = blockByMarker(editor, 'DRAG-BLOCK-01')
    const handle = firstBlock.locator('button[data-block-drag-handle="true"]')

    await handle.click()
    await page.getByRole('menuitem', { name: /^(Duplicate|创建副本)$/ }).click()
    await expect(editor.getByText('DRAG-BLOCK-01', { exact: false })).toHaveCount(2)
    await expect(editor.locator('button[data-block-drag-handle="true"]:focus')).toHaveCount(1)

    await blockByMarker(editor, 'DRAG-BLOCK-02').click()
    await page.keyboard.press('ControlOrMeta+Z')
    await expect(editor.getByText('DRAG-BLOCK-01', { exact: false })).toHaveCount(1)
  })

  test('shows word and character counts for a text selection', async () => {
    if (!session) throw new Error('Selection stats test is not initialized')

    await selectPhrase(session.page, formattedPhrase)

    await expect(session.page.getByTestId('plate-selection-stats')).toHaveText(
      /2 (words|词) · 15 (chars|字符)/,
    )
  })
})
