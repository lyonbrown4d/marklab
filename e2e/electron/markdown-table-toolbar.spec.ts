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

const FIXTURE_PREFIX = 'marklab-table-toolbar-'

const createWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  fs.writeFileSync(path.join(root, 'Table.md'), '# Table fixture\n', 'utf8')
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

const openWorkspace = async (session: ElectronTestSession, workspacePath: string) => {
  const root = await session.page.evaluate(async (targetPath) => {
    const rendererWindow = window as Window & {
      marklabElectron?: {
        commands?: { invoke: (command: string, payload?: unknown) => Promise<unknown> }
      }
    }
    return rendererWindow.marklabElectron?.commands?.invoke('fs_set_root', {
      path: targetPath,
    }) as Promise<{ kind: 'external'; path: string }>
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

const waitForWorkspace = async (page: Page) => {
  const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
  if (!(await explorer.isVisible().catch(() => false))) await page.keyboard.press('Control+Shift+L')
  await expect(explorer.getByRole('button', { exact: true, name: 'Table.md' })).toBeVisible({
    timeout: 30_000,
  })
  await explorer.getByRole('button', { exact: true, name: 'Table.md' }).click()
  await expect(page.getByTestId('markdown-editor')).toBeVisible({ timeout: 15_000 })
}

const readOpenBuffer = (page: Page) =>
  page.evaluate(async () => {
    const rendererWindow = window as Window & {
      marklabElectron?: {
        commands?: { invoke: (command: string, payload?: unknown) => Promise<unknown> }
      }
    }
    return rendererWindow.marklabElectron?.commands?.invoke('fs_open_file', {
      path: 'Table.md',
    }) as Promise<string>
  })

test.describe('Markdown table toolbar', () => {
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
    session = await launchElectronTestSession(rendererUrl)
    await revealElectronWindow(session.app, session.page, { height: 900, width: 1280 })
    await openWorkspace(session, workspaceRoot!)
    await waitForWorkspace(session.page)
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspace(workspaceRoot)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('anchors the localized toolbar to a table created in source mode', async ({}, testInfo) => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    const editingModeGroup = page.getByRole('radiogroup', {
      name: /Editing Mode|编辑模式/i,
    })
    await editingModeGroup.getByRole('radio', { name: /^(Source|Source Editor|源码)$/i }).click()
    const sourceEditor = page.locator('.monaco-editor')
    await expect(sourceEditor).toBeVisible({ timeout: 10_000 })
    await sourceEditor.click()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText('| Name | Status |\n| --- | --- |\n| Marklab | Ready |')
    await expect(sourceEditor.locator('.view-lines')).toContainText('Marklab')
    await expect(page.getByRole('contentinfo')).toContainText(/3\s+(Lines|行)/i)
    await expect.poll(() => readOpenBuffer(page)).toContain('Marklab')

    await editingModeGroup
      .getByRole('radio', { name: /^(WYSIWYG|Rich Text Editor|所见即所得)$/i })
      .click()
    await expect.poll(() => readOpenBuffer(page)).toContain('Marklab')
    const activeCell = page.getByTestId('markdown-editor').locator('table:visible td').first()
    await expect(activeCell).toBeVisible({ timeout: 10_000 })
    await activeCell.click()

    const toolbar = page.getByRole('toolbar', { name: /Table editing|表格编辑/i })
    await expect(toolbar).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /Add row|添加行/i })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: /Delete column|删除列/i })).toBeVisible()

    const [toolbarBox, cellBox] = await Promise.all([
      toolbar.boundingBox(),
      activeCell.boundingBox(),
    ])
    expect(toolbarBox).not.toBeNull()
    expect(cellBox).not.toBeNull()
    if (!toolbarBox || !cellBox) return
    expect(toolbarBox.x).toBeGreaterThanOrEqual(0)
    expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(1280)
    expect(
      toolbarBox.y + toolbarBox.height <= cellBox.y || toolbarBox.y >= cellBox.y + cellBox.height,
    ).toBe(true)

    await testInfo.attach('markdown-table-toolbar.png', {
      body: await page.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    })
  })
})
