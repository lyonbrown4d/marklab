import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Electron E2E helpers stay outside production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  revealElectronWindow,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

const FIXTURE_PREFIX = 'marklab-focus-mode-'

test.describe('Focus mode', () => {
  let server: http.Server | undefined
  let session: ElectronTestSession | undefined
  let workspaceRoot: string | undefined
  let rendererUrl = ''

  test.beforeAll(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), FIXTURE_PREFIX))
    fs.writeFileSync(
      path.join(workspaceRoot, 'Focus.md'),
      '# First\n\nIntro\n\n## Details\n\nOne\n\nTwo\n\n# Next\n\nEnd\n',
      'utf8',
    )
    const renderer = await startRendererServer()
    rendererUrl = renderer.url
    server = renderer.server
  })

  test.afterEach(async () => {
    await closeElectronTestSession(session)
    session = undefined
  })

  test.afterAll(async () => {
    await closeRendererServer(server)
    if (!workspaceRoot) return
    const resolved = path.resolve(workspaceRoot)
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith(FIXTURE_PREFIX)
    ) {
      throw new Error(`Refusing to remove unexpected E2E workspace: ${resolved}`)
    }
    fs.rmSync(resolved, { force: true, recursive: true })
  })

  test('configures and renders an iA Writer-style section spotlight', async (_fixtures, testInfo) => {
    session = await launchElectronTestSession(rendererUrl, { openTargets: [workspaceRoot!] })
    const { page } = session
    await revealElectronWindow(session.app, page)
    const workspaceName = path.basename(workspaceRoot!).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await expect(
      page.getByRole('button', {
        name: new RegExp(`^(Workspace|工作区):.*${workspaceName}`, 'i'),
      }),
    ).toBeVisible({ timeout: 45_000 })
    const editor = page.getByTestId('markdown-editor')
    if (!(await editor.isVisible().catch(() => false))) {
      const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
      if (!(await explorer.isVisible().catch(() => false))) {
        await page.keyboard.press('Control+Shift+L')
      }
      await explorer.getByRole('button', { exact: true, name: 'Focus.md' }).click()
    }
    await expect(editor).toHaveAttribute('data-state', 'ready', { timeout: 15_000 })

    await page.keyboard.press('ControlOrMeta+,')
    const settings = page.getByRole('dialog', { name: /Settings|设置/i })
    await settings.getByRole('tab', { name: /^(Editing|编辑)$/i }).click()
    await settings.getByRole('switch', { name: /Focus Mode|Focus 模式/i }).click()

    await settings.getByRole('combobox', { name: /Focus scope|聚焦范围/i }).click()
    await page.getByRole('option', { name: /Current section|当前章节/i }).click()
    await settings.getByRole('combobox', { name: /Focus intensity|聚焦强度/i }).click()
    await page.getByRole('option', { name: /Strong|强烈/i }).click()
    await settings.getByRole('button', { name: 'Close' }).click()
    await expect(settings).toBeHidden()

    await editor.getByText('One', { exact: true }).click()
    await expect(editor).toHaveClass(/is-focus-scope-section/)
    await expect(editor).toHaveClass(/is-focus-intensity-strong/)
    await expect(editor.locator('[data-focus-primary="true"]')).toContainText('One')
    await expect
      .poll(() =>
        editor
          .locator(":scope > [data-block-drag-wrapper='true']")
          .first()
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).opacity)),
      )
      .toBeLessThan(0.3)

    await testInfo.attach('focus-mode.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
  })
})
