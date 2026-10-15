import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
// eslint-disable-next-line no-restricted-imports -- Public demo screenshots use isolated test profiles, never a user's workspace.
import {
  startRendererServer,
  closeRendererServer,
  launchElectronTestSession,
  closeElectronTestSession,
  revealElectronWindow,
  repoRoot,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Reuse the Electron acceptance diagnostics.
import { monitorRuntime, assertNoRuntimeErrors } from './electronRuntimeDiagnostics.js'
// eslint-disable-next-line no-restricted-imports -- Wait for the real canvas to finish its initial fit.
import { waitForMapScaleToSettle } from './interactionContinuityHarness.js'

test('captures real application views using public example notes', async () => {
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-website-demo-'))
  const workspace = path.join(scratch, 'Fieldnotes')
  const assets = path.join(repoRoot, 'website', 'src', 'assets')
  await fs.mkdir(workspace)
  await fs.mkdir(assets, { recursive: true })
  const git = (args: string[]) => execFileSync('git', args, { cwd: workspace, encoding: 'utf8' })
  const initial =
    '# Project notes\n\nNotes for the next release.\n\n## Tasks\n\n- [x] Review the Git changes\n- [x] Update the installation guide\n- [ ] Check the next build.\n\n## Meeting notes\n\nKeep the editor simple. Show the document first.\n\n## Related notes\n\nSee [[Reading list]] and [[Tomorrow]].\n'
  await fs.writeFile(path.join(workspace, 'Welcome.md'), initial)
  await fs.writeFile(
    path.join(workspace, 'Reading list.md'),
    '# Reading list\n\nIdeas to revisit. See [[Welcome]].\n',
  )
  await fs.writeFile(
    path.join(workspace, 'Tomorrow.md'),
    '# Tomorrow\n\nSee [[Welcome]], [[Release checklist]], and [[Meeting notes]].\n',
  )
  await Promise.all(
    [
      ['Release checklist.md', '# Release checklist\n\nSee [[Welcome]] and [[Reading list]].\n'],
      ['Meeting notes.md', '# Meeting notes\n\nSee [[Tomorrow]] and [[Design decisions]].\n'],
      ['Design decisions.md', '# Design decisions\n\nSee [[Welcome]] and [[Meeting notes]].\n'],
    ].map(([name, content]) => fs.writeFile(path.join(workspace, name), content)),
  )
  git(['init', '-b', 'main'])
  git(['add', '.'])
  git([
    '-c',
    'user.name=Marklab Demo',
    '-c',
    'user.email=demo@example.invalid',
    'commit',
    '-m',
    'Start a notebook',
  ])
  const renderer = await startRendererServer()
  const session = await launchElectronTestSession(renderer.url, { openTargets: [workspace] })
  const diagnostics = monitorRuntime(session)
  try {
    const { page } = session
    await revealElectronWindow(session.app, page, { width: 1440, height: 960 })
    const welcome = page
      .getByRole('region', { name: /^(Files|文件)$/i })
      .getByRole('button', { name: 'Welcome.md', exact: true })
    if (!(await welcome.isVisible())) await page.keyboard.press('ControlOrMeta+Shift+l')
    await expect(welcome).toBeVisible()
    await welcome.click()
    const editor = page.getByTestId('markdown-editor')
    await expect(editor).toHaveAttribute('data-state', 'ready')
    await expect(editor).toContainText('Project notes')
    // Complete a real edit/save cycle so the screenshot includes settled document statistics.
    await editor.locator('p').first().click()
    await page.keyboard.insertText(' ')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByRole('contentinfo', { name: 'Status bar' })).toContainText(
      /[1-9]\d* words/,
    )
    await page.mouse.move(1250, 800)
    await page.screenshot({ path: path.join(assets, 'app-editor.png'), animations: 'disabled' })
    // Produce the Git change through the editor so disk writes do not race its buffer.
    await editor.locator('p').first().click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(' Updated for macOS.')
    await page.keyboard.press('ControlOrMeta+s')
    await expect
      .poll(() => fs.readFile(path.join(workspace, 'Welcome.md'), 'utf8'))
      .toContain('Updated for macOS.')
    await page.keyboard.press('ControlOrMeta+Shift+l')
    await page.getByRole('button', { name: 'Fieldnotes', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Source Control', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Source Control', exact: true })
    await expect(panel).toBeVisible()
    await panel
      .getByRole('button', { name: 'Open Diff: Welcome.md (Modified)', exact: true })
      .click()
    await expect(page.locator('.monaco-diff-editor')).toBeVisible()
    await page.screenshot({ path: path.join(assets, 'app-git.png'), animations: 'disabled' })
    await page.getByRole('radio', { name: /^(Map|地图)$/i }).click()
    const map = page.getByLabel(/Workspace map canvas|工作区地图画布/i)
    await expect(map).toBeVisible()
    await expect(map.locator('.react-flow__minimap-node')).toHaveCount(6)
    await waitForMapScaleToSettle(page)
    await map.focus()
    await page.keyboard.press('0')
    await waitForMapScaleToSettle(page)
    await expect(map.locator('.react-flow__node')).toHaveCount(6)
    for (const node of await map.locator('.react-flow__node').all()) {
      await expect(node).toBeInViewport()
    }
    await expect(map.locator('.react-flow__edge').first()).toBeVisible()
    await expect(page.getByText('Failed to flush file buffers', { exact: true })).toHaveCount(0)
    await map.blur()
    await page.mouse.move(1250, 800)
    await page.screenshot({
      path: path.join(assets, 'app-workspace-map.png'),
      animations: 'disabled',
    })
    assertNoRuntimeErrors(diagnostics)
  } finally {
    await closeElectronTestSession(session)
    renderer.server.closeAllConnections()
    await closeRendererServer(renderer.server)
    await fs.rm(scratch, { recursive: true, force: true })
  }
})
