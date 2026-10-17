import { expect, test } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
/* eslint-disable no-restricted-imports -- Production renderer regression uses explicit test-host fixtures. */
import {
  assertRendererHealthy,
  attachRendererDiagnostics,
  launchRendererSession,
  type RendererSession,
} from './rendererHarness.js'
import { publishFixtureEvent } from './nativeFixture.js'
/* eslint-enable no-restricted-imports */

test('isolates source models and previews after the workspace seed changes', async ({
  browser,
  baseURL,
}, info) => {
  if (!baseURL) throw new Error('Production renderer baseURL is required')
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-renderer-workspaces-'))
  let session: RendererSession | undefined
  try {
    const roots = await Promise.all(
      ['alpha', 'beta'].map(async (name) => {
        const root = path.join(fixture, name)
        await fs.mkdir(root)
        await fs.writeFile(path.join(root, 'README.md'), `# Workspace ${name}\n`)
        await fs.writeFile(
          path.join(root, 'shared.ts'),
          `export const workspaceIdentity = '${name}-only'\n`,
        )
        return root
      }),
    )
    session = await launchRendererSession(browser, baseURL, roots[0], 'README.md', roots)
    const { page, backend } = session
    for (const [index, name] of ['alpha', 'beta'].entries()) {
      if (index > 0)
        await publishFixtureEvent(
          page,
          'workspace-session-seed',
          await backend.bind(roots[index], 'README.md'),
        )
      await expect(
        page.getByRole('button', { name: new RegExp(`^Workspace:.*${name}`, 'i') }),
      ).toBeVisible()
      const explorer = page.getByRole('region', { name: /^(Files|文件)$/i })
      if (!(await explorer.isVisible())) await page.keyboard.press('ControlOrMeta+Shift+L')
      await explorer.getByRole('button', { name: 'shared.ts', exact: true }).click()
      const modes = page.getByRole('radiogroup', { name: /Editing Mode|编辑模式/i })
      const preview = page.getByRole('article', {
        name: /shared\.ts.*(?:source preview|源码预览)/i,
      })
      await expect(preview).toContainText(`${name}-only`)
      await expect(preview).not.toContainText(`${name === 'alpha' ? 'beta' : 'alpha'}-only`)
      await modes.getByRole('radio', { name: /^(Source|Source Editor|源码)$/i }).click()
      await expect(page.locator('.monaco-editor .view-lines')).toContainText(`${name}-only`)
      await expect(page.locator('.monaco-editor .view-lines')).not.toContainText(
        `${name === 'alpha' ? 'beta' : 'alpha'}-only`,
      )
      await modes.getByRole('radio', { name: /^(Rich Text Editor|WYSIWYG|所见即所得)$/i }).click()
      await expect(preview).toContainText(`${name}-only`)
    }
    assertRendererHealthy(session)
  } finally {
    try {
      if (session) await attachRendererDiagnostics(session, info)
    } finally {
      await session?.context.close()
      await fs.rm(fixture, { recursive: true, force: true })
    }
  }
})
