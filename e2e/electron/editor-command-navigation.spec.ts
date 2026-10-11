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

const FIXTURE_PREFIX = 'marklab-editor-navigation-'

const createWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  const longSection = Array.from(
    { length: 80 },
    (_, index) => `Navigation paragraph ${String(index + 1).padStart(2, '0')}.`,
  ).join('\n\n')
  fs.writeFileSync(
    path.join(root, 'Navigation.md'),
    `# Start\n\nIntro\n\n## Details\n\n${longSection}\n\n## Ending\n\nDone\n`,
    'utf8',
  )
  fs.writeFileSync(path.join(root, 'Other.md'), '# Other document\n\nSeparate tab.\n', 'utf8')
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

const openSlashMenu = async (page: Page, query: string) => {
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText(`/${query}`)
  const menu = page.getByRole('listbox', { name: /Block suggestions|内容块建议/i })
  await expect(menu).toBeVisible()
  return menu
}

const expectCaretInside = async (target: Locator) => {
  await expect
    .poll(
      () =>
        target.evaluate((element) => {
          const selection = element.ownerDocument.getSelection()
          return Boolean(
            selection?.isCollapsed &&
            selection.rangeCount === 1 &&
            selection.anchorNode &&
            element.contains(selection.anchorNode),
          )
        }),
      { message: 'Expected the editor caret to move into the selected slash-command block' },
    )
    .toBe(true)
}

test.describe('Editor command and document navigation', () => {
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
    await openFile(session.page, 'Navigation.md')
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspace(workspaceRoot)
  })

  test('runs fuzzy slash commands and promotes the successful command to recent', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    const editor = page.getByTestId('markdown-editor')
    await editor.locator('p').last().click()

    let menu = await openSlashMenu(page, 'hading')
    await expect(menu.getByRole('option', { name: /Heading 1|一级标题/i })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    const fuzzyHeading = editor.getByRole('heading', { level: 1 }).last()
    await expectCaretInside(fuzzyHeading)
    await page.keyboard.insertText('Fuzzy heading')
    await expect(fuzzyHeading).toHaveText('Fuzzy heading')

    menu = await openSlashMenu(page, 'blokquote')
    await expect(menu.getByRole('option', { name: /Quote|引用/i })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()
    const fuzzyQuote = editor.locator('blockquote').last()
    await expect(fuzzyQuote).toBeVisible()
    await expectCaretInside(fuzzyQuote)
    await page.keyboard.insertText('Fuzzy quote')
    await expect(fuzzyQuote).toContainText('Fuzzy quote')

    await page.keyboard.press('Enter')
    menu = await openSlashMenu(page, '')
    await expect(menu.getByRole('option').first()).toContainText(/Quote|引用/i)
  })

  test('updates heading and scroll progress without leaking the previous tab state', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    const editor = page.getByTestId('markdown-editor')
    const statusBar = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
    if (!(await statusBar.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Show status bar|显示状态栏/i }).click()
    }

    await editor.getByRole('heading', { level: 2, name: 'Details' }).click()
    await expect(statusBar.getByText('# Details', { exact: true })).toBeVisible()
    const progress = statusBar.locator('span').filter({ hasText: /^\d+%$/ })
    await expect(progress).toBeVisible()

    await editor.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      element.dispatchEvent(new Event('scroll'))
    })
    await expect(progress).toHaveText('100%')

    await openFile(page, 'Other.md')
    await expect(page.getByTestId('markdown-editor')).toContainText('Other document')
    await expect(statusBar.getByText('# Details', { exact: true })).toHaveCount(0)
  })
})
