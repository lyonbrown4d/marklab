import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import type http from 'node:http'
import { createHash } from 'node:crypto'
// eslint-disable-next-line no-restricted-imports -- Isolated Electron acceptance helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Reuse temporary Git repositories and real application UI.
import {
  createGitPanelFixture,
  openGitPanel,
  captureGitScreenshot,
  type GitPanelFixture,
} from './gitPanelFixture.js'
// eslint-disable-next-line no-restricted-imports -- Runtime observations do not add capabilities to the application.
import {
  monitorRuntime,
  attachDiagnostics,
  assertNoRuntimeErrors,
  type RuntimeDiagnostics,
} from './electronRuntimeDiagnostics.js'

const binary = Buffer.from('binary\0payload')
const ensureSourceControl = async (page: Page) => {
  const panel = page.getByRole('region', { name: 'Source Control', exact: true })
  if (await panel.isVisible()) return panel
  const document = page.getByTestId('markdown-editor')
  await expect(document).toHaveAttribute('data-state', 'ready')
  await document.click()
  const workspace = page.getByRole('button', { name: 'GitPanelNotes', exact: true })
  if (!(await workspace.isVisible())) {
    await page.keyboard.press('ControlOrMeta+Shift+l')
  }
  await expect(workspace).toBeVisible()
  await workspace.click()
  await page.getByRole('menuitem', { name: 'Source Control', exact: true }).click()
  await expect(panel).toBeVisible()
  return panel
}

