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
// eslint-disable-next-line no-restricted-imports -- Runtime diagnostics stay outside production bundles.
import {
  assertNoRuntimeErrors,
  attachDiagnostics,
  monitorRuntime,
} from './electronRuntimeDiagnostics.js'

const FIXTURE_PREFIX = 'marklab-search-everywhere-'

const createWorkspace = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  fs.writeFileSync(path.join(root, 'Guide.md'), '# Guide\n\nCurrent window marker.\n', 'utf8')
  fs.writeFileSync(
    path.join(root, 'WindowTarget.md'),
    '# Window target\n\nNew window marker.\n',
    'utf8',
  )
  fs.writeFileSync(
    path.join(root, 'SearchBody.md'),
    '# Search body\n\nEverywhere unique text needle.\n',
    'utf8',
  )
  fs.mkdirSync(path.join(root, 'deep', 'nested'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'deep', 'nested', 'FirstClickTarget.md'),
    '# First click target\n\nDeep indexed first click marker.\n',
    'utf8',
  )
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

const openPalette = async (page: Page) => {
  await page.keyboard.down('Shift')
  await page.keyboard.up('Shift')
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await page.keyboard.down('Shift')
  await page.keyboard.up('Shift')
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/i })
  await expect(palette).toBeVisible()
  return palette
}

const cycleScope = async (page: Page, label: RegExp) => {
  await page.keyboard.press('Tab')
  await expect(page.getByRole('tab', { name: label })).toHaveAttribute('aria-selected', 'true')
}

const waitForWorkspace = async (page: Page) => {
  const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
  if (!(await explorer.isVisible().catch(() => false))) await page.keyboard.press('Control+Shift+L')
  await expect(explorer).toBeVisible({ timeout: 30_000 })
  await expect(explorer.getByRole('button', { exact: true, name: 'Guide.md' })).toBeVisible({
    timeout: 30_000,
  })
}

const openWorkspaceInCurrentWindow = async (
  session: ElectronTestSession,
  workspacePath: string,
) => {
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

test.describe('Search Everywhere continuity', () => {
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
    await openWorkspaceInCurrentWindow(session, workspaceRoot!)
    await waitForWorkspace(session.page)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test.afterEach(async ({}, testInfo) => {
    await closeElectronTestSession(session)
    session = undefined
    await testInfo.attach('workspace-root.txt', {
      body: workspaceRoot ?? '(missing)',
      contentType: 'text/plain',
    })
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspace(workspaceRoot)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('opens a deep indexed result on the first selection before its tree branch loads', async ({}, testInfo) => {
    if (!session) throw new Error('Electron test session is unavailable')
    const diagnostics = monitorRuntime(session)
    try {
      const palette = await openPalette(session.page)
      const fullTextTab = palette.getByRole('tab', { name: /Full-text search|全文搜索/i })
      await fullTextTab.click()
      await expect(fullTextTab).toHaveAttribute('aria-selected', 'true')
      await palette.getByRole('combobox').fill('Deep indexed first click marker')
      const result = palette
        .getByRole('option')
        .filter({ hasText: 'Deep indexed first click marker' })
        .first()
      await expect(result).toBeVisible({ timeout: 30_000 })

      await result.click()

      await expect(palette).toBeHidden()
      const sourceEditor = session.page.locator('.monaco-editor')
      await expect(sourceEditor).toBeVisible({ timeout: 15_000 })
      await expect(sourceEditor.locator('.view-lines')).toContainText(
        'Deep indexed first click marker',
      )
      assertNoRuntimeErrors(diagnostics)
    } finally {
      await attachDiagnostics(session, diagnostics, testInfo)
    }
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('keeps scopes, selection, window disposition, recent commands, and settings connected', async ({}, testInfo) => {
    if (!session) throw new Error('Electron test session is unavailable')
    const diagnostics = monitorRuntime(session)
    const { app, page } = session
    try {
      let palette = await openPalette(page)
      const input = palette.getByRole('combobox')
      await expect(palette.getByRole('tablist')).toHaveAccessibleName(/Search mode|搜索模式/i)
      await cycleScope(page, /Full-text search|全文搜索/i)
      await input.fill('Everywhere unique text needle')
      await expect(
        palette.getByRole('option').filter({ hasText: 'Everywhere unique text needle' }).first(),
      ).toBeVisible({ timeout: 30_000 })
      await input.fill('')
      await cycleScope(page, /Commands|命令/i)
      await cycleScope(page, /Settings|设置/i)
      await page.keyboard.press('Shift+Tab')
      await expect(page.getByRole('tab', { name: /Commands|命令/i })).toHaveAttribute(
        'aria-selected',
        'true',
      )

      await input.fill('toggle sidebar')
      await palette.getByRole('option', { name: /Toggle Sidebar|切换侧边栏/i }).click()
      await expect(palette).toBeHidden()
      await expect
        .poll(() =>
          page.evaluate(() =>
            JSON.parse(localStorage.getItem('marklab.command.recentCommands') ?? '[]'),
          ),
        )
        .toContain('view.toggle_sidebar')

      palette = await openPalette(page)
      await cycleScope(page, /Full-text search|全文搜索/i)
      await cycleScope(page, /Commands|命令/i)
      await expect(palette.getByText(/Recent Commands|最近使用的命令/i)).toBeVisible()

      await palette.getByRole('combobox').focus()
      await page.keyboard.press('Shift+Tab')
      await expect(page.getByRole('tab', { name: /Full-text search|全文搜索/i })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await page.keyboard.press('Shift+Tab')
      await expect(page.getByRole('tab', { name: /Quick open|快速打开/i })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await palette.getByRole('combobox').fill('Guide')
      const guideFile = palette.getByRole('option').filter({ hasText: 'Guide.md' }).first()
      await expect(guideFile).toBeVisible()
      await guideFile.hover()
      await expect(guideFile).toHaveAttribute('data-selected', 'true')
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('markdown-editor')).toContainText('Current window marker')

      palette = await openPalette(page)
      await palette.getByRole('combobox').fill('WindowTarget')
      await expect(
        palette.getByRole('option').filter({ hasText: 'WindowTarget' }).first(),
      ).toBeVisible()
      await page.keyboard.press('Alt+Enter')
      await expect(palette).toBeHidden()
      await expect
        .poll(
          async () => {
            for (const candidate of app.windows()) {
              if (candidate === page) continue
              const targetPath = candidate.getByText('WindowTarget.md', { exact: true })
              if (await targetPath.isVisible().catch(() => false)) return true
            }
            return false
          },
          { timeout: 30_000 },
        )
        .toBe(true)

      palette = await openPalette(page)
      await cycleScope(page, /Full-text search|全文搜索/i)
      await cycleScope(page, /Commands|命令/i)
      await cycleScope(page, /Settings|设置/i)
      await expect(
        palette.getByRole('heading', { name: /No matching settings|没有匹配的设置/i }),
      ).toBeVisible()
      const settingsTab = page.getByRole('tab', { name: /Settings|设置/i })
      const themeQuery =
        (await settingsTab.getAttribute('aria-label')) === '设置' ? '主题预设' : 'theme preset'
      await palette.getByRole('combobox').fill(themeQuery)
      await palette.getByRole('option', { name: /Theme preset|主题预设/i }).click()
      await expect(page.getByRole('dialog', { name: /Settings|设置/i })).toBeVisible()
      assertNoRuntimeErrors(diagnostics)
    } finally {
      await attachDiagnostics(session, diagnostics, testInfo)
    }
  })
})
