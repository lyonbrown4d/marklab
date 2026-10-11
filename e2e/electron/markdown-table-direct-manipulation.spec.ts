import { expect, test, type Locator, type Page } from '@playwright/test'
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

const FIXTURE_PREFIX = 'marklab-table-direct-manipulation-'
const DOCUMENT_NAME = 'Table.md'

type TableFixture = {
  documentPath: string
  root: string
}

const createFixture = (markdown: string): TableFixture => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  const documentPath = path.join(root, DOCUMENT_NAME)
  fs.writeFileSync(documentPath, markdown, 'utf8')
  return { documentPath, root }
}

const removeFixture = (fixture: TableFixture | undefined) => {
  if (!fixture) return
  const root = path.resolve(fixture.root)
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith(FIXTURE_PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected E2E workspace: ${root}`)
  }
  fs.rmSync(root, { force: true, recursive: true })
}

const editingModeGroup = (page: Page) =>
  page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })

const readOpenBuffer = (page: Page) =>
  page.evaluate(async (filePath) => {
    const rendererWindow = window as Window & {
      marklabElectron?: {
        commands?: { invoke: (command: string, payload?: unknown) => Promise<unknown> }
      }
    }
    return rendererWindow.marklabElectron?.commands?.invoke('fs_open_file', {
      path: filePath,
    }) as Promise<string>
  }, DOCUMENT_NAME)

const showWysiwyg = async (page: Page) => {
  await editingModeGroup(page)
    .getByRole('radio', { name: /^(WYSIWYG|Rich Text Editor|所见即所得)$/i })
    .click()
  const editor = page.getByTestId('markdown-editor')
  await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 15_000 })
  return editor
}

const dragHorizontally = async (page: Page, handle: Locator, distance: number) => {
  const box = await handle.boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + distance, start.y, { steps: 8 })
  await page.mouse.up()
}

const writeClipboard = (session: ElectronTestSession, text: string) =>
  session.app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text)

const writeRichClipboard = (session: ElectronTestSession, text: string, html: string) =>
  session.app.evaluate(
    ({ ClipboardItem, clipboard }, value) =>
      clipboard.write([
        new ClipboardItem({
          'text/html': value.html,
          'text/plain': value.text,
        }),
      ]),
    { html, text },
  )

test.describe('Markdown table direct manipulation', () => {
  let fixture: TableFixture | undefined
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  const openFixture = async (markdown: string, expectedText: string) => {
    fixture = createFixture(markdown)
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    await revealElectronWindow(session.app, session.page, { height: 900, width: 1280 })
    const editor = session.page.getByTestId('markdown-editor')
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
    await expect(editor).toContainText(expectedText, { timeout: 15_000 })
    return session
  }

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    removeFixture(fixture)
    fixture = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('resizes, selects, and moves table rows and columns', async () => {
    const markdown = '| Name | Status |\n| --- | --- |\n| Alpha | One |\n| Beta | Two |'
    const { page } = await openFixture(markdown, 'Alpha')
    const editor = await showWysiwyg(page)
    const firstCell = editor.locator('table:visible th').first()
    await expect(firstCell).toBeVisible()
    await firstCell.hover()

    const resizeHandle = firstCell.getByRole('separator', {
      name: /Resize column 1|调整第 1 列宽度/i,
    })
    await expect(resizeHandle).toBeVisible()
    const originalWidth = (await firstCell.boundingBox())?.width ?? 0
    await dragHorizontally(page, resizeHandle, 80)
    await expect
      .poll(async () => (await firstCell.boundingBox())?.width ?? 0)
      .toBeGreaterThan(originalWidth + 30)
    const draggedWidth = (await firstCell.boundingBox())?.width ?? 0
    await resizeHandle.focus()
    await page.keyboard.press('ArrowLeft')
    await expect
      .poll(async () => (await firstCell.boundingBox())?.width ?? 0)
      .toBeLessThan(draggedWidth - 8)
    const keyboardWidth = (await firstCell.boundingBox())?.width ?? 0
    await page.keyboard.press('Shift+ArrowRight')
    await expect
      .poll(async () => (await firstCell.boundingBox())?.width ?? 0)
      .toBeGreaterThan(keyboardWidth + 30)
    await expect
      .poll(() => readOpenBuffer(page))
      .toMatch(
        /\|\s*Name\s*\|\s*Status\s*\|[\s\S]*\|\s*Alpha\s*\|\s*One\s*\|[\s\S]*\|\s*Beta\s*\|\s*Two\s*\|/u,
      )

    const nameHeader = editor.locator('table:visible th').filter({ hasText: 'Name' })
    await nameHeader.hover()
    const headerRowGutter = editor.getByRole('button', {
      name: /Select row 1|选择第 1 行/i,
    })
    await headerRowGutter.press('Alt+ArrowDown')
    await expect(editor.locator('table:visible tr').first()).toContainText('Name')

    const alphaCell = editor
      .locator('table:visible tr')
      .filter({ hasText: 'Alpha' })
      .locator('td')
      .first()
    await alphaCell.hover()
    const firstBodyRowGutter = editor.getByRole('button', {
      name: /Select row 2|选择第 2 行/i,
    })
    await firstBodyRowGutter.press('Alt+ArrowUp')
    await expect(editor.locator('table:visible tr').nth(1)).toContainText('Alpha')

    const betaCell = editor
      .locator('table:visible tr')
      .filter({ hasText: 'Beta' })
      .locator('td')
      .first()
    await betaCell.hover()
    const thirdRowGutter = editor.getByRole('button', {
      name: /Select row 3|选择第 3 行/i,
    })
    await thirdRowGutter.press('Alt+ArrowUp')
    await expect(editor.locator('table:visible tr').nth(1)).toContainText('Beta')
    await betaCell.hover()
    const movedRowGutter = editor.getByRole('button', {
      name: /Select row 2|选择第 2 行/i,
    })
    await movedRowGutter.focus()
    await page.keyboard.press('Enter')
    await expect(editor.locator('[data-table-cell-selected="true"]')).toHaveCount(2)
    await page.keyboard.press('Escape')

    const statusHeader = editor.locator('table:visible th').filter({ hasText: 'Status' })
    await statusHeader.hover()
    const secondColumnGutter = editor.getByRole('button', {
      name: /Select column 2|选择第 2 列/i,
    })
    await secondColumnGutter.press('Alt+ArrowLeft')
    await expect(editor.locator('table:visible th').first()).toContainText('Status')
    await statusHeader.hover()
    const movedColumnGutter = editor.getByRole('button', {
      name: /Select column 1|选择第 1 列/i,
    })
    await movedColumnGutter.focus()
    await page.keyboard.press('Enter')
    await expect(editor.locator('[data-table-cell-selected="true"]')).toHaveCount(3)
    await page.keyboard.press('Escape')

    await editor.locator('table:visible th').first().click()
    await page.keyboard.press('ControlOrMeta+Z')
    const rows = editor.locator('table:visible tr')
    await expect(rows.first().locator('th').first()).toContainText('Name')
    await expect(rows.first().locator('th').nth(1)).toContainText('Status')
    await expect(rows.nth(1).locator('td').first()).toContainText('Beta')
    await expect(rows.nth(1).locator('td').nth(1)).toContainText('Two')
    await expect(rows.nth(2).locator('td').first()).toContainText('Alpha')
    await expect(rows.nth(2).locator('td').nth(1)).toContainText('One')
    await expect
      .poll(() => readOpenBuffer(page))
      .toMatch(/\|\s*Name\s*\|\s*Status\s*\|[\s\S]*\|\s*Beta\s*\|\s*Two\s*\|/u)
  })

  test('handles delimited, prose, rich, and code-block clipboard content', async () => {
    const markdown = [
      'CSV target',
      '',
      'TSV target',
      '',
      'Plain target',
      '',
      'Comma target',
      '',
      'Rich target',
      '',
      '~~~text',
      'Code target',
      '~~~',
    ].join('\n')
    const activeSession = await openFixture(markdown, 'CSV target')
    const { page } = activeSession
    const editor = await showWysiwyg(page)
    const pasteAfter = async (marker: string, text: string) => {
      const target = editor.getByText(marker, { exact: true })
      await target.click()
      await page.keyboard.press('End')
      await page.keyboard.press('Enter')
      await writeClipboard(activeSession, text)
      await page.keyboard.press('ControlOrMeta+V')
    }

    await pasteAfter('CSV target', 'Name,Status\nMarklab,Ready')
    const tables = editor.locator('table:visible')
    await expect(tables).toHaveCount(1)
    await expect(tables.first()).toContainText('Marklab')

    await pasteAfter('TSV target', 'Name\tStatus\nMarklab\tReady')
    await expect(tables).toHaveCount(2)
    await expect(tables.nth(1)).toContainText('Marklab')

    await pasteAfter('Plain target', 'ordinary single-column clipboard text')
    await expect(editor).toContainText('ordinary single-column clipboard text')
    await expect(tables).toHaveCount(2)

    await pasteAfter('Comma target', 'Hello, world')
    await expect(editor).toContainText('Hello, world')
    await expect(tables).toHaveCount(2)

    const richTarget = editor.getByText('Rich target', { exact: true })
    await richTarget.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await writeRichClipboard(activeSession, 'Hello, world', '<strong>Hello, world</strong>')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(editor.locator('strong').filter({ hasText: 'Hello, world' })).toBeVisible()

    const code = editor.locator('pre:visible code')
    await expect(code).toContainText('Code target')
    await code.getByText('Code target', { exact: true }).click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await writeClipboard(activeSession, 'Name,Status\nMarklab,Ready')
    await page.keyboard.press('ControlOrMeta+V')
    await expect(code).toContainText('Name,Status')
    await expect(code).toContainText('Marklab,Ready')
    await expect(tables).toHaveCount(2)
  })
})
