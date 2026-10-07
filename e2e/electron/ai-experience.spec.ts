import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  repoRoot,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers are colocated outside application aliases.
import { startMockOpenAiServer } from './mockOpenAiServer.js'

test.describe('Electron AI experience', () => {
  let page: Page
  let rendererUrl = ''
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined
  let mockAiServer: Awaited<ReturnType<typeof startMockOpenAiServer>> | undefined

  test.beforeAll(async () => {
    const [renderer, mockAi] = await Promise.all([startRendererServer(), startMockOpenAiServer()])
    server = renderer.server
    rendererUrl = renderer.url
    mockAiServer = mockAi
  })

  test.afterAll(async () => {
    await Promise.all([closeRendererServer(server), mockAiServer?.close()])
  })

  test.beforeEach(async () => {
    session = await launchElectronTestSession(rendererUrl)
    page = session.page
    await page.setViewportSize({ width: 1440, height: 1024 })
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test('opens the transient AI companion from the Markdown editor', async () => {
    if (!mockAiServer) throw new Error('Mock AI server was not started')
    await page.keyboard.press('Control+Comma')
    const settingsDialog = page.getByRole('dialog', { name: /Settings|设置/i })
    await expect(settingsDialog).toBeVisible({ timeout: 2_000 })
    await settingsDialog.getByRole('tab', { name: /^AI$/ }).click()
    await settingsDialog.getByRole('button', { name: /Add AI provider|添加 AI 提供方/i }).click()
    const providerDialog = page.getByRole('dialog', {
      name: /Add AI provider|添加 AI 提供方/i,
    })
    await providerDialog.getByRole('combobox', { name: /Provider|提供方/i }).click()
    await page.getByRole('option', { name: 'OpenAI-compatible' }).click()
    await providerDialog.getByRole('textbox', { name: /Display name|显示名称/i }).fill('Local E2E')
    await providerDialog.getByRole('textbox', { name: /^Model$|^模型$/i }).fill('marklab-e2e')
    await providerDialog
      .getByRole('textbox', { name: /Service URL|服务地址/i })
      .fill(mockAiServer.baseUrl)
    await providerDialog.getByRole('button', { name: /Save|保存/i }).click()
    await expect(providerDialog).toBeHidden()
    await expect(settingsDialog.getByText('marklab-e2e', { exact: true })).toBeVisible()
    await settingsDialog
      .getByRole('button', { name: /Make default Local E2E|设为默认 Local E2E/i })
      .click()
    await page.keyboard.press('Escape')

    const aiStatus = page.getByRole('button', { name: /^(AI suggestions|AI 自动提示)$/i })
    await expect(aiStatus).toBeVisible()
    await aiStatus.click()
    const aiCompletionSwitch = page.getByRole('switch', {
      name: /Enable automatic AI suggestions|启用 AI 自动提示/i,
    })
    await expect(page.getByText('Local E2E · marklab-e2e', { exact: true })).toBeVisible()
    await aiCompletionSwitch.click()
    await expect(aiStatus).toHaveAttribute('aria-pressed', 'true')
    await aiCompletionSwitch.click()
    await page.keyboard.press('Escape')

    const editor = page.getByTestId('markdown-editor')
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await page.keyboard.type('Writing should return to the content itself.')
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Control+J')

    const companion = page.getByRole('dialog', {
      name: /AI writing assistant|AI 写作助手/i,
    })
    await expect(companion).toBeVisible({ timeout: 2_000 })
    await expect(companion.getByRole('textbox', { name: /AI instruction|AI 指令/i })).toBeVisible()
    await expect(companion.getByRole('button', { name: /Rewrite|改写/i })).toBeVisible()
    await expect(companion.getByRole('button', { name: /Make concise|更简洁/i })).toBeVisible()
    await expect(companion.getByRole('button', { name: /Explain|解释/i })).toBeVisible()
    await expect(companion.getByText(/Local E2E · marklab-e2e/i)).toBeVisible()
    await expect(companion.getByRole('combobox', { name: /^Model$|^模型$/i })).toBeVisible()
    await expect(
      companion.getByText(
        /Only the selected text is sent to the selected provider|仅将选中的文本发送给当前选择的模型提供商/i,
      ),
    ).toBeVisible()
    const captureDirectory = path.join(repoRoot, '.tmp', 'design-qa')
    fs.mkdirSync(captureDirectory, { recursive: true })
    await page.screenshot({
      animations: 'disabled',
      path: path.join(captureDirectory, 'ai-inline-composer.png'),
    })
    await companion.getByRole('button', { name: /Rewrite|改写/i }).click()
    const proposalDiff = companion.getByLabel(/AI proposal changes|AI 建议修改/i)
    await expect(proposalDiff).toBeVisible({ timeout: 10_000 })
    await expect(proposalDiff.locator('span').filter({ hasText: 'belongs' })).toBeVisible()
    await expect(companion.getByRole('button', { name: /^Accept$|^接受$/i })).toBeVisible()
    await expect(companion.getByRole('button', { name: /^Abandon$|^放弃$/i })).toBeVisible()
    await expect(companion.getByRole('button', { name: /^Try again$|^再试一次$/i })).toBeVisible()

    await page.screenshot({
      animations: 'disabled',
      path: path.join(captureDirectory, 'ai-inline-companion.png'),
    })

    await companion.getByRole('button', { name: /^Accept$|^接受$/i }).click()
    await expect(companion).toBeHidden()
    await expect(editor).toContainText('Writing belongs in the content itself.')
  })
})
