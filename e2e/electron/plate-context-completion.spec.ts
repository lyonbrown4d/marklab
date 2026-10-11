import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
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

const prefix = 'Project notes continue'
const suffix = ' with the release checklist.'
const documentCompletion = (page: ElectronTestSession['page']) =>
  page.locator('[data-completion-kind="document"]')

test.describe('Plate context menu and completion interaction', () => {
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
    fs.writeFileSync(fixture.documentPath, `Draft: ${prefix}${suffix}\n\nDraft: `, 'utf8')
    session = await launchElectronTestSession(rendererUrl, { openTargets: [fixture.root] })
    await revealElectronWindow(session.app, session.page, { height: 720, width: 1100 })
    const editor = session.page.getByTestId('markdown-editor')
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 30_000 })
    await editor.locator('p').last().click()
    await session.page.keyboard.press('End')
    await session.page.keyboard.insertText(` ${prefix}`)
    await expect(documentCompletion(session.page)).toBeVisible()
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
    removePlateBlockDragFixture(fixture)
    fixture = undefined
  })

  test.afterAll(async () => closeRendererServer(server))

  test('right-clicking a suggestion does not accept it', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    const draft = page.getByTestId('markdown-editor').locator('p').last()
    await documentCompletion(page).click({ button: 'right' })
    await expect(draft).toHaveText(`Draft: ${prefix}`)
    if (!(await page.getByRole('menu').isVisible())) await draft.click({ button: 'right' })
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(documentCompletion(page)).toHaveCount(0)
  })

  test('context menu owns keyboard input and completion resumes after dismissal', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    const draft = page.getByTestId('markdown-editor').locator('p').last()
    await page.keyboard.press('Shift+F10')
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(documentCompletion(page)).toHaveCount(0)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
    await expect(draft).toHaveText(`Draft: ${prefix}`)
    await draft.click()
    await page.keyboard.press('End')
    await page.keyboard.insertText(' with')
    await expect(documentCompletion(page)).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(draft).toHaveText(`Draft: ${prefix}${suffix}`)
  })

  test('left-clicking a suggestion still accepts its content', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    await documentCompletion(page).dispatchEvent('mousedown', { button: 0 })
    await expect(page.getByTestId('markdown-editor').locator('p').last()).toHaveText(
      `Draft: ${prefix}${suffix}`,
    )
  })

  test('moving the caret does not reopen automatic suggestions', async () => {
    if (!session) throw new Error('Electron test session is unavailable')
    const { page } = session
    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(600)
    await expect(documentCompletion(page)).toHaveCount(0)
  })
})
