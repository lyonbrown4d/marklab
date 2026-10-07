import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
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

const FIXTURE_PREFIX = 'marklab-search-settings-'
const screenshotDirectory = path.join(repoRoot, 'output', 'playwright', 'design-qa')

const writeWorkspaceFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'docs', 'Architecture.md'),
    [
      '# Architecture',
      '',
      'The architecture starts with explicit desktop boundaries.',
      'A maintainable architecture keeps renderer capabilities narrow.',
      'This architecture remains local-first and incremental.',
      '',
      '## 架构原则',
      '架构需要清晰的运行时边界。',
      '本地优先架构也需要可维护性。',
    ].join('\n'),
    'utf8',
  )
  fs.writeFileSync(
    path.join(root, 'Notes.md'),
    [
      '# Design notes',
      '',
      'These notes reference the architecture from another file.',
      '架构评审覆盖启动速度和内存占用。',
    ].join('\n'),
    'utf8',
  )
  return root
}

const removeWorkspaceFixture = (root: string | undefined) => {
  if (!root) return
  const resolved = path.resolve(root)
  if (
    path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
    !path.basename(resolved).startsWith(FIXTURE_PREFIX)
  ) {
    throw new Error(`Refusing to remove unexpected E2E workspace: ${resolved}`)
  }
  fs.rmSync(resolved, { recursive: true, force: true })
}

const capture = async (page: Page, name: string, testInfo: TestInfo) => {
  const target = path.join(screenshotDirectory, name)
  await page.screenshot({ animations: 'disabled', path: target })
  await testInfo.attach(name, { contentType: 'image/png', path: target })
}