test.describe('Git non-text preview routing', () => {
  let server: http.Server | undefined
  let rendererUrl = ''
  let session: ElectronTestSession | undefined
  let fixture: GitPanelFixture | undefined
  let diagnostics: RuntimeDiagnostics | undefined
  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })
  test.afterAll(async () => {
    // Electron's network utility can outlive its test window and retain asset sockets.
    server?.closeAllConnections()
    await closeRendererServer(server)
  })
  test.beforeEach(async () => {
    fixture = await createGitPanelFixture()
    await fixture.write('00-Anchor.md', '# Anchor\n\nSafe startup document.\n')
  })
  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test.afterEach(async ({}, info) => {
    try {
      if (session && diagnostics) {
        await attachDiagnostics(session, diagnostics, info)
        if (info.status !== info.expectedStatus)
          await info.attach('sidebar-state.json', {
            contentType: 'application/json',
            body: JSON.stringify(
              await session.page.evaluate(() => ({
                url: location.href,
                zen: document.documentElement.dataset.immersiveZen,
                pinned: document
                  .querySelector('[data-sidebar-pinned]')
                  ?.getAttribute('data-sidebar-pinned'),
                focused: document.activeElement?.outerHTML.slice(0, 300),
              })),
            ),
          })
        await captureGitScreenshot(session.page, info, 'non-text-preview.png')
        if (info.status === info.expectedStatus) assertNoRuntimeErrors(diagnostics)
      }
    } finally {
      await closeElectronTestSession(session)
      session = undefined
      diagnostics = undefined
      await fixture?.remove()
      fixture = undefined
    }
  })

  test('classifies selected working-tree and historical files before creating text diffs', async () => {
    const repo = fixture!
    await fs.writeFile(path.join(repo.root, 'history.bin'), binary)
    await repo.git(['add', '--', 'history.bin'])
    await repo.git(['commit', '-m', 'Binary history fixture'])
    // A misleading text extension must not bypass content detection.
    await fs.writeFile(path.join(repo.root, 'artifact.md'), binary)
    await fs.writeFile(path.join(repo.root, 'encoded.txt'), Buffer.from([0xff, 0xfe, 0x61, 0]))
    await fs.writeFile(path.join(repo.root, 'large.txt'), 'x'.repeat(1_048_577))
    await repo.write('chosen.md', '# Chosen\n\nNormal text diff still works.\n')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [repo.root] })
    diagnostics = monitorRuntime(session)
    const { page } = session
    const systemCalls = await session.app.evaluateHandle(({ shell }) => {
      const calls: string[] = []
      shell.openPath = async (file) => {
        calls.push(file)
        return ''
      }
      return calls
    })
    await openGitPanel(session, repo)
    const panel = page.getByRole('region', { name: 'Source Control', exact: true })
    for (const [file, message] of [
      ['artifact.md', 'Binary files cannot be compared as text.'],
      ['encoded.txt', 'This file is not UTF-8 text.'],
    ]) {
      await ensureSourceControl(page)
      await panel
        .getByRole('button', { name: `Open Diff: ${file} (Untracked)`, exact: true })
        .click()
      const status = page.getByRole('status', { name: 'Text diff unavailable', exact: true })
      await expect(status).toBeVisible()
      await expect(status).toContainText(message!)
      await expect(page.locator('.monaco-diff-editor:visible')).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
      await expect(
        page
          .getByRole('button', { name: `Open File: ${file}`, exact: true })
          .filter({ hasText: 'Open File' }),
      ).toHaveCount(0)
      await page.getByRole('button', { name: 'Close Diff', exact: true }).click()
    }
    await ensureSourceControl(page)
    await panel
      .getByRole('button', { name: 'Open Diff: large.txt (Untracked)', exact: true })
      .click()
    await expect(page.getByRole('article', { name: 'large.txt source preview' })).toBeVisible()
    await expect(page.locator('.monaco-diff-editor:visible')).toHaveCount(0)
    await page.getByRole('button', { name: 'Close Diff', exact: true }).click()
    expect(await fs.readFile(path.join(repo.root, 'artifact.md'))).toEqual(binary)
    await ensureSourceControl(page)
    await panel
      .getByRole('button', { name: 'Open Diff: chosen.md (Modified)', exact: true })
      .click()
    await expect(
      page.locator('.monaco-diff-editor:visible .editor.modified .view-lines'),
    ).toContainText('Normal text diff still works.')
    await page.getByRole('button', { name: 'Close Diff', exact: true }).click()
    await ensureSourceControl(page)
    await panel.getByRole('button', { name: 'History and branches', exact: true }).click()
    const management = page.getByRole('dialog', { name: 'Manage Git repository', exact: true })
    await management.getByRole('button', { name: /Binary history fixture/ }).click()
    await expect(management.getByRole('status', { name: 'Text diff unavailable' })).toContainText(
      'Binary files cannot be compared as text.',
    )
    await expect(management.getByRole('alert')).toHaveCount(0)
    await expect(management.locator('pre')).toHaveCount(0)
    await management.getByRole('button', { name: 'Open in system', exact: true }).click()
    await expect.poll(async () => (await systemCalls.jsonValue()).length).toBe(1)
    const snapshotPath = (await systemCalls.jsonValue())[0]!
    expect(snapshotPath).not.toBe(path.join(repo.root, 'history.bin'))
    expect(await fs.readFile(snapshotPath)).toEqual(binary)
    await systemCalls.dispose()
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('uses internal image previews for worktree, index and immutable commit versions', async ({}, info) => {
    const repo = fixture!
    const png = await fs.readFile(path.join(process.cwd(), 'resources/icons/marklab.png'))
    await fs.writeFile(path.join(repo.root, 'cover.png'), png)
    await repo.git(['add', '--', 'cover.png'])
    await repo.git(['commit', '-m', 'Image history fixture'])
    const index = Buffer.concat([png, Buffer.from('Index version')])
    const worktree = Buffer.concat([png, Buffer.from('Working tree version')])
    await fs.writeFile(path.join(repo.root, 'cover.png'), index)
    await repo.git(['add', '--', 'cover.png'])
    await fs.writeFile(path.join(repo.root, 'cover.png'), worktree)
    session = await launchElectronTestSession(rendererUrl, { openTargets: [repo.root] })
    diagnostics = monitorRuntime(session)
    const { page } = session
    await openGitPanel(session, repo)
    const panel = page.getByRole('region', { name: 'Source Control', exact: true })
    const assertImage = async (bytes: Buffer) => {
      const image = page.getByRole('img', { name: /cover.png/ })
      await expect(image).toBeVisible()
      await expect
        .poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0)
      const src = await image.getAttribute('src')
      const actual = await page.evaluate(async (url) => {
        const response = await fetch(url!)
        if (!response.ok) throw new Error('Snapshot asset request failed')
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer())
        return [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
      }, src)
      expect(actual).toBe(createHash('sha256').update(bytes).digest('hex'))
      await expect(page.locator('.monaco-diff-editor:visible')).toHaveCount(0)
    }
    await panel
      .getByRole('group', { name: 'Staged Changes', exact: true })
      .getByRole('button', { name: 'Open Diff: cover.png (Modified)', exact: true })
      .click()
    await assertImage(index)
    await page.getByRole('button', { name: 'Close Diff', exact: true }).click()
    await ensureSourceControl(page)
    await panel
      .getByRole('group', { name: 'Changes', exact: true })
      .getByRole('button', { name: 'Open Diff: cover.png (Modified)', exact: true })
      .click()
    await assertImage(worktree)
    await page.getByRole('button', { name: 'Close Diff', exact: true }).click()
    await ensureSourceControl(page)
    await panel.getByRole('button', { name: 'History and branches', exact: true }).click()
    const management = page.getByRole('dialog', { name: 'Manage Git repository', exact: true })
    await management.getByRole('button', { name: /Image history fixture/ }).click()
    await assertImage(png)
    await expect(management.getByText('Read-only version', { exact: false })).toBeVisible()
    await captureGitScreenshot(page, info, 'native-image-history-preview.png')
    expect(await fs.readFile(path.join(repo.root, 'cover.png'))).toEqual(worktree)
  })

  test('keeps binary conflicts out of the merge editor and preserves index and disk bytes', async () => {
    const repo = fixture!
    const target = path.join(repo.root, 'conflict.bin')
    await fs.writeFile(target, binary)
    await repo.git(['add', '--', 'conflict.bin'])
    await repo.git(['commit', '-m', 'Binary base'])
    await repo.git(['switch', '-c', 'binary-feature'])
    await fs.writeFile(target, Buffer.from('incoming\0bytes'))
    await repo.git(['commit', '-am', 'Binary incoming'])
    await repo.git(['switch', 'main'])
    const ours = Buffer.from('current\0bytes')
    await fs.writeFile(target, ours)
    await repo.git(['commit', '-am', 'Binary current'])
    await expect(repo.git(['merge', 'binary-feature'])).rejects.toThrow()
    const before = await repo.git(['ls-files', '-u', '--', 'conflict.bin'])
    expect(before.split('\n')).toHaveLength(3)
    session = await launchElectronTestSession(rendererUrl, { openTargets: [repo.root] })
    diagnostics = monitorRuntime(session)
    const { page } = session
    await openGitPanel(session, repo)
    await page
      .getByRole('button', { name: 'Resolve conflict: conflict.bin (Conflicted)', exact: true })
      .click()
    const status = page.getByRole('status', { name: 'Text diff unavailable', exact: true })
    await expect(status).toContainText('Binary files cannot be compared as text.')
    await expect(status).toContainText(
      'Resolve this conflict in an external tool, then stage the file.',
    )
    await expect(page.locator('.monaco-diff-editor:visible')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Save and stage', exact: true })).toBeDisabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.keyboard.press('ControlOrMeta+s')
    expect(await fs.readFile(target)).toEqual(ours)
    expect(await repo.git(['ls-files', '-u', '--', 'conflict.bin'])).toBe(before)
  })
})
