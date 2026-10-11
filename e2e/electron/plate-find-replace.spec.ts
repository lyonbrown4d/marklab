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

const FIXTURE_PREFIX = 'marklab-find-replace-'

const createWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  fs.writeFileSync(path.join(root, 'Find.md'), '# Find\n\nAlpha beta alpha\n', 'utf8')
  fs.writeFileSync(path.join(root, 'Second.md'), '# Second\n', 'utf8')
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
  if (!(await explorer.isVisible().catch(() => false))) {
    await page.keyboard.press('ControlOrMeta+Shift+L')
  }
  const file = explorer.getByRole('button', { exact: true, name: fileName })
  await expect(file).toBeVisible({ timeout: 30_000 })
  await file.click()
  await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready', {
    timeout: 15_000,
  })
}

test.describe('Plate find and replace', () => {
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
    await openFile(session.page, 'Find.md')
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspace(workspaceRoot)
  })

  test('opens from the shortcut, saves replace-all, and undoes it', async () => {
    if (!session || !workspaceRoot) throw new Error('Electron test session is unavailable')
    const { page } = session
    const editor = page.getByTestId('markdown-editor')

    await editor.press('ControlOrMeta+f')
    const query = page.getByRole('searchbox', { name: /Find in document|在文档中查找/i })
    await expect(query).toBeFocused()
    await query.fill('alpha')
    const findPanel = page.getByRole('search', { name: /Find in document|在文档中查找/i })
    await page.getByRole('button', { name: /Use regular expression|使用正则表达式/i }).click()
    await query.fill('Alpha|alpha')
    await expect(findPanel).toContainText('1 / 2')
    await query.fill('(')
    await expect(page.getByRole('alert')).toContainText(
      /Invalid regular expression|正则表达式无效/i,
    )
    await query.fill('alpha')
    await expect(findPanel).toContainText('1 / 2')
    await page.getByRole('button', { name: /Toggle replace|展开替换/i }).click()
    await page.getByRole('textbox', { name: /^(Replace|替换)$/i }).fill('omega')
    await page.getByRole('button', { name: /Replace all|全部替换/i }).click()

    await expect(editor).toContainText('omega beta omega')
    const filePath = path.join(workspaceRoot, 'Find.md')
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain('omega beta omega')

    await editor.click()
    await page.keyboard.press('ControlOrMeta+z')
    await expect(editor).toContainText('Alpha beta alpha')
    await expect.poll(() => fs.readFileSync(filePath, 'utf8')).toContain('Alpha beta alpha')
  })

  test('removes the find overlay after switching tabs', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    await page.getByTestId('markdown-editor').press('ControlOrMeta+f')
    await page.getByRole('searchbox', { name: /Find in document|在文档中查找/i }).fill('alpha')

    await openFile(page, 'Second.md')

    await expect(
      page.getByRole('searchbox', { name: /Find in document|在文档中查找/i }),
    ).toHaveCount(0)
  })
})
