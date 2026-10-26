/* eslint-disable no-restricted-imports -- Browser-only production-renderer regression fixtures. */
import { test, expect } from './rendererTest.js'
import { publishFixtureEvent } from './nativeFixture.js'
import { selectPhrase } from './editorSelection.js'
/* eslint-enable no-restricted-imports */

test.use({ documents: { 'AI.md': 'Original selected words.\n' }, initialFile: 'AI.md' })

const provider = {
  id: 'environment.deepseek',
  label: 'DeepSeek',
  kind: 'deepseek' as const,
  model: 'deepseek-flash',
  locality: 'remote' as const,
  available: true,
  requiresApiKey: true,
  hasApiKey: true,
  apiKeySource: 'environment' as const,
  configurationSource: 'environment' as const,
  maskedApiKey: '••••••••' as const,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
}

test('selection AI opens a dialog, streams a proposal and replaces only after acceptance', async ({
  session,
}, info) => {
  const { page, backend } = session
  backend.aiProviders.push(provider)
  await page.reload()
  const editor = page.getByTestId('markdown-editor')
  await expect(editor).toHaveAttribute('data-state', 'ready')
  await selectPhrase(page, 'Original selected words.')
  await page.getByRole('button', { name: 'AI writing assistant' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI writing assistant' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Original selected words.', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'AI instruction' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Abandon (Esc)' }).hover()
  await expect(page.getByRole('tooltip')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(editor).toBeFocused()
  await selectPhrase(page, 'Original selected words.')
  await page.getByRole('button', { name: 'AI writing assistant' }).click()
  await dialog.getByRole('textbox', { name: 'AI instruction' }).fill('Rewrite clearly')
  await dialog.getByRole('heading', { name: 'AI writing assistant' }).hover()
  await page.screenshot({ path: info.outputPath('ai-selection-dialog.png') })
  await dialog.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => backend.aiRequests.length).toBe(1)
  expect(backend.aiRequests[0]).toMatchObject({ providerId: 'environment.deepseek' })
  expect(backend.aiRequests[0]?.prompt).toContain('Original selected words.')
  await expect(editor).toContainText('Original selected words.')
  await publishFixtureEvent(page, 'ai-generation-event', {
    requestId: 'fixture-ai-1',
    type: 'delta',
    delta: 'Clear replacement.',
  })
  await publishFixtureEvent(page, 'ai-generation-event', {
    requestId: 'fixture-ai-1',
    type: 'finish',
    finishReason: 'stop',
    usage: {},
    warnings: [],
  })
  await dialog.getByRole('button', { name: 'Accept' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(editor).toContainText('Clear replacement.')
  await expect(editor).not.toContainText('Original selected words.')
  await editor.press('ControlOrMeta+z')
  await expect(editor).toContainText('Original selected words.')
})

test('without a usable model the AI entry and its shortcut stay inactive', async ({ session }) => {
  const { page, backend } = session
  const editor = page.getByTestId('markdown-editor')
  await editor.evaluate((element) => {
    element.focus()
    const text = element.querySelector('[data-slate-string]')?.firstChild
    if (!text) throw new Error('Expected selectable editor text')
    const range = document.createRange()
    range.selectNodeContents(text)
    const selection = getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
  await expect(page.getByRole('toolbar', { name: 'Text', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'AI writing assistant' })).not.toBeVisible()
  await editor.press('ControlOrMeta+Shift+j')
  await expect(page.getByRole('dialog', { name: 'AI writing assistant' })).not.toBeVisible()
  await expect(editor).toContainText('Original selected words.')
  expect(backend.aiRequests).toHaveLength(0)
})

test('asking AI shows an answer without an accept action or changing the document', async ({
  session,
}) => {
  const { page, backend } = session
  backend.aiProviders.push(provider)
  await page.reload()
  const editor = page.getByTestId('markdown-editor')
  await expect(editor).toHaveAttribute('data-state', 'ready')
  await selectPhrase(page, 'Original selected words.')
  await page.getByRole('button', { name: 'AI writing assistant' }).click()
  const dialog = page.getByRole('dialog', { name: 'AI writing assistant' })
  await dialog.getByRole('radio', { name: 'Ask AI' }).click()
  await dialog.getByRole('textbox', { name: 'AI instruction' }).fill('What does this mean?')
  await dialog.getByRole('button', { name: 'Generate' }).click()
  await expect.poll(() => backend.aiRequests.length).toBe(1)
  expect(backend.aiRequests[0]?.system).toContain('without rewriting')
  await publishFixtureEvent(page, 'ai-generation-event', {
    requestId: 'fixture-ai-1',
    type: 'delta',
    delta: 'This is an explanation.',
  })
  await publishFixtureEvent(page, 'ai-generation-event', {
    requestId: 'fixture-ai-1',
    type: 'finish',
    finishReason: 'stop',
    usage: {},
    warnings: [],
  })
  await expect(dialog.getByRole('button', { name: 'Accept' })).not.toBeVisible()
  await expect(dialog.getByRole('region', { name: 'AI explanation' })).toHaveText(
    'This is an explanation.',
  )
  await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(editor).toContainText('Original selected words.')
})
