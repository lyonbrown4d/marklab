import { expect, test, type Page, type TestInfo } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
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

type RootInfo = { kind: 'external' | 'internal' | 'single'; path: string }

const invokeCommand = <T>(page: Page, command: string, args?: Record<string, unknown>) =>
  page.evaluate(
    async ({ args, command }) => {
      const bridge = (
        window as Window & {
          marklabElectron?: {
            commands?: {
              invoke: (name: string, payload?: Record<string, unknown>) => Promise<unknown>
            }
          }
        }
      ).marklabElectron
      if (!bridge?.commands) throw new Error('Secure preload command bridge is unavailable')
      return bridge.commands.invoke(command, args)
    },
    { args, command },
  ) as Promise<T>

const createWorkspacePair = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'marklab-release-regression-'))
  const alpha = path.join(fixtureRoot, 'workspace-alpha')
  const beta = path.join(fixtureRoot, 'workspace-beta')
  fs.mkdirSync(alpha)
  fs.mkdirSync(beta)
  fs.writeFileSync(path.join(alpha, 'README.md'), '# Workspace alpha\n')
  fs.writeFileSync(path.join(beta, 'README.md'), '# Workspace beta\n')
  fs.writeFileSync(path.join(alpha, 'shared.ts'), "export const workspaceIdentity = 'alpha-only'\n")
  fs.writeFileSync(path.join(beta, 'shared.ts'), "export const workspaceIdentity = 'beta-only'\n")
  return { alpha, beta, fixtureRoot }
}

const removeWorkspacePair = (fixtureRoot: string | undefined) => {
  if (!fixtureRoot) return
  const resolved = path.resolve(fixtureRoot)
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith('marklab-release-regression-')
  ) {
    throw new Error(`Refusing to remove an unexpected fixture path: ${resolved}`)
  }
  fs.rmSync(resolved, { force: true, recursive: true })
}

const openExplorerFile = async (page: Page, fileName: string) => {
  const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
  if (!(await explorer.isVisible().catch(() => false))) await page.keyboard.press('Control+Shift+L')
  await expect(explorer).toBeVisible({ timeout: 10_000 })
  const file = explorer.getByRole('button', { exact: true, name: fileName })
  await expect(file).toBeVisible({ timeout: 15_000 })
  await file.click()
}

const selectEditorMode = async (page: Page, mode: 'preview' | 'source') => {
  const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })
  const name =
    mode === 'source'
      ? /^(Source|Source Editor|源码)$/i
      : /^(Rich Text Editor|WYSIWYG|所见即所得)$/i
  await modes.getByRole('radio', { name }).click()
}

const expectWorkspaceSource = async (page: Page, expected: string, stale: string) => {
  await selectEditorMode(page, 'source')
  const lines = page.locator('.monaco-editor .view-lines')
  await expect(lines).toContainText(expected, { timeout: 15_000 })
  await expect(lines).not.toContainText(stale)
}

const expectWorkspacePreview = async (page: Page, expected: string, stale: string) => {
  await selectEditorMode(page, 'preview')
  const preview = page.getByRole('article', {
    name: /shared\.ts.*(?:source preview|源码预览)/i,
  })
  await expect(preview).toContainText(expected, { timeout: 15_000 })
  await expect(preview).not.toContainText(stale)
}

const switchCurrentWorkspace = async (session: ElectronTestSession, workspacePath: string) => {
  // The native open-in-current-window command is deliberately not exposed to renderer code.
  // Exercise its two renderer-visible boundaries without widening the production preload API.
  const root = await invokeCommand<RootInfo>(session.page, 'fs_set_root', { path: workspacePath })
  expect(root).toMatchObject({ kind: 'external', path: workspacePath })
  const windowHandle = await session.app.browserWindow(session.page)
  try {
    await windowHandle.evaluate(
      (window, state) => {
        window.webContents.send('workspace-session-seed', { state })
      },
      { activeTabId: null, rootKind: root.kind, rootPath: root.path, tabs: [] },
    )
  } finally {
    await windowHandle.dispose()
  }
}

test.describe('Release renderer regressions', () => {
  let diagnostics: RuntimeDiagnostics | undefined
  let fixtureRoot: string | undefined
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture object destructuring.
  test.afterEach(async ({}, testInfo: TestInfo) => {
    if (session && diagnostics) {
      await attachDiagnostics(session, diagnostics, testInfo)
      if (testInfo.status !== testInfo.expectedStatus) {
        const screenshot = await session.page.screenshot().catch(() => undefined)
        if (screenshot) {
          await testInfo.attach('renderer-failure.png', {
            body: screenshot,
            contentType: 'image/png',
          })
        }
      }
    }
    await closeElectronTestSession(session)
    session = undefined
    diagnostics = undefined
    removeWorkspacePair(fixtureRoot)
    fixtureRoot = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('isolates source models and previews when the current window changes workspace', async () => {
    const fixture = createWorkspacePair()
    fixtureRoot = fixture.fixtureRoot
    session = await launchElectronTestSession(rendererUrl)
    diagnostics = monitorRuntime(session)

    await expect(session.page.getByTestId('markdown-editor')).toHaveAttribute(
      'data-state',
      'ready',
      { timeout: 30_000 },
    )
    await switchCurrentWorkspace(session, fixture.alpha)
    await expect(
      session.page.getByRole('button', { name: /^(Workspace|工作区):.*workspace-alpha/i }),
    ).toBeVisible({ timeout: 20_000 })
    await openExplorerFile(session.page, 'shared.ts')
    await expectWorkspacePreview(session.page, 'alpha-only', 'beta-only')
    await expectWorkspaceSource(session.page, 'alpha-only', 'beta-only')

    await switchCurrentWorkspace(session, fixture.beta)
    await expect(
      session.page.getByRole('button', { name: /^(Workspace|工作区):.*workspace-beta/i }),
    ).toBeVisible({ timeout: 20_000 })

    await openExplorerFile(session.page, 'shared.ts')
    await expectWorkspacePreview(session.page, 'beta-only', 'alpha-only')
    await expectWorkspaceSource(session.page, 'beta-only', 'alpha-only')
    assertNoRuntimeErrors(diagnostics)
  })
})
