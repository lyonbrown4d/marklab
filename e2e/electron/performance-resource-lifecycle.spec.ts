import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type * as Monaco from '@/lib/monacoRuntime'
// eslint-disable-next-line no-restricted-imports -- Bounded Monaco integration assertions stay outside production bundles.
import {
  assertMonacoLanguageWorkers,
  attachSourceState,
} from './performanceResourceLanguageHarness.js'
// eslint-disable-next-line no-restricted-imports -- Reuse the isolated Electron harness outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Runtime diagnostics remain outside production bundles.
import {
  assertNoRuntimeErrors,
  attachDiagnostics,
  monitorRuntime,
  type RuntimeDiagnostics,
} from './electronRuntimeDiagnostics.js'
// eslint-disable-next-line no-restricted-imports -- The existing file picker uses normal application UI.
import { openInteractionFile } from './interactionContinuityHarness.js'

const fixturePrefix = 'marklab-resource-lifecycle-'
const initialSmall = '# Small\n\nSaved lifecycle text.\n'
const initialLarge = `# Large\n\n${Array.from(
  { length: 150 },
  (_, index) => `Paragraph ${index}: ${'ordinary markdown text '.repeat(44).trimEnd()}`,
).join('\n\n')}\n\nTail marker\n`
const sourceLines = (page: Page) => page.locator('.source-code-editor:visible .view-lines')
const sourceInput = (page: Page) =>
  page.locator('.source-code-editor:visible :is(textarea.inputarea, .native-edit-context)')
const markdownWorkers = (page: Page) =>
  page.workers().filter((worker) => /\/plateMarkdownWorker[-.]/.test(worker.url()))

const openSource = async (page: Page, name: string) => {
  const openFiles = page.getByRole('button', { name: /Show open files|显示打开的文件/i })
  if (await openFiles.isVisible()) await openFiles.click()
  const existingSource = page
    .locator(`[role="tab"][title="${name}"]`)
    .filter({ hasText: / · (Source|源码)$/i })
  if ((await existingSource.count()) > 0) {
    await existingSource.first().click()
  } else {
    await openInteractionFile(page, name)
    await expect(page).toHaveURL(
      new RegExp(`/files/(?:edit|source)/${name.replace('.', '\\.')}(?:\\?.*)?$`),
    )
    if (page.url().includes('/files/edit/')) {
      await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready')
      if ((await existingSource.count()) > 0) await existingSource.first().click()
    }
  }
  const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })
  const source = modes.getByRole('radio', { name: /^(Source|Source Editor|源码)$/i })
  if (
    !(await page.locator('.source-code-editor:visible .monaco-editor').isVisible()) &&
    (await source.getAttribute('aria-checked')) === 'true'
  ) {
    await modes.getByRole('radio', { name: /^(WYSIWYG|所见即所得)$/i }).click()
    await expect(source).toHaveAttribute('aria-checked', 'false')
  }
  if ((await source.getAttribute('aria-checked')) !== 'true') await source.click()
  await expect(page.locator('.source-code-editor:visible .monaco-editor')).toBeVisible({
    timeout: 20_000,
  })
  await expect(sourceLines(page)).toContainText(
    name === 'Small.md' ? 'lifecycle' : name.slice(0, -3),
  )
}

const saveAndExpect = async (page: Page, filePath: string, content: string) => {
  await page.keyboard.press('ControlOrMeta+s')
  await expect.poll(() => fs.readFileSync(filePath, 'utf8'), { timeout: 15_000 }).toBe(content)
}

