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

test.describe('Recent workspace history management', () => {
  let rendererUrl: string
  let server: http.Server | undefined
  let directory: string | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-history-'))
    for (const name of ['ValidNotes', 'MissingNotes']) {
      await fs.mkdir(path.join(directory, name))
      await fs.writeFile(path.join(directory, name, 'Note.md'), '# Keep this workspace\n')
    }
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })
  test.afterAll(async () => {
    await closeElectronTestSession(session)
    await closeRendererServer(server)
    if (directory) await fs.rm(directory, { recursive: true, force: true })
  })

  const openWorkspace = async (source: Page, workspacePath: string) => {
    if (!session) throw new Error('Electron session is unavailable')
    await session.app.evaluate(({ dialog }, selectedPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] })
    }, workspacePath)
    await source.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    await source
      .getByRole('menuitem', { name: /Open Workspace in New Window|在新窗口打开工作区/i })
      .click()
    const app = session.app
    let target: Page | undefined
    await expect
      .poll(
        async () => {
          for (const page of app.windows()) {
            if (
              await page
                .getByRole('button', {
                  name: new RegExp(`^(Workspace|工作区):.*${path.basename(workspacePath)}`),
                })
                .isVisible()
            ) {
              target = page
              return true
            }
          }
          return false
        },
        { timeout: 60_000 },
      )
      .toBe(true)
    if (!target) throw new Error('The workspace window did not open')
    return target
  }

  test('selecting the current history entry preserves its editor and only explicit new-window actions duplicate it', async () => {
    if (!directory) throw new Error('Fixture directory is unavailable')
    const validPath = path.join(directory, 'ValidNotes')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [validPath] })
    try {
      const { app, page } = session
      const editor = page.getByTestId('markdown-editor')
      await expect(editor).toHaveAttribute('data-state', 'ready')
      await expect(editor).toContainText('Keep this workspace')
      const element = await editor.elementHandle()
      if (!element) throw new Error('Editor was not mounted')
      const originalUrl = page.url()
      const workspaceWindows = async () => {
        let count = 0
        for (const candidate of app.windows()) {
          if (await candidate.getByRole('button', { name: /^(Workspace|工作区):/i }).isVisible()) {
            count += 1
          }
        }
        return count
      }
      await expect.poll(workspaceWindows).toBe(1)
      const trigger = page.getByRole('button', { name: /^(Workspace|工作区):/i })
      await trigger.click()
      const current = page.getByRole('menuitem', {
        name: /(?:Open in new window|在新窗口打开：).*ValidNotes/i,
      })
      await expect(current).toHaveAttribute('aria-current', 'page')
      await expect(current).not.toHaveAttribute('aria-disabled', 'true')
      await current.click()
      await expect(page.getByRole('menu')).toBeHidden()
      expect(page.url()).toBe(originalUrl)
      expect(await element.evaluate((node) => node.isConnected)).toBe(true)
      expect(await workspaceWindows()).toBe(1)
      await trigger.click()
      await page
        .getByRole('menuitem', {
          name: /Open Current Workspace in New Window|在新窗口打开当前工作区/i,
        })
        .click()
      await expect(
        page.getByText(/Workspace opened in a new window|已在新窗口打开工作区/, {
          exact: true,
        }),
      ).toBeVisible({ timeout: 60_000 })
      expect(await workspaceWindows()).toBe(2)
      expect(page.url()).toBe(originalUrl)
      expect(await element.evaluate((node) => node.isConnected)).toBe(true)
      await expect(editor).toContainText('Keep this workspace')
      await element.dispose()
    } finally {
      await closeElectronTestSession(session)
      session = undefined
    }
  })

  test('greys out missing paths and removes valid or invalid history across windows and restarts', async () => {
    if (!directory) throw new Error('Fixture directory is unavailable')
    session = await launchElectronTestSession(rendererUrl)
    const originalPage = session.page
    const profile = session.testRunRoot
    const validPath = path.join(directory, 'ValidNotes')
    const missingPath = path.join(directory, 'MissingNotes')
    const validPage = await openWorkspace(originalPage, validPath)
    const missingPage = await openWorkspace(validPage, missingPath)
    const handle = await session.app.browserWindow(missingPage)
    const closed = missingPage.waitForEvent('close')
    await handle.evaluate((window) => window.close())
    await handle.dispose()
    await closed
    await validPage.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    const missingEntry = validPage.getByRole('menuitem', {
      name: /(?:Open in new window|在新窗口打开：).*MissingNotes/i,
    })
    await expect(missingEntry).not.toHaveAttribute('aria-disabled', 'true')
    await fs.rm(missingPath, { recursive: true })
    await expect(missingEntry).toHaveAttribute('aria-disabled', 'true')
    await expect(missingEntry).toContainText(/Path no longer exists|路径已失效/i)
    await fs.mkdir(missingPath)
    await expect(missingEntry).not.toHaveAttribute('aria-disabled', 'true')
    await fs.rm(missingPath, { recursive: true })
    await expect(missingEntry).toHaveAttribute('aria-disabled', 'true')
    await validPage
      .getByRole('menuitem', {
        name: /(?:Remove MissingNotes from history|从历史记录移除：MissingNotes)/i,
      })
      .click()
    await expect(validPage.getByRole('menu')).toBeHidden()

    await validPage.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    const validEntry = validPage.getByRole('menuitem', {
      name: /(?:Open in new window|在新窗口打开：).*ValidNotes/i,
    })
    await expect(validEntry).not.toHaveAttribute('aria-disabled', 'true')
    await validPage
      .getByRole('menuitem', {
        name: /(?:Remove ValidNotes from history|从历史记录移除：ValidNotes)/i,
      })
      .click()
    await expect(validPage.getByRole('menu')).toBeHidden()
    await expect(
      validPage.getByRole('button', { name: /^(Workspace|工作区):.*ValidNotes/i }),
    ).toBeVisible()
    expect(await fs.readFile(path.join(validPath, 'Note.md'), 'utf8')).toBe(
      '# Keep this workspace\n',
    )

    if (!(await originalPage.getByRole('menu').isVisible())) {
      await originalPage.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    }
    await expect(
      originalPage
        .getByRole('status')
        .filter({ hasText: /Checking recent workspaces|正在检测历史工作区/i }),
    ).toBeHidden()
    await expect(
      originalPage.getByRole('menuitem', {
        name: /(?:Open in new window|在新窗口打开：).*(ValidNotes|MissingNotes)/i,
      }),
    ).toHaveCount(0)
    await originalPage.keyboard.press('Escape')
    await closeElectronTestSession(session, { preserveProfile: true })
    session = undefined
    session = await launchElectronTestSession(rendererUrl, { testRunRoot: profile })
    await expect(
      session.page.getByRole('button', { name: /^(Workspace|工作区):.*ValidNotes/i }),
    ).toBeVisible()
    await session.page.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    await expect(
      session.page
        .getByRole('status')
        .filter({ hasText: /Checking recent workspaces|正在检测历史工作区/i }),
    ).toBeHidden()
    await expect(
      session.page.getByRole('menuitem', {
        name: /(?:Open in new window|在新窗口打开：).*(ValidNotes|MissingNotes)/i,
      }),
    ).toHaveCount(0)
  })
})
