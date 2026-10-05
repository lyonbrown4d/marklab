import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
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
  removeWorkspaceProductFixture,
  resolveWorkspaceProductFixture,
  type WorkspaceProductFixture,
} from './workspaceProductFixture.js'

type RuntimeDiagnostics = { consoleErrors: string[]; pageErrors: string[] }

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const monitorRuntime = (session: ElectronTestSession): RuntimeDiagnostics => {
  const diagnostics: RuntimeDiagnostics = { consoleErrors: [], pageErrors: [] }
  const monitorPage = (page: Page) => {
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const location = message.location()
      diagnostics.consoleErrors.push(
        `${message.text()} (${location.url || 'unknown'}:${location.lineNumber ?? 0})`,
      )
    })
    page.on('pageerror', (error) => diagnostics.pageErrors.push(error.stack ?? error.message))
  }
  session.app.windows().forEach(monitorPage)
  session.app.on('window', monitorPage)
  return diagnostics
}

const openWorkspaceInNewWindow = async (
  session: ElectronTestSession,
  fixture: WorkspaceProductFixture,
) => {
  await session.app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
  }, fixture.root)
  await session.page.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
  await session.page
    .getByRole('menuitem', { name: /Open Workspace in New Window|在新窗口打开工作区/i })
    .click()

  const workspaceButton = new RegExp(
    `^(Workspace|工作区):.*${escapeRegExp(fixture.workspaceName)}`,
    'i',
  )
  let workspacePage: Page | undefined
  await expect
    .poll(
      async () => {
        for (const candidate of session.app.windows()) {
          if (await candidate.getByRole('button', { name: workspaceButton }).isVisible()) {
            workspacePage = candidate
            return true
          }
        }
        return false
      },
      { timeout: 60_000 },
    )
    .toBe(true)
  if (!workspacePage) throw new Error('The workspace window did not become available')
  return workspacePage
}

const openExplorer = async (page: Page) => {
  const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
  if (!(await explorer.isVisible().catch(() => false))) {
    await page.keyboard.press('Control+Shift+L')
  }
  await expect(explorer).toBeVisible({ timeout: 5_000 })
  return explorer
}

const openTreeFile = async (page: Page, fileName: string) => {
  const explorer = await openExplorer(page)
  const file = explorer.getByRole('button', { name: fileName, exact: true })
  await expect(file).toBeVisible({ timeout: 10_000 })
  await file.click()
}

const expectNoHorizontalOverflow = async (page: Page) => {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
          document.body.scrollWidth <= document.body.clientWidth,
      ),
    )
    .toBe(true)
}

