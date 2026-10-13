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

test.describe('Workspace recovery and creation journeys', () => {
  let rendererUrl: string
  let server: http.Server | undefined
  let directory: string
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-recovery-actions-'))
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })
  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })
  test.afterAll(async () => {
    await closeRendererServer(server)
    await fs.rm(directory, { recursive: true, force: true })
  })

  const chooseDirectory = async (selectedPath: string | null) => {
    if (!session) throw new Error('Electron session is unavailable')
    await session.app.evaluate(({ dialog }, selected) => {
      dialog.showOpenDialog = async () => ({
        canceled: selected === null,
        filePaths: selected === null ? [] : [selected],
      })
    }, selectedPath)
  }

  const restart = async () => {
    if (!session) throw new Error('Electron session is unavailable')
    const profile = session.testRunRoot
    await closeElectronTestSession(session, { preserveProfile: true })
    session = undefined
    session = await launchElectronTestSession(rendererUrl, { testRunRoot: profile })
  }

  test('recovers a moved workspace without stale loading and can return to default', async () => {
    const original = path.join(directory, 'OriginalNotes')
    const relocated = path.join(directory, 'MovedNotes')
    await fs.mkdir(original)
    await fs.writeFile(path.join(original, 'README.md'), '# Keep this document and tab\n')
    session = await launchElectronTestSession(rendererUrl)
    const initialLabel = await session.page
      .getByRole('button', { name: /^(Workspace|工作区):/i })
      .getAttribute('aria-label')
    await chooseDirectory(original)
    await session.page.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    await session.page.getByRole('menuitem', { name: /^(Open workspace…|打开工作区…)$/i }).click()
    await expect(session.page.getByTestId('markdown-editor')).toContainText(
      'Keep this document and tab',
    )
    await fs.rename(original, relocated)
    await restart()
    let page = session.page
    await expect(
      page.getByRole('button', { name: /Locate workspace|重新定位工作区/i }),
    ).toBeVisible()
    await expect(page.getByText(/Loading document|正在加载文档/i)).toHaveCount(0)
    await expect(page.getByRole('alert').filter({ hasText: original })).toBeVisible()
    await page
      .getByRole('button', { name: /Retry restore|重试恢复/i })
      .first()
      .click()
    await expect(
      page.getByRole('button', { name: /Locate workspace|重新定位工作区/i }),
    ).toBeEnabled()
    await chooseDirectory(null)
    await page.getByRole('button', { name: /Locate workspace|重新定位工作区/i }).click()
    await expect(
      page.getByRole('button', { name: /Locate workspace|重新定位工作区/i }),
    ).toBeEnabled()
    await expect(
      page.getByRole('button', { name: /^(Workspace|工作区):.*OriginalNotes/i }),
    ).toBeVisible()
    await chooseDirectory(relocated)
    await page.getByRole('button', { name: /Locate workspace|重新定位工作区/i }).click()
    await expect(page.getByTestId('markdown-editor')).toContainText('Keep this document and tab')
    await expect(
      page.getByRole('button', { name: /^(Workspace|工作区):.*MovedNotes/i }),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Locate workspace|重新定位工作区/i }),
    ).toHaveCount(0)
    await fs.rename(relocated, path.join(directory, 'MovedAgain'))
    await restart()
    page = session.page
    await page.getByRole('button', { name: /Return to default workspace|返回默认工作区/i }).click()
    if (!initialLabel) throw new Error('Default workspace label is unavailable')
    await expect(page.getByRole('button', { name: initialLabel, exact: true })).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Locate workspace|重新定位工作区/i }),
    ).toHaveCount(0)
    expect(await fs.readFile(path.join(directory, 'MovedAgain', 'README.md'), 'utf8')).toBe(
      '# Keep this document and tab\n',
    )
  })

  test('creates an exclusive workspace, preserves existing folders, and configures sync directly', async () => {
    session = await launchElectronTestSession(rendererUrl)
    const page = session.page
    const initialLabel = await page
      .getByRole('button', { name: /^(Workspace|工作区):/i })
      .getAttribute('aria-label')
    const existing = path.join(directory, 'ExistingNotes')
    await fs.mkdir(existing)
    await fs.writeFile(path.join(existing, 'keep.md'), '# Never overwrite\n')
    await page.getByRole('button', { name: /^(Workspace|工作区):/i }).click()
    await page.getByRole('menuitem', { name: /^New Workspace|^新建工作区/i }).click()
    const creation = page.getByRole('dialog', { name: /^New Workspace|^新建工作区/i })
    const name = creation.getByRole('textbox', { name: /Workspace name|工作区名称/i })
    await name.fill('ExistingNotes')
    await chooseDirectory(directory)
    await creation
      .getByRole('button', { name: /Choose location and create|选择位置并创建/i })
      .click()
    await expect(creation).toBeVisible()
    await expect(
      creation.getByRole('button', { name: /Choose location and create|选择位置并创建/i }),
    ).toBeEnabled()
    expect(await fs.readFile(path.join(existing, 'keep.md'), 'utf8')).toBe('# Never overwrite\n')
    if (!initialLabel) throw new Error('Initial workspace label is unavailable')
    await expect(
      page.getByRole('button', { name: initialLabel, exact: true, includeHidden: true }),
    ).toHaveAttribute('aria-label', initialLabel)
    await name.fill('FreshNotes')
    await chooseDirectory(null)
    await creation
      .getByRole('button', { name: /Choose location and create|选择位置并创建/i })
      .click()
    await expect(
      creation.getByRole('button', { name: /Choose location and create|选择位置并创建/i }),
    ).toBeEnabled()
    await expect(creation).toBeVisible()
    await chooseDirectory(directory)
    await creation
      .getByRole('button', { name: /Choose location and create|选择位置并创建/i })
      .click()
    await expect(creation).toBeHidden()
    await expect(
      page.getByRole('button', { name: /^(Workspace|工作区):.*FreshNotes/i }),
    ).toBeVisible()
    expect(await fs.readdir(path.join(directory, 'FreshNotes'))).toEqual(['Untitled.md'])
    expect(await fs.readFile(path.join(directory, 'FreshNotes', 'Untitled.md'), 'utf8')).toBe('')
    await page.getByRole('button', { name: /Open sync center|打开同步中心/i }).click()
    await page.getByRole('button', { name: /Configure WebDAV…|配置 WebDAV…/i }).click()
    await expect(page.getByRole('dialog', { name: /Bind WebDAV|绑定 WebDAV/i })).toBeVisible()
  })
})
