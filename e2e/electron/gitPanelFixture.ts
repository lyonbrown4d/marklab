import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import type { ElectronTestSession } from './electronTestHarness.js'

const execFileAsync = promisify(execFile)
export const createGitPanelFixture = async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-panel-e2e-'))
  const root = path.join(base, 'GitPanelNotes')
  const bare = path.join(base, 'local remote.git')
  const globalConfig = path.join(base, 'empty-gitconfig')
  await fs.mkdir(root)
  await fs.writeFile(globalConfig, '')
  const gitAt = async (cwd: string, args: string[]) => {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: globalConfig,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
      },
    })
    return stdout.trim()
  }
  const git = (args: string[]) => gitAt(root, args)
  const bareGit = (args: string[]) => gitAt(bare, args)
  const filePath = (relative: string) => {
    const resolved = path.resolve(root, relative)
    if (path.relative(root, resolved).startsWith('..') || path.isAbsolute(relative))
      throw new Error('Fixture file must be inside the isolated repository')
    return resolved
  }
  const write = async (relative: string, content: string) => {
    const target = filePath(relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, content, 'utf8')
  }
  await git(['init', '-b', 'main'])
  await git(['config', 'user.name', 'Git Panel E2E'])
  await git(['config', 'user.email', 'git-panel-e2e@example.invalid'])
  await git(['config', 'commit.gpgsign', 'false'])
  await write('chosen.md', '# Chosen\n\nInitial fixture content.\n')
  await write('unfinished.md', '# Unfinished\n\nOriginal tracked content.\n')
  await write('.gitignore', '.DS_Store\n.marklab/\n.marklab-sync/\n')
  await git(['add', '--', '.gitignore', 'chosen.md', 'unfinished.md'])
  await git(['commit', '-m', 'Initial Git panel fixture'])
  const initialHead = await git(['rev-parse', 'HEAD'])
  await write('chosen.md', '# Chosen\n\nHistory revision content.\n')
  await git(['add', '--', 'chosen.md'])
  await git(['commit', '-m', 'History revision fixture'])
  const head = await git(['rev-parse', 'HEAD'])
  await gitAt(base, ['init', '--bare', bare])
  return {
    base,
    root,
    bare,
    initialHead,
    head,
    git,
    bareGit,
    write,
    read: (relative: string) => fs.readFile(filePath(relative), 'utf8'),
    remove: () => fs.rm(base, { recursive: true, force: true }),
  }
}
export type GitPanelFixture = Awaited<ReturnType<typeof createGitPanelFixture>>

export const openGitPanel = async (session: ElectronTestSession, fixture: GitPanelFixture) => {
  const { page } = session
  await expect(page.getByRole('button', { name: /^Workspace:|^工作区:/i })).toContainText(
    'GitPanelNotes',
  )
  await page.keyboard.press('ControlOrMeta+,')
  const settings = page.getByRole('dialog', { name: /Settings|设置/i })
  await expect(settings).toBeVisible()
  await settings.getByRole('tab', { name: /Appearance|外观/ }).click()
  await settings.getByRole('radio', { name: /^English$/ }).click()
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()
  const workspace = page.getByRole('button', { name: path.basename(fixture.root), exact: true })
  if (!(await workspace.isVisible()))
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Toggle sidebar', exact: true })
      .click()
  const sourceControl = page.getByRole('button', { name: 'Source Control', exact: true })
  if (await sourceControl.isVisible()) await sourceControl.click()
  else {
    await page.getByRole('button', { name: path.basename(fixture.root), exact: true }).click()
    await page.getByRole('menuitem', { name: 'Source Control', exact: true }).click()
  }
  await expect(page.getByRole('region', { name: 'Source Control' })).toBeVisible()
}

export const setGitWindowSize = async (
  session: ElectronTestSession,
  size: { width: number; height: number },
) => {
  const nativeWindowHandle = await session.app.browserWindow(session.page)
  try {
    await nativeWindowHandle.evaluate((nativeWindow, next) => {
      nativeWindow.setMinimumSize(0, 0)
      nativeWindow.setContentSize(next.width, next.height)
    }, size)
  } finally {
    await nativeWindowHandle.dispose()
  }
  await expect.poll(() => session.page.evaluate(() => window.innerWidth)).toBe(size.width)
}

export const expectGitControlInViewport = async (locator: Locator) => {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  const viewport = await locator.page().evaluate(() => ({ width: innerWidth, height: innerHeight }))
  expect(box).not.toBeNull()
  if (!box) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
}

export const captureGitScreenshot = async (page: Page, testInfo: TestInfo, name: string) => {
  const target = testInfo.outputPath(name)
  await page.screenshot({ path: target, animations: 'disabled' })
  await testInfo.attach(name, { path: target, contentType: 'image/png' })
  return target
}
