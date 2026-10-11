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
  repoRoot,
  revealElectronWindow,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  assertNoRuntimeErrors,
  attachDiagnostics,
  monitorRuntime,
} from './electronRuntimeDiagnostics.js'

const fixturePrefix = 'marklab-publication-'
const screenshotDirectory = path.join(repoRoot, 'output', 'playwright', 'design-qa')

const createWorkspace = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), fixturePrefix))
  const chapters = Array.from({ length: 8 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0')
    const fileName = `chapter-${number}.md`
    fs.writeFileSync(
      path.join(root, fileName),
      [
        `# ${number} ${index === 2 ? '编辑体验' : `Product chapter ${number}`}`,
        '',
        'This chapter contains enough product documentation to produce a realistic preview.',
        'Marklab keeps each chapter as an independent Markdown document while preserving links.',
        '',
        '## Interface design',
        '',
        'The workspace publication flow composes these documents into one coherent output.',
      ].join('\n'),
      'utf8',
    )
    return `- [Chapter ${number}](./${fileName})`
  })
  fs.writeFileSync(
    path.join(root, 'README.md'),
    ['# Marklab Product Guide', '', 'A publication-ready workspace.', '', ...chapters].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    path.join(root, 'appendix.md'),
    '# Appendix\n\nAn unlinked reference file.',
    'utf8',
  )
  return root
}

const removeWorkspace = (root: string | undefined) => {
  if (!root) return
  const resolved = path.resolve(root)
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith(fixturePrefix)
  ) {
    throw new Error(`Refusing to remove unexpected E2E workspace: ${resolved}`)
  }
  fs.rmSync(resolved, { force: true, recursive: true })
}

const capture = async (page: Page, testInfo: TestInfo) => {
  fs.mkdirSync(screenshotDirectory, { recursive: true })
  const target = path.join(screenshotDirectory, 'workspace-publication-option-3.png')
  await page.screenshot({ animations: 'disabled', path: target })
  await testInfo.attach('workspace-publication-option-3.png', {
    contentType: 'image/png',
    path: target,
  })
}

test.describe('Workspace publication dialog', () => {
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

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspace(workspaceRoot)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('opens the preview-first composition without overflow', async ({}, testInfo) => {
    session = await launchElectronTestSession(rendererUrl, { openTargets: [workspaceRoot!] })
    const diagnostics = monitorRuntime(session)
    await revealElectronWindow(session.app, session.page, { width: 1440, height: 900 })
    const page = session.page
    const workspaceName = path.basename(workspaceRoot!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const workspaceMenu = page.getByRole('button', {
      name: new RegExp(`^(Workspace|工作区):.*${workspaceName}`, 'i'),
    })
    await expect(workspaceMenu).toBeVisible({ timeout: 45_000 })
    await expect(page.getByText(/Starting window|正在启动窗口/i).first()).toBeHidden({
      timeout: 45_000,
    })
    await workspaceMenu.click()
    await page.getByRole('menuitem', { name: /Export Workspace|导出工作区/i }).click()

    const dialog = page.getByRole('dialog', { name: /Export Workspace|导出工作区/i })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Marklab Product Guide').first()).toBeVisible({ timeout: 30_000 })
    await expect(dialog.getByText(/unlinked files|未关联文件/i).first()).toBeVisible()
    await expect(dialog.getByRole('button', { name: /Export PDF|导出 PDF/i })).toBeVisible()
    const preview = dialog.getByRole('region', { name: /Preview pages|预览页面/i })
    const zoomLevel = dialog.getByRole('status', { name: /Zoom level|缩放比例/i })
    await expect(zoomLevel).toHaveText('85%')
    await preview.dispatchEvent('wheel', { ctrlKey: true, deltaY: -100 })
    await expect(zoomLevel).toHaveText('115%')
    const overflow = await dialog.evaluate((element) => ({
      horizontal: element.scrollWidth > element.clientWidth,
      vertical: element.scrollHeight > element.clientHeight,
    }))
    expect(overflow).toEqual({ horizontal: false, vertical: false })
    await capture(page, testInfo)
    await attachDiagnostics(session, diagnostics, testInfo)
    assertNoRuntimeErrors(diagnostics)
  })
})
