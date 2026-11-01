import type { FsGraph } from '@/services/fsGraphSchemas'
/* eslint-disable no-restricted-imports -- Browser acceptance reuses the renderer fixture. */
import { test, expect } from './rendererTest.js'
/* eslint-enable no-restricted-imports */

test.use({
  documents: { 'Alpha.md': '# Alpha\n\n[Website guide](https://example.com/guide)\n' },
  initialFile: 'Alpha.md',
})

const websitesGraph = (): FsGraph => ({
  mode: 'relations',
  revision: 'websites-1',
  topology_key: 'websites-1',
  truncated: false,
  total_nodes: 3,
  total_edges: 2,
  nodes: [
    {
      id: 'file:Alpha.md',
      kind: 'file',
      label: 'Alpha',
      path: 'Alpha.md',
      group: { key: '.', label: '.', source: 'path' },
    },
    {
      id: 'external:https://example.com/guide',
      kind: 'external',
      label: 'Website guide',
      url: 'https://example.com/guide',
    },
    {
      id: 'external:http://example.org/',
      kind: 'external',
      label: 'HTTP reference',
      url: 'http://example.org/',
    },
  ],
  edges: ['https://example.com/guide', 'http://example.org/'].map((url) => ({
    id: `alpha-${url}`,
    source: 'file:Alpha.md',
    target: `external:${url}`,
    kind: 'links_to',
    count: 1,
  })),
})

test('website selection stays local and explicit opening uses existing web and external flows', async ({
  session: { page, backend },
}) => {
  backend.setGraph(websitesGraph())
  // Observe the existing test-only native boundary. No browser loads external
  // pages: activate is acknowledged here and HTTP window opening is recorded.
  await page.evaluate(() => {
    type Request = { command: string; args?: Record<string, unknown> }
    const host = window as unknown as {
      __TAURI_INTERNALS__: {
        invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>
      }
      graphWebsiteRequests: Request[]
      graphExternalOpens: string[]
    }
    host.graphWebsiteRequests = []
    host.graphExternalOpens = []
    const invoke = host.__TAURI_INTERNALS__.invoke
    host.__TAURI_INTERNALS__.invoke = (command, args) => {
      host.graphWebsiteRequests.push({ command, args })
      if (command === 'web_tabs_activate' || command === 'web_tabs_set_bounds')
        return Promise.resolve({ ok: true })
      return invoke(command, args)
    }
    window.open = (url) => {
      host.graphExternalOpens.push(String(url))
      return null
    }
  })
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const graph = page.getByTestId('knowledge-graph')
  await expect(graph).toHaveAttribute('data-graph-renderer', 'sigma')
  await expect(graph).toHaveAttribute('data-graph-node-count', '3')
  await page.evaluate(() => {
    ;(window as unknown as { graphWebsiteRequests: unknown[] }).graphWebsiteRequests = []
  })
  const search = graph.getByRole('textbox', { name: 'Search documents' })
  await search.fill('example.org')
  await graph
    .getByRole('button', { name: 'HTTP reference http://example.org/', exact: true })
    .click()
  const details = page.getByRole('complementary', { name: 'Document preview', exact: true })
  await expect(details).toContainText('HTTP reference')
  await expect(details).toContainText('http://example.org/')
  const readRequests = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            graphWebsiteRequests: {
              command: string
              args?: { request?: { url?: string; path?: string } }
            }[]
          }
        ).graphWebsiteRequests,
    )
  expect(
    (await readRequests()).filter(
      ({ command }) =>
        command === 'web_tabs_activate' ||
        command.startsWith('link_preview_') ||
        [
          'fs_open_file',
          'fs_read_file',
          'fs_open_buffer_snapshot',
          'fs_get_workspace_graph_node_details',
        ].includes(command),
    ),
  ).toEqual([])
  expect(
    await page.evaluate(
      () => (window as unknown as { graphExternalOpens: string[] }).graphExternalOpens,
    ),
  ).toEqual([])
  await details.getByRole('button', { name: 'Open website', exact: true }).click()
  expect(
    await page.evaluate(
      () => (window as unknown as { graphExternalOpens: string[] }).graphExternalOpens,
    ),
  ).toEqual(['http://example.org/'])
  await search.fill('example.com/guide')
  const website = graph.getByRole('button', {
    name: 'Website guide https://example.com/guide',
    exact: true,
  })
  await website.click()
  await expect(details).toContainText('Website guide')
  await expect(details).toContainText('https://example.com/guide')
  await website.press('Enter')
  await expect(page.getByTestId('web-tab-native-host')).toBeVisible()
  await expect
    .poll(async () =>
      (await readRequests())
        .filter(({ command }) => command === 'web_tabs_activate')
        .map(({ args }) => args?.request?.url),
    )
    .toContain('https://example.com/guide')
  expect(
    (await readRequests()).filter(
      ({ command, args }) =>
        command.startsWith('fs_') && /^https?:/.test(args?.request?.path ?? ''),
    ),
  ).toEqual([])
})