const openWorkspaceSession = async (rendererUrl: string, workspaceRoot: string) => {
  const session = await launchElectronTestSession(rendererUrl, { openTargets: [workspaceRoot] })
  await revealElectronWindow(session.app, session.page)
  const workspaceName = path.basename(workspaceRoot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(
    session.page.getByRole('button', {
      name: new RegExp(`^(Workspace|工作区):.*${workspaceName}`, 'i'),
    }),
  ).toBeVisible({ timeout: 45_000 })
  return session
}

const expectSelectedMode = async (dialog: Locator, selected: RegExp) => {
  const tabs = dialog.getByRole('tab')
  await expect(tabs).toHaveCount(3)
  for (const tab of await tabs.all()) {
    const name = await tab.getAttribute('aria-label')
    await expect(tab).toHaveAttribute('aria-selected', selected.test(name ?? '') ? 'true' : 'false')
  }
}

test.describe('Search and settings redesign', () => {
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined
  let workspaceRoot: string | undefined

  test.beforeAll(async () => {
    workspaceRoot = writeWorkspaceFixture()
    fs.mkdirSync(screenshotDirectory, { recursive: true })
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test.afterEach(async ({}, testInfo) => {
    if (session) {
      await testInfo.attach('electron-output.txt', {
        body: session.output.join('\n') || '(no Electron process output)',
        contentType: 'text/plain',
      })
    }
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    removeWorkspaceFixture(workspaceRoot)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('opens the global panel by double Shift and shortcut, then switches exclusive modes', async ({}, testInfo) => {
    session = await openWorkspaceSession(rendererUrl, workspaceRoot!)
    const page = session.page
    const dialog = page.getByRole('dialog', { name: /Command palette|命令面板/i })

    await page.keyboard.down('Shift')
    await page.keyboard.up('Shift')
    await page.evaluate(() => new Promise(requestAnimationFrame))
    await expect(dialog).toBeHidden()
    await page.keyboard.down('Shift')
    await page.keyboard.up('Shift')
    await expect(dialog).toBeVisible()
    await expectSelectedMode(dialog, /Quick open|快速打开/i)
    const quickInput = dialog.getByRole('combobox')
    await quickInput.fill('Architecture')
    await expect(
      dialog
        .getByRole('option')
        .filter({ hasText: /Architecture\.md/i })
        .first(),
    ).toBeVisible()
    await capture(page, 'global-command-panel.png', testInfo)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await page.keyboard.press('ControlOrMeta+P')
    await expect(dialog).toBeVisible()
    const input = dialog.getByRole('combobox')
    await expect(input).toBeFocused()

    await input.press('ControlOrMeta+2')
    await expectSelectedMode(dialog, /Full-text search|全文搜索/i)
    await input.fill('architecture')
    await expect(
      dialog
        .getByRole('option')
        .filter({ hasText: /Architecture\.md/i })
        .first(),
    ).toBeVisible({ timeout: 20_000 })

    await input.press('ControlOrMeta+3')
    await expectSelectedMode(dialog, /Commands|命令/i)
    await input.press('ControlOrMeta+1')
    await expectSelectedMode(dialog, /Quick open|快速打开/i)
    await expect(
      dialog
        .getByRole('option')
        .filter({ hasText: /Architecture\.md/i })
        .first(),
    ).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('groups settings, navigates search to a focused setting, and resets page scroll', async ({}, testInfo) => {
    session = await openWorkspaceSession(rendererUrl, workspaceRoot!)
    const page = session.page
    await page.keyboard.press('ControlOrMeta+,')
    const dialog = page.getByRole('dialog', { name: /Settings|设置/i })
    await expect(dialog).toBeVisible()

    const chinese =
      (await dialog.getByRole('heading', { name: /Settings|设置/i }).textContent()) === '设置'
    const groupLabels = chinese
      ? ['应用', '工作区', '智能功能', '系统']
      : ['Application', 'Workspace', 'Smart features', 'System']
    for (const group of groupLabels) {
      await expect(dialog.getByText(group, { exact: true })).toBeVisible()
    }

    await dialog.getByRole('tab', { name: /^(Editing|编辑)$/i }).click()
    await capture(page, 'settings-dialog.png', testInfo)

    const appearanceTab = dialog.getByRole('tab', { name: /Appearance|外观/i })
    await appearanceTab.click()
    await expect(appearanceTab).toHaveAttribute('aria-selected', 'true')
    const viewport = dialog.locator('.settings-scroll-viewport')
    const scrolled = await viewport.evaluate((element) => {
      element.scrollTop = element.scrollHeight
      return element.scrollTop
    })
    expect(scrolled).toBeGreaterThan(0)
    await dialog.getByRole('tab', { name: /General|通用/i }).click()
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0)

    const search = dialog.getByRole('searchbox', { name: /Search settings|搜索设置/i })
    await search.fill(
      /搜索/.test((await search.getAttribute('aria-label')) ?? '')
        ? '静默自动保存'
        : 'silent autosave',
    )
    const result = dialog.getByRole('option', { name: /Silent autosave|静默自动保存/i })
    await expect(result).toHaveAttribute('data-setting-target', 'settings-save-behavior')
    await result.click()
    await expect(dialog.getByRole('tab', { name: /Files & saving|文件与保存/i })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await expect(page.locator('#settings-save-behavior')).toBeFocused()

    await search.fill('silent')
    await page.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await expect(search).toBeFocused()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('groups workspace matches, exposes options, and opens a result from the keyboard', async ({}, testInfo) => {
    session = await openWorkspaceSession(rendererUrl, workspaceRoot!)
    const page = session.page
    const panel = page.getByRole('region', { name: /Workspace Search|工作区搜索/i })
    const searchActivity = page.getByRole('button', { name: /^(Search|搜索)$/i })
    if (await searchActivity.isVisible().catch(() => false)) {
      await searchActivity.click()
    } else if (!(await panel.isVisible().catch(() => false))) {
      const workspaceMenu = page
        .locator('aside')
        .getByRole('button')
        .filter({ hasText: path.basename(workspaceRoot!) })
      if (!(await workspaceMenu.isVisible().catch(() => false))) {
        await page.keyboard.press('Control+Shift+L')
      }
      await page
        .locator('aside')
        .getByRole('button')
        .filter({ hasText: path.basename(workspaceRoot!) })
        .click()
      await page.getByRole('menuitem', { name: /^(Search|搜索)$/i }).click()
    }

    await expect(panel).toBeVisible()
    const input = panel.getByRole('searchbox', { name: /Full Text|全文搜索/i })
    await input.fill('architecture')

    const architectureGroup = panel
      .locator('button[aria-expanded]')
      .filter({ hasText: /Architecture\.md/i })
    const notesGroup = panel.locator('button[aria-expanded]').filter({ hasText: /Notes\.md/i })
    await expect(architectureGroup).toContainText('4', { timeout: 20_000 })
    await expect(notesGroup).toContainText('1')
    const architectureMatches = panel.locator('[data-search-result-id^="docs/Architecture.md:"]')
    await expect.poll(() => architectureMatches.count()).toBeGreaterThanOrEqual(3)

    const options = panel.getByRole('toolbar', { name: /Search options|搜索选项/i })
    for (const name of [
      /Match case|区分大小写/i,
      /Whole word|全字匹配/i,
      /Regular expression|正则表达式/i,
    ]) {
      const option = options.getByRole('button', { name })
      await expect(option).toHaveAttribute('aria-pressed', 'false')
      await option.click()
      await expect(option).toHaveAttribute('aria-pressed', 'true')
      await expect(architectureMatches.first()).toBeVisible()
      await option.click()
      await expect(option).toHaveAttribute('aria-pressed', 'false')
    }
    await expect(architectureMatches.first()).toBeVisible()
    await capture(page, 'workspace-search.png', testInfo)

    const initiallySelected = panel.locator('[data-search-result-id][aria-current="true"]')
    await expect(initiallySelected).toBeVisible()
    await initiallySelected.focus()
    await initiallySelected.press('Enter')
    const sourceEditor = page.locator('.monaco-editor')
    await expect(sourceEditor).toBeVisible({ timeout: 15_000 })
    await expect(sourceEditor.locator('.view-lines')).toContainText(/architecture/i)
  })
})
