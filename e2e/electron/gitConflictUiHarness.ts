import { expect, type Page } from '@playwright/test'
import path from 'node:path'

export const openConflictSourceControl = async (
  page: Page,
  root: string,
  changeLanguage = true,
) => {
  await expect(page.getByRole('button', { name: /^Workspace:|^工作区:/i })).toContainText(
    path.basename(root),
  )
  if (changeLanguage) {
    await page.keyboard.press('ControlOrMeta+,')
    const settings = page.getByRole('dialog', { name: /Settings|设置/i })
    await expect(settings).toBeVisible()
    await settings.getByRole('tab', { name: /Appearance|外观/ }).click()
    await settings.getByRole('radio', { name: 'English', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(settings).toBeHidden()
  }
  const workspaceMenu = page.getByRole('button', { name: path.basename(root), exact: true })
  if (!(await workspaceMenu.isVisible()))
    await page
      .getByRole('banner')
      .getByRole('button', { name: 'Toggle sidebar', exact: true })
      .click()
  await workspaceMenu.click()
  await page.getByRole('menuitem', { name: 'Source Control', exact: true }).click()
  const panel = page.getByRole('region', { name: 'Source Control', exact: true })
  await expect(panel.getByRole('button', { name: 'History and branches' })).toBeEnabled()
  return panel
}

export const mergeConflictFeature = async (page: Page, root: string) => {
  await page.getByRole('button', { name: 'History and branches' }).click()
  const management = page.getByRole('dialog', { name: 'Manage Git repository', exact: true })
  await management.getByRole('tab', { name: 'Branches', exact: true }).click()
  const feature = management
    .getByRole('listitem')
    .filter({ has: page.getByText('feature', { exact: true }) })
  await feature.getByRole('button', { name: 'Merge', exact: true }).click()
  const confirmation = page.getByRole('dialog', { name: 'Merge', exact: true })
  await expect(confirmation).toContainText('Merge feature into current branch main')
  await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Merge result', exact: true })).toBeVisible({
    timeout: 20_000,
  })
  await expect(management).toBeHidden()
  await openConflictSourceControl(page, root, false)
}

export const openConflictMergeView = async (page: Page) => {
  const panel = page.getByRole('region', { name: 'Source Control', exact: true })
  await panel.getByRole('button', { name: 'Resolve conflict: Shared.md', exact: true }).click()
  const result = page.getByRole('region', { name: 'Merge result', exact: true })
  await expect(result).toBeVisible({ timeout: 20_000 })
  const modified = page.locator('.monaco-diff-editor .editor.modified .monaco-editor')
  const original = page.locator('.monaco-diff-editor .editor.original .monaco-editor')
  await expect(modified).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('markdown-editor')).not.toBeVisible()
  await expect(page.locator('.source-code-editor:visible')).toHaveCount(0)
  const sourceMode = page.getByRole('radio', { name: 'Source', exact: true })
  if (await sourceMode.isVisible()) await expect(sourceMode).not.toBeChecked()
  return { result, modified, original }
}

export const editConflictResult = async (page: Page, content: string) => {
  const modified = page.locator('.monaco-diff-editor .editor.modified .monaco-editor')
  await modified.locator('.view-lines').click({ position: { x: 110, y: 20 } })
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(content)
  await expect(modified.locator('.view-lines')).toContainText(content.trim().split('\n').at(-1)!)
}
