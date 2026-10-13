import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

test.describe('Workspace restore after restart', () => {
  let server: http.Server | undefined
  let rendererUrl: string
  let directory: string | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-last-workspace-'))
    await fs.writeFile(path.join(directory, 'LastWorkspace.md'), '# Restored workspace document\n')
  })

  test.afterAll(async () => {
    await closeElectronTestSession(session)
    await closeRendererServer(server)
    if (directory) await fs.rm(directory, { recursive: true, force: true })
  })

  test('restores both open workspace windows and their tabs after quitting', async () => {
    if (!directory) throw new Error('Workspace fixture is unavailable')
    session = await launchElectronTestSession(rendererUrl)
    const app = session.app
    const originalPage = session.page
    const originalWorkspaceLabel = await originalPage
      .getByRole('button', { name: /^(Workspace|工作区):/i })
      .getAttribute('aria-label')
    if (!originalWorkspaceLabel) throw new Error('The original workspace label is unavailable')
    const profile = session.testRunRoot
    const workspaceName = path.basename(directory)
    const workspaceButton = new RegExp(`^(Workspace|工作区):.*${workspaceName}`, 'i')

    await session.app.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
    }, directory)
    await originalPage.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    await originalPage
      .getByRole('menuitem', { name: /Open Workspace in New Window|在新窗口打开工作区/i })
      .click()

    let workspacePage: Page | undefined
    await expect
      .poll(
        async () => {
          for (const page of app.windows()) {
            if (await page.getByRole('button', { name: workspaceButton }).isVisible()) {
              workspacePage = page
              return true
            }
          }
          return false
        },
        { timeout: 60_000 },
      )
      .toBe(true)
    if (!workspacePage) throw new Error('The new workspace window did not open')

    const explorer = workspacePage.getByRole('region', { name: /^(Files|文件)$/i })
    if (!(await explorer.isVisible())) {
      await workspacePage
        .getByRole('button', { name: /Toggle sidebar|切换侧边栏/i })
        .last()
        .evaluate((button: HTMLButtonElement) => button.click())
    }
    await explorer.getByRole('button', { name: 'LastWorkspace.md', exact: true }).click()
    await expect(workspacePage.getByTestId('markdown-editor')).toContainText(
      'Restored workspace document',
    )

    await expect(originalPage.getByRole('button', { name: /^(Workspace|工作区):/i })).toBeVisible()

    await closeElectronTestSession(session, { preserveProfile: true })
    session = undefined
    session = await launchElectronTestSession(rendererUrl, { testRunRoot: profile })
    await expect(session.page.getByRole('button', { name: workspaceButton })).toBeVisible()
    await expect(session.page.getByTestId('markdown-editor')).toContainText(
      'Restored workspace document',
    )
    const restartedApp = session.app
    let restoredOriginal: Page | undefined
    await expect
      .poll(
        async () => {
          let visibleWorkspaces = 0
          for (const page of restartedApp.windows()) {
            if (await page.getByRole('button', { name: /^(Workspace|工作区):/i }).isVisible()) {
              visibleWorkspaces += 1
              if (
                await page
                  .getByRole('button', { name: originalWorkspaceLabel, exact: true })
                  .isVisible()
              )
                restoredOriginal = page
            }
          }
          return visibleWorkspaces
        },
        { timeout: 60_000 },
      )
      .toBe(2)
    expect(restoredOriginal).toBeDefined()
  })
})
