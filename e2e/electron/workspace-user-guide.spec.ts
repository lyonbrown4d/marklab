import { expect, test } from '@playwright/test'
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

test.describe('Bundled default workspace user guide', () => {
  let server: http.Server | undefined
  let rendererUrl: string
  let session: ElectronTestSession | undefined
  let external: string | undefined
  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })
  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    if (external) await fs.rm(external, { recursive: true, force: true })
    external = undefined
  })
  test.afterAll(async () => closeRendererServer(server))

  test('opens the welcome page, follows chapter links and preserves changes/deletions across restart', async () => {
    session = await launchElectronTestSession(rendererUrl)
    const editor = session.page.getByTestId('markdown-editor')
    await expect(editor).toContainText(/欢迎使用 Marklab|Welcome to Marklab/)
    await editor
      .getByRole('link', { name: /Marklab 使用指南|Marklab User Guide/ })
      .click({ modifiers: ['ControlOrMeta'] })
    await expect(editor).toContainText(/从这里开始|Start Here/i)
    await editor
      .getByRole('link', { name: /工作区与窗口|Workspaces and Windows/i })
      .first()
      .click({ modifiers: ['ControlOrMeta'] })
    await expect(editor).toContainText(/最近打开记录|Recently opened/)
    const userData = await session.app.evaluate(({ app }) => app.getPath('userData'))
    const root = path.join(userData, 'workspace')
    const guide = path.join(root, 'User Guide')
    const profile = session.testRunRoot
    await closeElectronTestSession(session, { preserveProfile: true })
    session = undefined
    await fs.writeFile(path.join(root, 'Home.md'), '# My personal homepage\n')
    await fs.writeFile(path.join(guide, '04-Workspaces.md'), '# My workspace notes\n')
    await fs.rm(path.join(guide, '01-Writing.md'))
    session = await launchElectronTestSession(rendererUrl, { testRunRoot: profile })
    await expect(session.page.getByTestId('markdown-editor')).toContainText('My workspace notes')
    expect(await fs.readFile(path.join(root, 'Home.md'), 'utf8')).toBe('# My personal homepage\n')
    await expect(fs.stat(path.join(guide, '01-Writing.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(await fs.readdir(guide)).toHaveLength(6)
  })

  test('keeps a user-selected external workspace free of bundled guide files', async () => {
    external = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-guide-external-'))
    await fs.writeFile(path.join(external, 'Home.md'), '# External notes\n')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [external] })
    await expect(session.page.getByTestId('markdown-editor')).toContainText('External notes')
    expect(await fs.readdir(external)).toEqual(['Home.md'])
    const userData = await session.app.evaluate(({ app }) => app.getPath('userData'))
    expect(await fs.readdir(path.join(userData, 'workspace', 'User Guide'))).toHaveLength(7)
  })
})
