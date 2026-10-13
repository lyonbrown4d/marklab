import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import type http from 'node:http'
import os from 'node:os'
import path from 'node:path'
// eslint-disable-next-line no-restricted-imports -- Test harness is excluded from production bundles.
import {
  closeElectronTestSession,
  closeRendererServer,
  launchElectronTestSession,
  startRendererServer,
  type ElectronTestSession,
} from './electronTestHarness.js'

const openFile = async (page: Page, name: string) => {
  await page
    .getByRole('banner')
    .getByRole('button', { name: /Search files|搜索文件/i })
    .click()
  const picker = page.getByRole('dialog')
  await picker.getByRole('combobox').fill(name)
  const file = picker.locator(`[data-open-new-window-path="${name}"]`).first()
  await expect(file).toBeVisible({ timeout: 30_000 })
  await file.click()
  await expect(picker).toHaveCount(0)
  await expect(page).toHaveURL(new RegExp(`/files/edit/${name.replace('.', '\\.')}(?:\\?.*)?$`))
  const richView = page.getByRole('radio', { name: /^(WYSIWYG|所见即所得)$/i })
  if ((await richView.getAttribute('aria-checked')) !== 'true') await richView.click()
  await expect(page.getByTestId('markdown-editor')).toHaveAttribute('data-state', 'ready')
  await expect(page.getByTestId('markdown-editor')).toContainText(
    name === 'First.md'
      ? 'first second'
      : name === 'Second.md'
        ? 'another document'
        : 'const value = 1',
  )
}
const toggle = async (page: Page, id: string, enabled: boolean) => {
  await page.getByTestId('vim-status-control').click()
  const control = page.getByTestId(id)
  if ((await control.getAttribute('aria-checked')) !== String(enabled)) await control.click()
  await expect(control).toHaveAttribute('aria-checked', String(enabled))
  await page.getByTestId('vim-status-control').click()
  await expect(control).toHaveCount(0)
}
const focusSource = async (page: Page) => {
  const source = page.locator('.source-code-editor:visible')
  await expect(source.locator('.monaco-editor')).toBeVisible({ timeout: 20_000 })
  await source.locator('.view-lines').click()
  return source
}
const ex = async (page: Page, command: string) => {
  await page.keyboard.type(':')
  const input = page.getByRole('textbox', { name: /Vim.*(command|命令)/i })
  await expect(input).toBeFocused()
  if (
    !(await page
      .getByRole('dialog')
      .isVisible()
      .catch(() => false))
  ) {
    await expect(page.locator('#app-status-bar input')).toBeFocused()
  }
  await page.keyboard.type(command)
  await page.keyboard.press('Enter')
}

