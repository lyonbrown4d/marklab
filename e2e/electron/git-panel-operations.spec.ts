import { expect, test } from '@playwright/test'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  revealElectronWindow,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  createGitPanelFixture,
  captureGitScreenshot,
  expectGitControlInViewport,
  openGitPanel,
  setGitWindowSize,
  type GitPanelFixture,
} from './gitPanelFixture.js'

test.describe('Git panel operations in isolated repositories', () => {
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined
  let fixture: GitPanelFixture
  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })
  test.beforeEach(async () => {
    fixture = await createGitPanelFixture()
  })
  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    await fixture.remove()
  })
  test.afterAll(async () => closeRendererServer(server))

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('commits selected staged work, confirms discard and publishes to a local bare remote', async ({}, testInfo) => {
    await fixture.write('chosen.md', '# Chosen\n\nUI staged commit content.\n')
    await fixture.write('unfinished.md', '# Unfinished\n\nKeep this work uncommitted.\n')
    for (let index = 1; index <= 9; index++)
      await fixture.write(`Extra-${String(index).padStart(2, '0')}.md`, `# Extra ${index}\n`)
    session = await launchElectronTestSession(rendererUrl, {
      openTargets: [fixture.root],
      testRunRoot: `${fixture.base}/profile`,
    })
    await openGitPanel(session, fixture)
    const page = session.page
    const panel = page.getByRole('region', { name: 'Source Control' })
    await setGitWindowSize(session, { width: 900, height: 420 })
    await expectGitControlInViewport(
      panel.getByRole('button', { name: 'Stage: Extra-09.md', exact: true }),
    )
    await captureGitScreenshot(page, testInfo, 'short-window-git-changes.png')
    await panel.getByRole('button', { name: 'Stage: chosen.md', exact: true }).click()
    await expect.poll(() => fixture.git(['diff', '--cached', '--name-only'])).toBe('chosen.md')
    await panel.getByRole('button', { name: 'Commit staged changes', exact: true }).click()
    const commit = page.getByRole('dialog', { name: 'Commit staged changes' })
    await commit
      .getByRole('textbox', { name: 'Commit message' })
      .fill('Commit selected file through UI')
    await commit.getByRole('button', { name: 'Commit staged changes', exact: true }).click()
    await expect(commit).toBeHidden()
    expect(await fixture.git(['show', '--format=', '--name-only', 'HEAD'])).toBe('chosen.md')
    expect(await fixture.git(['log', '-1', '--format=%s'])).toBe('Commit selected file through UI')
    expect(await fixture.git(['status', '--porcelain'])).toContain('M unfinished.md')
    expect(await fixture.git(['diff', '--cached', '--name-only'])).toBe('')

    await panel.getByRole('button', { name: 'Discard changes: unfinished.md', exact: true }).click()
    const discard = page.getByRole('dialog', { name: 'Discard changes' })
    await expect(discard).toContainText('unfinished.md')
    expect(await fixture.read('unfinished.md')).toContain('Keep this work uncommitted')
    await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(discard).toBeHidden()
    expect(await fixture.read('unfinished.md')).toContain('Original tracked content')
    await panel.getByRole('button', { name: 'Discard changes: Extra-09.md', exact: true }).click()
    await expect(discard).toContainText(/permanently deleted/)
    await discard.getByRole('button', { name: 'Discard changes', exact: true }).click()
    await expect(discard).toBeHidden()
    await expect.poll(() => fixture.git(['status', '--porcelain'])).not.toContain('Extra-09.md')
    expect(await fixture.read('Extra-08.md')).toContain('Extra 8')

    await panel.getByRole('button', { name: 'Remotes', exact: true }).click()
    const remotes = page.getByRole('dialog', { name: 'Remotes' })
    await remotes.getByRole('textbox', { name: 'Remote URL' }).fill(fixture.bare)
    await remotes.getByRole('button', { name: 'Save remote', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Save remote' })
    await expect(confirmation).toContainText(fixture.bare)
    await confirmation.getByRole('button', { name: 'Save remote', exact: true }).click()
    await expect(confirmation).toBeHidden()
    await remotes.getByRole('button', { name: 'Close', exact: true }).click()
    await panel.getByRole('button', { name: 'Publish branch', exact: true }).click()
    await expect
      .poll(() => fixture.git(['rev-parse', '--abbrev-ref', '@{upstream}']).catch(() => ''))
      .toBe('origin/main')
    expect(await fixture.bareGit(['rev-parse', 'refs/heads/main'])).toBe(
      await fixture.git(['rev-parse', 'HEAD']),
    )
    await captureGitScreenshot(page, testInfo, 'git-published-local-remote.png')
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('shows history diffs, switches a new branch, stashes work and preserves reset recovery', async ({}, testInfo) => {
    session = await launchElectronTestSession(rendererUrl, {
      openTargets: [fixture.root],
      testRunRoot: `${fixture.base}/profile`,
    })
    await openGitPanel(session, fixture)
    const page = session.page
    await page.getByRole('button', { name: 'History and branches', exact: true }).click()
    const management = page.getByRole('dialog', { name: 'Manage Git repository' })
    const diff = management.getByLabel('Changes in chosen.md', { exact: true })
    await expect(diff).toContainText('-Initial fixture content.')
    await expect(diff).toContainText('+History revision content.')
    await management.getByRole('tab', { name: 'Branches', exact: true }).click()
    await management.getByRole('textbox', { name: 'New branch name' }).fill('feature/ui-e2e')
    await management.getByRole('button', { name: 'Create branch', exact: true }).click()
    const branchRow = management.locator('li').filter({ hasText: 'feature/ui-e2e' })
    await expect(branchRow).toBeVisible()
    await branchRow.getByRole('button', { name: 'Switch', exact: true }).click()
    await expect.poll(() => fixture.git(['branch', '--show-current'])).toBe('feature/ui-e2e')

    await fixture.write('unfinished.md', '# Unfinished\n\nSaved in UI stash.\n')
    await fixture.write('stash-note.md', '# Untracked stash content\n')
    await management.getByRole('tab', { name: 'Stash', exact: true }).click()
    await management
      .getByRole('textbox', { name: 'Stash message (optional)' })
      .fill('UI stash fixture')
    await management.getByRole('button', { name: 'Save stash', exact: true }).click()
    await expect.poll(() => fixture.git(['stash', 'list'])).toContain('UI stash fixture')
    expect(await fixture.git(['status', '--porcelain'])).toBe('')
    const stashRow = management.locator('li').filter({ hasText: 'UI stash fixture' })
    await stashRow.getByRole('button', { name: 'Apply', exact: true }).click()
    await expect.poll(() => fixture.read('unfinished.md')).toContain('Saved in UI stash')
    expect(await fixture.read('stash-note.md')).toContain('Untracked stash content')
    expect(await fixture.git(['stash', 'list'])).toContain('UI stash fixture')
    await management.getByRole('button', { name: 'Close', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Source Control' })
    for (const file of ['unfinished.md', 'stash-note.md']) {
      await panel.getByRole('button', { name: `Discard changes: ${file}`, exact: true }).click()
      await page
        .getByRole('dialog', { name: 'Discard changes' })
        .getByRole('button', { name: 'Discard changes', exact: true })
        .click()
      await expect(page.getByRole('dialog', { name: 'Discard changes' })).toBeHidden()
    }
    await panel.getByRole('button', { name: 'History and branches', exact: true }).click()
    await management.getByRole('tab', { name: 'History', exact: true }).click()
    const shortHash = await fixture.git(['rev-parse', '--short', fixture.initialHead])
    await management.getByRole('button', { name: `Actions for ${shortHash}`, exact: true }).click()
    await page.getByRole('menuitem', { name: 'Reset to commit', exact: true }).click()
    const reset = page.getByRole('dialog', { name: 'Reset to commit' })
    await reset.getByRole('combobox', { name: 'Reset mode' }).click()
    await page.getByRole('option', { name: 'Hard — discard changes', exact: true }).click()
    await expect(reset.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled()
    await reset.getByRole('checkbox').check()
    await reset.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(reset).toBeHidden()
    await expect.poll(() => fixture.git(['rev-parse', 'HEAD'])).toBe(fixture.initialHead)
    const backup = (
      await fixture.git(['branch', '--format=%(refname:short)', '--list', 'marklab-backup-*'])
    ).split('\n')[0]!
    expect(backup).toMatch(/^marklab-backup-/)
    expect(await fixture.git(['rev-parse', `refs/heads/${backup}`])).toBe(fixture.head)
    await expect(management.getByRole('status')).toContainText(`Backup branch created: ${backup}`)
    await captureGitScreenshot(page, testInfo, 'git-reset-backup-created.png')
  })
  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('keeps history and diff contents inside narrow and short windows', async ({}, testInfo) => {
    const longHistory = Array.from({ length: 80 }, (_, index) => `History line ${index + 1}.`)
    await fixture.write(
      'chosen.md',
      `# Chosen\n\nHistory revision content.\n${longHistory.join('\n')}\nEnd of history diff.\n`,
    )
    await fixture.git(['add', '--', 'chosen.md'])
    await fixture.git(['commit', '-m', 'Scrollable history fixture'])
    session = await launchElectronTestSession(rendererUrl, {
      openTargets: [fixture.root],
      testRunRoot: `${fixture.base}/profile`,
    })
    await openGitPanel(session, fixture)
    const page = session.page
    await page.getByRole('button', { name: 'History and branches', exact: true }).click()
    const management = page.getByRole('dialog', { name: 'Manage Git repository' })
    const diff = management.getByLabel('Changes in chosen.md', { exact: true })
    await expect(diff).toContainText('+End of history diff.')
    for (const width of [920, 620]) {
      await setGitWindowSize(session, { width, height: 420 })
      await expectGitControlInViewport(
        management.getByRole('button', { name: 'Close', exact: true }),
      )
      await expectGitControlInViewport(
        management.getByRole('tab', { name: 'Branches', exact: true }),
      )
      await captureGitScreenshot(page, testInfo, `git-history-${width}x420.png`)
      const diffViewport = await diff.locator('..').boundingBox()
      const historyViewport = await management
        .getByRole('tabpanel', { name: 'History', exact: true })
        .boundingBox()
      expect(diffViewport).not.toBeNull()
      expect(historyViewport).not.toBeNull()
      expect(
        diffViewport!.y + diffViewport!.height,
        `Diff bottom must remain inside History at ${width}x420`,
      ).toBeLessThanOrEqual(historyViewport!.y + historyViewport!.height + 1)
      const diffScroller = diff.locator('..')
      expect(
        await diffScroller.evaluate((element) => element.scrollHeight > element.clientHeight),
      ).toBe(true)
      await diffScroller.hover()
      await page.mouse.wheel(0, 10_000)
      await expect
        .poll(() =>
          diffScroller.evaluate(
            (element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1,
          ),
        )
        .toBe(true)
      await captureGitScreenshot(page, testInfo, `git-history-${width}x420-bottom.png`)
    }
  })
  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('polls externally changed index and history without a manual refresh', async ({}) => {
    await fixture.write('unfinished.md', '# Unfinished\n\nExternal polling commit content.\n')
    session = await launchElectronTestSession(rendererUrl, {
      openTargets: [fixture.root],
      testRunRoot: `${fixture.base}/profile`,
    })
    await openGitPanel(session, fixture)
    const page = session.page
    await revealElectronWindow(session.app, page)
    await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true)
    const panel = page.getByRole('region', { name: 'Source Control' })
    await expect(
      panel.getByRole('button', { name: 'Stage: unfinished.md', exact: true }),
    ).toBeVisible()
    // Only .git/index changes here, so renderer filesystem events cannot supply the update.
    await fixture.git(['add', '--', 'unfinished.md'])
    await expect(
      panel.getByRole('button', { name: 'Unstage: unfinished.md', exact: true }),
    ).toBeVisible({ timeout: 20_000 })
    await panel.getByRole('button', { name: 'History and branches', exact: true }).click()
    const management = page.getByRole('dialog', { name: 'Manage Git repository' })
    await expect(
      management.getByRole('button', { name: /^History revision fixture/ }),
    ).toBeVisible()
    await fixture.git(['commit', '-m', 'External commit picked up automatically'])
    await revealElectronWindow(session.app, page)
    await expect(
      management.getByRole('button', { name: /^External commit picked up automatically/ }),
    ).toBeVisible({ timeout: 20_000 })
    expect(await fixture.git(['log', '-1', '--format=%s'])).toBe(
      'External commit picked up automatically',
    )
  })
})