test.describe('Workspace core product journeys', () => {
  let fixture: WorkspaceProductFixture
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    fixture = resolveWorkspaceProductFixture()
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })

  // Playwright requires fixture object destructuring even when no fixture is used.
  // eslint-disable-next-line no-empty-pattern
  test.afterEach(async ({}, testInfo) => {
    if (session) {
      const diagnosticsDirectory = path.resolve('output/playwright/product-audit')
      fs.mkdirSync(diagnosticsDirectory, { recursive: true })
      fs.writeFileSync(
        path.join(diagnosticsDirectory, 'workspace-core-electron-output.log'),
        `${session.output.join('\n')}\n`,
      )
      await testInfo.attach('electron-output.txt', {
        body: session.output.join('\n') || '(no Electron process output)',
        contentType: 'text/plain',
      })
    }
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspaceProductFixture(fixture)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture object destructuring.
  test('keeps files, search, editors, previews, and read-only state coherent', async ({}) => {
    session = await launchElectronTestSession(rendererUrl)
    const diagnostics = monitorRuntime(session)
    const page = await openWorkspaceInNewWindow(session, fixture)
    await page.setViewportSize({ width: 1280, height: 900 })

    await test.step('opens multiple files from the explorer and switches tabs', async () => {
      await openTreeFile(page, 'Home.md')
      await expect(page.getByTestId('markdown-editor')).toContainText('A deterministic workspace')
      await openTreeFile(page, 'Topic-01.md')
      await expect(page.getByTestId('markdown-editor')).toContainText('Topic 01 contains')

      const showTabs = page.getByRole('button', { name: /Show open files|显示打开的文件/i })
      if (await showTabs.isVisible().catch(() => false)) await showTabs.click()
      const tablist = page.getByRole('tablist', { name: /Open files|打开的文件/i })
      await expect(tablist).toBeVisible()
      const homeTab = tablist.getByRole('tab', { name: /^Home(?: ·|$)/i })
      const topicTab = tablist.getByRole('tab', { name: /^Topic-01(?: ·|$)/i })
      await expect(homeTab).toBeVisible()
      await expect(topicTab).toHaveAttribute('aria-selected', 'true')
      await homeTab.click()
      await expect(homeTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId('markdown-editor')).toContainText('A deterministic workspace')
    })

    await test.step('finds a document through full-text search', async () => {
      await page
        .getByRole('button', { name: /Search files|搜索文件/i })
        .first()
        .click()
      const palette = page.getByRole('dialog', { name: /Command palette|命令面板/i })
      await expect(palette).toBeVisible()
      await palette.getByRole('button', { name: /^\?\s/ }).click()
      const search = palette.getByRole('combobox')
      await expect(search).toBeFocused()
      await expect(search).toHaveValue('? ')
      await search.pressSequentially('Topic 07 contains')
      const result = palette.getByRole('option', { name: /Topic-07.*Topic 07 contains/i }).first()
      await expect.soft(result).toBeVisible({ timeout: 15_000 })
      if (await result.isVisible()) {
        await result.click()
        const sourceEditor = page.locator('.monaco-editor')
        await expect(sourceEditor).toBeVisible({ timeout: 15_000 })
        await expect(sourceEditor.locator('.view-lines')).toContainText('Topic 07 contains')
      } else {
        await page.keyboard.press('Escape')
      }
    })

    await test.step('switches Markdown between rich editing and source editing', async () => {
      const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })
      await modes.getByRole('radio', { name: /Source Editor|源码/i }).click()
      await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 })
      await modes.getByRole('radio', { name: /Rich Text Editor|所见即所得/i }).click()
      await expect(page.getByTestId('markdown-editor')).toBeVisible({ timeout: 15_000 })
    })

    await test.step('round-trips a source file between preview and source views', async () => {
      await openTreeFile(page, 'pipeline.yml')
      const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })
      await modes.getByRole('radio', { name: /Rich Text Editor|所见即所得/i }).click()
      const preview = page.getByRole('article', {
        name: /pipeline\.yml.*source preview|pipeline\.yml.*源码预览/i,
      })
      await expect(preview).toBeVisible({ timeout: 15_000 })
      await expect(preview).toContainText('product-readiness')

      await modes.getByRole('radio', { name: /Source Editor|源码/i }).click()
      await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 15_000 })
      await modes.getByRole('radio', { name: /Rich Text Editor|所见即所得/i }).click()
      await expect(preview).toBeVisible({ timeout: 15_000 })
    })

    await test.step('makes read-only mode obvious and responsive at narrow width', async () => {
      await openTreeFile(page, 'Home.md')
      const statusBar = page.getByRole('contentinfo', { name: /Status bar|状态栏/i })
      const readOnly = statusBar.locator('button[data-read-only]')
      await expect(readOnly).toHaveAttribute('data-read-only', 'false')
      await readOnly.click()
      await expect(readOnly).toHaveAttribute('aria-pressed', 'true')
      await expect(readOnly).toContainText(/Read-only|只读/i)
      await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-readonly', 'true')

      if (!session) throw new Error('Electron test session is unavailable')
      await revealElectronWindow(session.app, page, { width: 720, height: 640 })
      await expectNoHorizontalOverflow(page)
    })

    expect(diagnostics.pageErrors, diagnostics.pageErrors.join('\n')).toHaveLength(0)
    expect(diagnostics.consoleErrors, diagnostics.consoleErrors.join('\n')).toHaveLength(0)
  })
})