test.describe('Performance resource lifecycle acceptance', () => {
  let server: http.Server | undefined
  let rendererUrl = ''
  let workspace = ''
  let session: ElectronTestSession | undefined
  let diagnostics: RuntimeDiagnostics | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    rendererUrl = renderer.url
  })
  test.afterAll(async () => closeRendererServer(server))

  test.beforeEach(async () => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), fixturePrefix))
    fs.writeFileSync(path.join(workspace, 'Home.md'), '# Home\n\nAnchor document.\n')
    fs.writeFileSync(path.join(workspace, 'Small.md'), initialSmall)
    for (let index = 1; index <= 8; index += 1) {
      fs.writeFileSync(
        path.join(workspace, `Reference-${index}.md`),
        `# Reference-${index}\n\nText.\n`,
      )
    }
    fs.writeFileSync(path.join(workspace, 'Large.md'), initialLarge)
    session = await launchElectronTestSession(rendererUrl, { openTargets: [workspace] })
    diagnostics = monitorRuntime(session)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test.afterEach(async ({}, testInfo) => {
    try {
      if (session && diagnostics) {
        await attachDiagnostics(session, diagnostics, testInfo)
        const screenshotPath = testInfo.outputPath('resource-lifecycle.png')
        await session.page.screenshot({ path: screenshotPath })
        await testInfo.attach('resource-lifecycle.png', {
          path: screenshotPath,
          contentType: 'image/png',
        })
        await testInfo.attach('worker-urls.json', {
          body: JSON.stringify(
            session.page.workers().map((worker) => worker.url()),
            null,
            2,
          ),
          contentType: 'application/json',
        })
        if (testInfo.status === testInfo.expectedStatus) assertNoRuntimeErrors(diagnostics)
      }
    } finally {
      await closeElectronTestSession(session)
      session = undefined
      diagnostics = undefined
      if (
        path.dirname(workspace) === path.resolve(os.tmpdir()) &&
        path.basename(workspace).startsWith(fixturePrefix)
      ) {
        fs.rmSync(workspace, { recursive: true, force: true })
      }
    }
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('preserves source edits through recent switches, model eviction, and close/reopen', async ({}, testInfo) => {
    const page = session!.page
    const filePath = path.join(workspace, 'Small.md')
    const edited = `${initialSmall}recentEdit`
    await openSource(page, 'Small.md')
    await sourceInput(page).focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
    await page.keyboard.insertText('recentEdit')
    await attachSourceState(page, testInfo, 'before-switch')
    await saveAndExpect(page, filePath, edited)
    await page.keyboard.press('ControlOrMeta+f')
    await expect(page.locator('.source-code-editor:visible .find-widget')).toBeVisible()
    await page.keyboard.press('Escape')
    await attachSourceState(page, testInfo, 'after-save')

    await openSource(page, 'Reference-1.md')
    await attachSourceState(page, testInfo, 'after-reference')
    await openSource(page, 'Small.md')
    await sourceInput(page).focus()
    await attachSourceState(page, testInfo, 'after-switch')
    // Undo crosses the tab switch, proving the retained model keeps history.
    await page.keyboard.press('ControlOrMeta+z')
    await attachSourceState(page, testInfo, 'after-undo')
    await saveAndExpect(page, filePath, initialSmall)
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await saveAndExpect(page, filePath, edited)
    // Focus the restored input without clicking a new cursor position.
    await page.keyboard.insertText(' at retained caret')
    await saveAndExpect(page, filePath, `${edited} at retained caret`)

    // More than six distinct source models exceed the inactive-model budget.
    for (let index = 1; index <= 8; index += 1) {
      await openSource(page, `Reference-${index}.md`)
    }
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const monaco = (window as Window & { monaco?: typeof Monaco }).monaco!
            return monaco.editor.getModels().map((model) => model.uri.toString())
          }),
        { timeout: 5_000 },
      )
      .not.toEqual(expect.arrayContaining([expect.stringContaining('Small.md')]))
    const liveModels = await page.evaluate(() =>
      (window as Window & { monaco?: typeof Monaco })
        .monaco!.editor.getModels()
        .map((model) => model.uri.toString()),
    )
    expect(liveModels.some((uri) => uri.includes('Reference-8.md'))).toBe(true)
    await openSource(page, 'Small.md')
    await expect(sourceLines(page)).toContainText('recentEdit at retained caret')
    await sourceInput(page).focus()
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowDown' : 'Control+End')
    await page.keyboard.insertText(' after eviction')
    const afterEviction = `${edited} at retained caret after eviction`
    await saveAndExpect(page, filePath, afterEviction)

    const selectedTab = page.getByRole('tab', { selected: true })
    await expect(selectedTab).toContainText('Small')
    // Rich and source views may be separate tabs; close every view of the file
    // so reopening must reload a closed buffer instead of sharing an open one.
    const remainingViews = page.getByRole('tab').filter({ hasText: /^Small(?:\.md)?(?: · .*)?$/ })
    await selectedTab.focus()
    await page.keyboard.press('Home')
    await expect(page.getByRole('tab', { selected: true })).toContainText('Home')
    await expect(remainingViews).toHaveCount(2)
    for (let view = 0; view < 2; view += 1) {
      const tab = remainingViews.first()
      await tab.click()
      await tab.getByRole('button', { name: /Close tab|关闭标签/i }).click()
      await page.getByRole('tab', { selected: true }).focus()
      await page.keyboard.press('Home')
      await expect(page.getByRole('tab', { selected: true })).toContainText('Home')
    }
    await expect(remainingViews).toHaveCount(0)
    await attachSourceState(page, testInfo, 'after-close-all-views')
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            (window as Window & { monaco?: typeof Monaco })
              .monaco!.editor.getModels()
              .some((model) => model.uri.toString().includes('Small.md')),
          ),
        { timeout: 5_000 },
      )
      .toBe(false)
    const externalContent = '# Small\n\nExternal lifecycle update after close.\n'
    fs.writeFileSync(filePath, externalContent)
    await openSource(page, 'Small.md')
    await expect(sourceLines(page)).toContainText('External lifecycle update after close.')
    await expect(sourceLines(page)).not.toContainText('recentEdit')
    expect(fs.readFileSync(filePath, 'utf8')).toBe(externalContent)
  })

  test('loads first-use Monaco language workers and their registered language services', async () => {
    const page = session!.page
    await openSource(page, 'Small.md')
    await assertMonacoLanguageWorkers(page)
    expect(fs.readFileSync(path.join(workspace, 'Small.md'), 'utf8')).toBe(initialSmall)
  })

  // eslint-disable-next-line no-empty-pattern -- Playwright requires fixture destructuring.
  test('retires the ordinary large-Markdown worker after idle and recreates it for the next save', async ({}, testInfo) => {
    test.setTimeout(150_000)
    const page = session!.page
    const filePath = path.join(workspace, 'Large.md')
    expect(initialLarge.length).toBeGreaterThan(128_000)
    await openInteractionFile(page, 'Large.md')
    const editor = page.getByTestId('markdown-editor')
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
    await expect(editor.locator('p').last()).toHaveText('Tail marker')
    // Let parse-stream workers expire first, so the worker created by editing is
    // the ordinary serializer rather than an idle member of the stream pool.
    await expect.poll(() => markdownWorkers(page).length, { timeout: 45_000 }).toBe(0)
    const createdUrls: string[] = []
    page.on('worker', (worker) => createdUrls.push(worker.url()))
    await editor.locator('p').last().click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(' first save')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => markdownWorkers(page).length, { timeout: 15_000 }).toBeGreaterThan(0)
    await expect
      .poll(() => fs.readFileSync(filePath, 'utf8'), { timeout: 15_000 })
      .toContain('Tail marker first save')
    const firstSave = fs.readFileSync(filePath, 'utf8')
    await expect.poll(() => markdownWorkers(page).length, { timeout: 45_000 }).toBe(0)

    await editor.locator('p').last().click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(' second save')
    await page.keyboard.press('ControlOrMeta+s')
    await expect.poll(() => markdownWorkers(page).length, { timeout: 15_000 }).toBeGreaterThan(0)
    await expect
      .poll(() => fs.readFileSync(filePath, 'utf8'), { timeout: 15_000 })
      .toBe(firstSave.replace('Tail marker first save', 'Tail marker first save second save'))
    expect(
      createdUrls.filter((url) => /\/plateMarkdownWorker[-.]/.test(url)).length,
    ).toBeGreaterThanOrEqual(2)
    await testInfo.attach('created-worker-urls.json', {
      body: JSON.stringify(createdUrls, null, 2),
      contentType: 'application/json',
    })
  })
})
