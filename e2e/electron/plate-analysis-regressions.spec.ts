import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron test lifecycle stays outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Reuse the isolated workspace fixture.
import {
  createPlateBlockDragFixture,
  removePlateBlockDragFixture,
  type PlateBlockDragFixture,
} from './plateBlockDragFixture.js'

const yaml = [
  '# keep this comment',
  'title: Demo # keep title comment',
  'published: false',
  'date: 2026-10-11',
  'tags: [plate, editor]',
  'nested:',
  '  owner: Marklab',
  'shared: &shared exact',
  'copy: *shared',
].join('\n')

test.describe('Plate analysis features in Electron', () => {
  let fixture: PlateBlockDragFixture | undefined
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined

  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.beforeEach(async () => {
    fixture = createPlateBlockDragFixture()
    fs.writeFileSync(
      fixture.documentPath,
      `---\n${yaml}\n---\n\n# Root\n\n## Child\n\nDraft:`,
      'utf8',
    )
    fs.writeFileSync(path.join(fixture.root, 'Target.md'), '# Target\n\n## Destination\n', 'utf8')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    await revealElectronWindow(session.app, session.page, { height: 850, width: 1200 })
    await expect(session.page.getByTestId('markdown-editor')).toHaveAttribute(
      'data-state',
      'ready',
      {
        timeout: 30_000,
      },
    )
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    removePlateBlockDragFixture(fixture)
    fixture = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('edits frontmatter and persists unsupported YAML unchanged', async () => {
    if (!session || !fixture) throw new Error('Electron test session is unavailable')
    const { page } = session
    await page.getByRole('textbox', { name: 'title frontmatter value' }).fill('Updated: title')
    await page.getByRole('switch', { name: 'published frontmatter value' }).click()
    await page.getByRole('textbox', { name: 'tags frontmatter value' }).fill('one\ntwo')
    await page.getByTestId('markdown-editor').locator('p').last().click()
    await expect
      .poll(() => fs.readFileSync(fixture!.documentPath, 'utf8'))
      .toContain('published: true')
    const content = fs.readFileSync(fixture.documentPath, 'utf8')
    expect(content).toContain('title: "Updated: title" # keep title comment')
    expect(content).toContain('tags: [ one, two ]')
    expect(content).toContain('nested:\n  owner: Marklab\nshared: &shared exact\ncopy: *shared')
    await page.getByRole('radio', { name: 'Frontmatter source' }).click()
    await expect(page.getByLabel('Frontmatter YAML source')).toContainText('copy: *shared')
    await expect(page.getByRole('listbox')).toHaveCount(0)
  })

  test('completes workspace links without right-click acceptance', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    const draft = page.getByTestId('markdown-editor').locator('p').last()
    await draft.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(' [[Tar')
    const suggestions = page.getByRole('listbox', { name: 'Workspace link suggestions' })
    await expect(suggestions).toBeVisible()
    await suggestions
      .getByRole('option', { name: /Target/ })
      .first()
      .click({ button: 'right' })
    await expect(draft).toHaveText('Draft: [[Tar')
    if (!(await page.getByRole('menu').isVisible())) await draft.click({ button: 'right' })
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(suggestions).toHaveCount(0)
    await page.keyboard.press('Escape')
    await draft.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText('g')
    await expect(suggestions).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(draft).toContainText('[[Target]]')
  })

  test('follows the caret in the outline and keeps collapsed children searchable', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    await page.getByRole('heading', { name: 'Root', exact: true }).click()
    await page.getByRole('button', { name: /^(Document outline|文档大纲)$/ }).click()
    const root = page.getByRole('button', { name: 'H1 Root', exact: true })
    const child = page.getByRole('button', { name: 'H2 Child', exact: true })
    await expect(root).toHaveAttribute('aria-current', 'location')
    await page.getByRole('button', { name: /^(Collapse|折叠) Root$/ }).click()
    await expect(child).toHaveCount(0)
    const search = page.getByRole('searchbox', { name: /筛选标题或 slug|Filter headings or slugs/ })
    await search.fill('Child')
    await expect(child).toBeVisible()
    await child.click()
    await expect(page.getByRole('heading', { name: 'Child', exact: true })).toBeInViewport()
    if (!(await search.isVisible())) {
      await page.getByRole('button', { name: /^(Document outline|文档大纲)$/ }).click()
    }
    await expect(child).toHaveAttribute('aria-current', 'location')
    await search.fill('')
    await expect(child).toBeVisible()
  })
})
