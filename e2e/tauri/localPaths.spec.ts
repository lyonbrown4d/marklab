/// <reference types="mocha" />
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import { browser } from '@wdio/globals'
/* eslint-disable no-restricted-imports -- Real-corpus native regression only. */
import { fixturePaths } from './fixturePaths.js'
import { switchToWorkspace } from './nativeHarness.js'
import type { RealWorkspace } from '../performance/realWorkspaceFixture.js'
import { pathToFileViewRoute } from '../../src/logic/routing.js'
/* eslint-enable no-restricted-imports */

describe('real workspace local paths', () => {
  it('resolves existing local Markdown targets and opens Chinese workbooks before their tree branches load', async () => {
    const fixture = fixturePaths()
    assert.ok(fixture.performance)
    const source = JSON.parse(
      await fs.readFile(path.join(fixture.root, 'performance.json'), 'utf8'),
    ) as RealWorkspace
    const links: Array<{ documentPath: string; target: string }> = []
    for (const file of source.files.filter((file) => /\.md$/i.test(file.path))) {
      const tree = unified()
        .use(remarkParse)
        .parse(await fs.readFile(path.join(fixture.performance, file.path), 'utf8'))
      visit(tree, (node) => {
        if (
          (node.type === 'link' || node.type === 'image') &&
          !/^(?:[a-z][\w+.-]*:|\/\/|#)/i.test(node.url)
        )
          links.push({ documentPath: file.path, target: node.url })
      })
    }
    await switchToWorkspace(fixture.performance)
    await browser.setTimeout({ script: 120_000 })
    // The SDK cannot rediscover a root after a native preview child attaches.
    // Keep this real-IPC journey in one invocation, as existing child-view tests do.
    const results = await browser.execute(
      async ({ links, workbooks, files }) => {
        const runtime = window.marklabTauri
        if (!runtime) throw new Error('The real desktop runtime is unavailable')
        const failures = []
        const exists = await runtime.commands.invoke('workspace_tree_paths_exist', {
          kind: 'file',
          paths: files,
        })
        for (const file of files)
          if (!exists.existing.includes(file))
            failures.push({ path: file, error: 'metadata lookup rejected an existing file' })
        for (const link of links) {
          try {
            const result = await runtime.commands.invoke('fs_resolve_markdown_asset', link)
            if (!result.exists)
              failures.push({
                path: link.documentPath,
                target: link.target,
                error: 'Markdown asset lookup rejected an existing target',
              })
          } catch (error) {
            failures.push({ path: link.documentPath, target: link.target, error: String(error) })
          }
        }
        for (const workbook of workbooks) {
          window.location.hash = workbook.route
          const deadline = Date.now() + 15_000
          while (Date.now() < deadline) {
            const grid = document.querySelector('[role="grid"]')
            if (grid?.getAttribute('aria-label')?.startsWith(workbook.name)) break
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
          const grid = document.querySelector('[role="grid"]')
          if (!grid?.getAttribute('aria-label')?.startsWith(workbook.name))
            failures.push({
              path: workbook.path,
              error:
                document.querySelector('[role="alert"]')?.textContent?.slice(0, 300) ??
                'Workbook preview did not load',
            })
        }
        return { links: links.length, files: files.length, failures }
      },
      {
        links,
        files: source.files.map((file) => file.path),
        workbooks: source.files
          .filter((file) => /\.xlsx$/i.test(file.path))
          .map((file) => ({
            path: file.path,
            name: path.basename(file.path),
            route: pathToFileViewRoute(file.path, 'preview'),
          })),
      },
    )
    await fs.mkdir('test-results/tauri/performance', { recursive: true })
    await fs.writeFile(
      'test-results/tauri/performance/local-paths.json',
      JSON.stringify(results, null, 2),
    )
    assert.deepEqual(results.failures, [])
  }).timeout(180_000)
})
