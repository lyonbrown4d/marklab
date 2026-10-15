import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import type http from 'node:http'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers remain outside production aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Isolated Git fixtures remain outside production bundles.
import {
  createGitConflictFixture,
  removeGitConflictFixture,
  runConflictGit,
} from './gitConflictFixture.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers remain outside production aliases.
import {
  editConflictResult,
  mergeConflictFeature,
  openConflictMergeView,
  openConflictSourceControl,
} from './gitConflictUiHarness.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers remain outside production aliases.
import {
  captureGitScreenshot,
  expectGitControlInViewport,
  setGitWindowSize,
} from './gitPanelFixture.js'

test.describe('Electron editable Git conflict lifecycle', () => {
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined
  let fixture: ReturnType<typeof createGitConflictFixture> | undefined
  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })
  test.afterAll(async () => closeRendererServer(server))
  test.beforeEach(() => {
    fixture = createGitConflictFixture()
  })
  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    removeGitConflictFixture(fixture?.root)
    fixture = undefined
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('opens an editable merge comparison, saves and stages a manual resolution, then continues', async ({}, testInfo) => {
    if (!fixture) throw new Error('Conflict fixture is unavailable')
    const { root, file, mainHead, featureHead } = fixture
    session = await launchElectronTestSession(rendererUrl, { openTargets: [root] })
    const { page } = session
    let panel = await openConflictSourceControl(page, root)
    await expect(page.getByTestId('markdown-editor')).toContainText('Main version.')
    await mergeConflictFeature(page, fixture.root)
    await expect(page.getByRole('region', { name: 'Merge result', exact: true })).toBeVisible({
      timeout: 20_000,
    })
    await expect(panel.getByRole('group', { name: 'Conflicts', exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Continue operation' })).toBeDisabled()
    expect(runConflictGit(root, ['diff', '--name-only', '--diff-filter=U'])).toBe('Shared.md')
    const { modified, original } = await openConflictMergeView(page)
    await expect(original.locator('.view-lines')).toContainText('Main version.')
    await expect(modified.locator('.view-lines')).toContainText('<<<<<<< HEAD')
    await page.getByRole('tab', { name: 'Base', exact: true }).click()
    await expect(original.locator('.view-lines')).toContainText('Base version.')
    await page.getByRole('tab', { name: 'Incoming', exact: true }).click()
    await expect(original.locator('.view-lines')).toContainText('Feature version.')
    await page.getByRole('button', { name: 'Keep incoming: conflict 1', exact: true }).click()
    await expect(modified.locator('.view-lines')).toContainText('Feature version.')
    await expect(modified.locator('.view-lines')).not.toContainText('<<<<<<<')
    const resolution = '# Shared note\n\nFeature version.\nResolved through merge editor.\n'
    await editConflictResult(page, resolution)
    expect(fs.readFileSync(file, 'utf8')).toContain('<<<<<<< HEAD')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe(resolution)
    expect(runConflictGit(root, ['diff', '--name-only', '--diff-filter=U'])).toBe('Shared.md')
    expect(runConflictGit(root, ['ls-files', '-u', '--', 'Shared.md']).split('\n')).toHaveLength(3)
    await page.getByRole('button', { name: 'Save and stage', exact: true }).click()
    await expect.poll(() => fs.readFileSync(file, 'utf8')).toBe(resolution)
    await expect.poll(() => runConflictGit(root, ['ls-files', '-u', '--', 'Shared.md'])).toBe('')
    expect(runConflictGit(root, ['show', ':Shared.md'])).toBe(resolution.trim())
    await expect(page.getByRole('region', { name: 'Merge result', exact: true })).toBeHidden()
    await expect(page.getByTestId('markdown-editor')).toContainText(
      'Resolved through merge editor.',
    )
    panel = await openConflictSourceControl(page, root, false)
    await expect(panel.getByRole('group', { name: 'Conflicts', exact: true })).toBeHidden()
    await expect(panel.getByRole('button', { name: 'Continue operation' })).toBeEnabled()
    await panel.getByRole('button', { name: 'Continue operation' }).click()
    await expect(panel.getByRole('button', { name: 'Continue operation' })).toBeHidden()
    expect(
      runConflictGit(root, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ').slice(1),
    ).toEqual([mainHead, featureHead])
    expect(runConflictGit(root, ['status', '--porcelain'])).toBe('')
    expect(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD'))).toBe(false)
    await captureGitScreenshot(page, testInfo, 'merge-resolution-continued.png')
  })

  test('rejects a stale external edit while preserving disk and the unsaved merge draft', async () => {
    if (!fixture) throw new Error('Conflict fixture is unavailable')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    const { page } = session
    await openConflictSourceControl(page, fixture.root)
    await mergeConflictFeature(page, fixture.root)
    const { modified } = await openConflictMergeView(page)
    const draft = '# Shared note\n\nMy manual draft must survive.\n'
    await editConflictResult(page, draft)
    const external = '# Shared note\n\nExternal edit must survive.\n'
    fs.writeFileSync(fixture.file, external)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: /changed|stale|reload/i })
        .first(),
    ).toBeVisible()
    expect(fs.readFileSync(fixture.file, 'utf8')).toBe(external)
    await expect(modified.locator('.view-lines')).toContainText('My manual draft must survive.')
    expect(runConflictGit(fixture.root, ['diff', '--name-only', '--diff-filter=U'])).toBe(
      'Shared.md',
    )
    expect(fs.existsSync(path.join(fixture.root, '.git', 'MERGE_HEAD'))).toBe(true)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('keeps comparison tabs, resolution controls and the editable pane reachable in small windows', async ({}, testInfo) => {
    if (!fixture) throw new Error('Conflict fixture is unavailable')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    const { page } = session
    await openConflictSourceControl(page, fixture.root)
    await mergeConflictFeature(page, fixture.root)
    const { modified } = await openConflictMergeView(page)
    for (const width of [920, 620]) {
      await setGitWindowSize(session, { width, height: 420 })
      await expectGitControlInViewport(page.getByRole('tab', { name: 'Incoming', exact: true }))
      await expectGitControlInViewport(
        page.getByRole('button', { name: 'Save and stage', exact: true }),
      )
      await page.getByRole('button', { name: 'Save', exact: true }).click({ trial: true })
      await page
        .getByRole('region', { name: 'Resolve conflict', exact: true })
        .getByRole('button', { name: 'Close', exact: true })
        .click({ trial: true })
      await expectGitControlInViewport(modified)
      expect((await modified.boundingBox())!.height).toBeGreaterThan(60)
      await editConflictResult(page, `# Shared note\n\nEditable at ${width} by 420.\n`)
      await captureGitScreenshot(page, testInfo, `editable-merge-${width}x420.png`)
    }
    expect(fs.readFileSync(fixture.file, 'utf8')).toContain('<<<<<<< HEAD')
  })

  test('requires abort confirmation and restores the pre-merge commit and file', async () => {
    if (!fixture) throw new Error('Conflict fixture is unavailable')
    const { root, file, mainContent, mainHead } = fixture
    session = await launchElectronTestSession(rendererUrl, { openTargets: [root] })
    const { page } = session
    const panel = await openConflictSourceControl(page, root)
    await mergeConflictFeature(page, fixture.root)
    await expect(panel.getByRole('button', { name: 'Continue operation' })).toBeDisabled()
    await panel.getByRole('button', { name: 'Abort operation', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: 'Abort operation', exact: true })
    await expect(confirmation).toContainText('Conflict resolution changes may be lost')
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click()
    expect(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD'))).toBe(true)
    await panel.getByRole('button', { name: 'Abort operation', exact: true }).click()
    await confirmation.getByRole('button', { name: 'Abort operation', exact: true }).click()
    await expect(confirmation).toBeHidden()
    await expect(panel.getByRole('button', { name: 'Continue operation' })).toBeHidden()
    expect(runConflictGit(root, ['rev-parse', 'HEAD'])).toBe(mainHead)
    expect(runConflictGit(root, ['status', '--porcelain'])).toBe('')
    expect(fs.existsSync(path.join(root, '.git', 'MERGE_HEAD'))).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toBe(mainContent)
  })

  test('requires confirmation before staging the deleted incoming side', async () => {
    removeGitConflictFixture(fixture?.root)
    fixture = createGitConflictFixture({ deleteIncoming: true })
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    const { page } = session
    await openConflictSourceControl(page, fixture.root)
    await mergeConflictFeature(page, fixture.root)
    await openConflictMergeView(page)
    await page.getByRole('button', { name: 'Use incoming file', exact: true }).click()
    const deletion = page.getByRole('dialog', { name: 'Delete conflicted file', exact: true })
    await expect(deletion).toBeVisible()
    expect(fs.existsSync(fixture.file)).toBe(true)
    await deletion.getByRole('button', { name: 'Confirm deletion', exact: true }).click()
    await page.getByRole('button', { name: 'Save and stage', exact: true }).click()
    await expect.poll(() => fs.existsSync(fixture!.file)).toBe(false)
    expect(runConflictGit(fixture.root, ['diff', '--name-only', '--diff-filter=U'])).toBe('')
    expect(runConflictGit(fixture.root, ['diff', '--cached', '--name-status'])).toBe('D\tShared.md')
  })
})
