import { test as base } from '@playwright/test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
/* eslint-disable no-restricted-imports -- Node-run Playwright fixtures are sibling modules. */
import {
  assertRendererHealthy,
  attachRendererDiagnostics,
  launchRendererSession,
  type RendererSession,
} from './rendererHarness.js'
/* eslint-enable no-restricted-imports */

type Options = { documents: Record<string, string | Uint8Array>; initialFile: string }
export const test = base.extend<Options & { session: RendererSession }>({
  documents: [
    {
      'Editor.md':
        '# Editor integrations\n\nSelectable phrase for toolbar placement.\n\nInline $x^2$.[^note]\n\n$$\ny = 2\n$$\n\n' +
        Array.from({ length: 45 }, (_, index) => `Paragraph ${index + 1}.`).join('\n\n') +
        '\n\n[^note]: Footnote body.\n',
      'Second.md': '# Second document\n',
    },
    { option: true },
  ],
  initialFile: ['Editor.md', { option: true }],
  session: async ({ browser, baseURL, documents, initialFile }, provide, info) => {
    if (!baseURL) throw new Error('Renderer baseURL must be configured')
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-renderer-e2e-'))
    let session: RendererSession | undefined
    try {
      for (const [name, content] of Object.entries(documents)) {
        const target = path.resolve(root, name)
        if (
          path.relative(root, target).startsWith('..') ||
          path.isAbsolute(path.relative(root, target))
        )
          throw new Error('Invalid renderer fixture document path')
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, content, 'utf8')
      }
      session = await launchRendererSession(browser, baseURL, root, initialFile)
      await provide(session)
      assertRendererHealthy(session)
    } finally {
      try {
        if (session) await attachRendererDiagnostics(session, info)
      } finally {
        try {
          await session?.context.close()
        } finally {
          await fs.rm(root, { recursive: true, force: true })
        }
      }
    }
  },
})
export { expect } from '@playwright/test'
