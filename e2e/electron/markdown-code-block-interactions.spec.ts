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

const FIXTURE_PREFIX = 'marklab-code-block-'
const sourceFixture = '```typescript\nconst ready: boolean = true\n```'

const createWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  fs.writeFileSync(path.join(root, 'Code.md'), sourceFixture, 'utf8')
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
    const bridge = (
      window as Window & {
        marklabElectron?: {
          commands?: { invoke: (command: string, payload?: unknown) => Promise<unknown> }
        }
      }
    ).marklabElectron
    return bridge?.commands?.invoke('fs_set_root', { path: targetPath }) as Promise<{
      kind: 'external'
      path: string
    }>
  }, workspacePath)
  const handle = await session.app.browserWindow(session.page)
  try {
    await handle.evaluate(
      (window, state) => window.webContents.send('workspace-session-seed', { state }),
      { activeTabId: null, rootKind: root.kind, rootPath: root.path, tabs: [] },
    )
  } finally {
    await handle.dispose()
  }
}

const openFixture = async (page: Page) => {
  const files = page.getByRole('region', { name: /^(Files|文件)$/i })
  if (!(await files.isVisible().catch(() => false)))
    await page.keyboard.press('ControlOrMeta+Shift+L')
  const file = files.getByRole('button', { exact: true, name: 'Code.md' })
  await expect(file).toBeVisible({ timeout: 30_000 })
  await file.click()
  await expect(page.getByTestId('markdown-editor')).toBeVisible({ timeout: 15_000 })
}

const readBuffer = (page: Page) =>
  page.evaluate(async () => {
    const bridge = (
      window as Window & {
        marklabElectron?: {
          commands?: { invoke: (command: string, payload?: unknown) => Promise<unknown> }
        }
      }
    ).marklabElectron
    return bridge?.commands?.invoke('fs_open_file', { path: 'Code.md' }) as Promise<string>
  })

const pasteText = async (session: ElectronTestSession, text: string) => {
  await session.app.evaluate(async ({ clipboard }, value) => clipboard.writeText(value), text)
  await session.page.keyboard.press('ControlOrMeta+V')
}

test.describe('Markdown code block interactions', () => {
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
    await openFixture(session.page)
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspace(workspaceRoot)
  })

  test('round-trips language and Monaco edits while keeping read-only actions safe', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { app, page } = session
    const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })
    const code = page.getByTestId('markdown-editor').locator('pre code').first()
    const codeBlock = code.locator('..').locator('..')
    await expect(code).toHaveAttribute('data-language', 'typescript')
    await code.hover()
    await page.getByRole('button', { name: 'TypeScript' }).click()
    await page.getByRole('option', { name: 'Python' }).click()
    await expect(code).toHaveAttribute('data-language', 'python')

    await page.getByRole('button', { name: /Wrap lines|自动换行/i }).click()
    await page.getByRole('button', { name: /Show line numbers|显示行号/i }).click()
    await expect(code.locator('..')).toHaveAttribute('data-wrap', 'true')
    await expect(code.locator('..')).toHaveAttribute('data-line-numbers', 'true')
    await page.getByRole('button', { name: /Copy code|复制代码/i }).click()
    await expect(codeBlock.getByRole('status')).toContainText(/Code copied|代码已复制/i)

    await page.getByRole('button', { name: /Open expanded editor|打开扩展编辑器/i }).click()
    const expandedEditor = page.locator('[role="dialog"] .monaco-editor')
    await expect(expandedEditor).toBeVisible({ timeout: 15_000 })
    await expandedEditor.click({ position: { x: 120, y: 20 } })
    await page.keyboard.press('ControlOrMeta+A')
    await pasteText(session, 'print("ready")')
    await expect(expandedEditor.locator('.view-lines')).toContainText('print("ready")')
    await page.getByRole('button', { name: /^(Apply|应用)$/i }).click()
    await expect.poll(() => readBuffer(page), { timeout: 10_000 }).toContain('print("ready")')
    await expect.poll(() => readBuffer(page)).toContain('```python')

    await code.click()
    await page.keyboard.press('ControlOrMeta+Z')
    await expect(code).toContainText('const ready: boolean = true')
    await expect.poll(() => readBuffer(page)).toContain('const ready: boolean = true')
    await page.keyboard.press('ControlOrMeta+Shift+Z')
    await expect(code).toContainText('print("ready")')
    await expect.poll(() => readBuffer(page)).toContain('print("ready")')

    await modes.getByRole('radio', { name: /^(Source|Source Editor|源码)$/i }).click()
    const activeSourceEditor = page.locator('.source-code-editor:visible .monaco-editor')
    await expect(activeSourceEditor).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toContainText(/26 (chars|字符)/i)
    await activeSourceEditor.click({ position: { x: 120, y: 20 } })
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.press('ControlOrMeta+C')
    await expect
      .poll(() => app.evaluate(({ clipboard }) => clipboard.readText()))
      .toContain('print("ready")')
    await expect(activeSourceEditor.locator('.view-lines')).toContainText('print("ready")')
    await expect(activeSourceEditor.locator('.view-lines')).toContainText('```python')

    await modes.getByRole('radio', { name: /^(WYSIWYG|Rich Text Editor|所见即所得)$/i }).click()

    const readOnly = page.getByRole('contentinfo').locator('button[data-read-only]')
    await readOnly.click()
    await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-readonly', 'true')
    await expect(page.getByRole('button', { name: /Copy code|复制代码/i })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Open expanded editor|打开扩展编辑器/i }),
    ).toHaveCount(0)
  })
})