test.describe('Vim source editors', () => {
  let server: http.Server | undefined
  let url = ''
  let session: ElectronTestSession | undefined
  let workspace = ''
  test.beforeAll(async () => {
    const renderer = await startRendererServer()
    server = renderer.server
    url = renderer.url
  })
  test.afterAll(async () => closeRendererServer(server))
  test.beforeEach(async () => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'marklab-vim-e2e-'))
    fs.writeFileSync(path.join(workspace, 'First.md'), 'first second\nthird fourth\nfifth sixth\n')
    fs.writeFileSync(path.join(workspace, 'Second.md'), 'another document\n')
    fs.writeFileSync(
      path.join(workspace, 'Code.md'),
      '# Code\n\n```typescript\nconst value = 1\n```\n\n```mermaid\nflowchart LR\n  A-->B\n```\n',
    )
    session = await launchElectronTestSession(url, { openTargets: [workspace] })
  })
  test.afterEach(async () => {
    if (test.info().status !== test.info().expectedStatus && session) {
      const state = await session.page
        .evaluate(() => ({
          url: location.href,
          focus: document.activeElement?.outerHTML,
          text: document.body.innerText,
        }))
        .catch(() => null)
      await test.info().attach('vim-state.json', {
        body: JSON.stringify({ state, output: session.output }, null, 2),
        contentType: 'application/json',
      })
    }
    await closeElectronTestSession(session)
    session = undefined
    if (
      path.dirname(workspace) === path.resolve(os.tmpdir()) &&
      path.basename(workspace).startsWith('marklab-vim-e2e-')
    )
      fs.rmSync(workspace, { recursive: true, force: true })
  })

  test('Monaco implements motions, operators, undo, insert, visual, search, save and quit', async () => {
    const page = session!.page
    await openFile(page, 'First.md')
    await page.keyboard.press('ControlOrMeta+/')
    const initialSource = await focusSource(page)
    await expect(initialSource.locator('.view-lines')).toContainText('first second')
    await toggle(page, 'vim-tab-toggle', true)
    const source = await focusSource(page)
    await expect(source).toHaveAttribute('data-vim-active', 'true')
    await expect(source).toHaveAttribute('data-vim-mode', 'NORMAL')
    await expect(page.getByTestId('vim-status-control')).toContainText('NORMAL')
    await page.keyboard.type('ggdw')
    await ex(page, 'w')
    await expect
      .poll(() => fs.readFileSync(path.join(workspace, 'First.md'), 'utf8'))
      .toBe('second\nthird fourth\nfifth sixth\n')
    await page.keyboard.type('u')
    await ex(page, 'w')
    await expect
      .poll(() => fs.readFileSync(path.join(workspace, 'First.md'), 'utf8'))
      .toBe('first second\nthird fourth\nfifth sixth\n')
    await page.keyboard.type('ggI')
    await expect(source).toHaveAttribute('data-vim-mode', 'INSERT')
    await expect(page.getByTestId('vim-status-control')).toContainText('INSERT')
    await page.keyboard.type('prefix ')
    await page.keyboard.press('Escape')
    await page.keyboard.type('ggv')
    await expect(source).toHaveAttribute('data-vim-mode', 'VISUAL')
    await page.keyboard.press('Escape')
    await page.keyboard.type('/fourth')
    await page.keyboard.press('Enter')
    await page.keyboard.type('n')
    await page.keyboard.press('Control+b')
    await ex(page, 'wq')
    await expect(source).not.toBeVisible()
    await expect
      .poll(() => fs.readFileSync(path.join(workspace, 'First.md'), 'utf8'))
      .toBe('prefix first second\nthird fourth\nfifth sixth\n')
  })

  test('global defaults and independent Tab overrides coexist and toggling preserves text', async () => {
    const page = session!.page
    await openFile(page, 'First.md')
    await toggle(page, 'vim-global-toggle', true)
    await page.keyboard.press('ControlOrMeta+/')
    const first = await focusSource(page)
    await expect(first).toHaveAttribute('data-vim-active', 'true')
    await toggle(page, 'vim-tab-toggle', false)
    await expect(first).not.toHaveAttribute('data-vim-active')
    await first.locator('.view-lines').click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('retained')
    await openFile(page, 'Second.md')
    await page.keyboard.press('ControlOrMeta+/')
    const second = await focusSource(page)
    await expect(second).toHaveAttribute('data-vim-active', 'true')
    await openFile(page, 'First.md')
    await page.keyboard.press('ControlOrMeta+/')
    const restored = await focusSource(page)
    await expect(restored).not.toHaveAttribute('data-vim-active')
    await expect(restored.locator('.view-lines')).toContainText('retained')
    await page.getByTestId('vim-status-control').click()
    await page.getByTestId('vim-follow-global').click()
    await page.keyboard.press('Escape')
    await restored.locator('.view-lines').click()
    await expect(restored).toHaveAttribute('data-vim-active', 'true')
    await ex(page, 'w')
    await expect
      .poll(() => fs.readFileSync(path.join(workspace, 'First.md'), 'utf8'))
      .toContain('retained')
  })

  test('Mermaid uses CodeMirror Vim and code-block Escape returns to Normal without closing', async () => {
    const page = session!.page
    await openFile(page, 'Code.md')
    await toggle(page, 'vim-global-toggle', true)
    const preview = page.locator('[data-plate-preview="mermaid"]')
    await expect(preview.locator('[data-plate-mermaid-output] > svg')).toBeVisible({
      timeout: 20_000,
    })
    await preview.click()
    const mermaid = page.locator('[data-mermaid-code-editor]')
    await expect(mermaid).toHaveAttribute('data-vim-active', 'true')
    await page.keyboard.type('ggi')
    await expect(mermaid).toHaveAttribute('data-vim-mode', 'INSERT')
    await page.keyboard.press('Escape')
    await expect(mermaid).toHaveAttribute('data-vim-mode', 'NORMAL')
    await expect(mermaid.locator('.cm-content')).toBeFocused()
    await ex(page, 'q')
    await expect(mermaid).not.toBeVisible()
    const code = page
      .locator('pre')
      .filter({ has: page.locator('code[data-language="typescript"]') })
      .first()
    await code.click()
    await page.getByRole('button', { name: /expanded editor|扩展编辑器/i }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('[data-vim-active]')).toBeVisible()
    await dialog.locator('.view-lines').click()
    await page.keyboard.type('i')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('[data-vim-active]')).toHaveAttribute('data-vim-mode', 'NORMAL')
    await page.keyboard.type('I// ')
    await page.keyboard.press('Escape')
    await ex(page, 'q')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('E37')
    await ex(page, 'w')
    await expect(dialog).toBeVisible()
    await ex(page, 'wq')
    await expect(dialog).not.toBeVisible()
    await expect
      .poll(() => fs.readFileSync(path.join(workspace, 'Code.md'), 'utf8'))
      .toContain('// const value = 1')
  })
})
