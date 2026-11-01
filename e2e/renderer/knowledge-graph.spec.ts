import type { FsGraph } from '@/services/fsGraphSchemas'
/* eslint-disable no-restricted-imports -- Renderer browser fixtures are test-only sibling modules. */
import { test, expect } from './rendererTest.js'
/* eslint-enable no-restricted-imports */

test.use({
  documents: {
    'Alpha.md': '# Alpha\n\nStart document. [Beta](Beta.md) and [missing](Missing.md).\n',
    'Beta.md': '# Beta\n\nBeta preview content. [Gamma](Gamma.md).\n',
    'Gamma.md': '# Gamma\n\nGamma document content.\n',
  },
  initialFile: 'Alpha.md',
})

const graphFixture = (): FsGraph => ({
  mode: 'relations',
  revision: 'fixture-relations-1',
  topology_key: 'fixture-topology-1',
  truncated: false,
  total_nodes: 4,
  total_edges: 3,
  nodes: [
    ...['Alpha', 'Beta', 'Gamma'].map((label) => ({
      id: `file:${label}.md`,
      kind: 'file' as const,
      label,
      path: `${label}.md`,
      group: { key: '.', label: '.', source: 'path' as const },
    })),
    {
      id: 'missing:Missing.md',
      kind: 'missing',
      label: 'Missing',
      path: 'Missing.md',
      preview_kind: 'source',
      source_path: 'Alpha.md',
      target: 'Missing.md',
    },
  ],
  edges: [
    {
      id: 'alpha-beta',
      source: 'file:Alpha.md',
      target: 'file:Beta.md',
      kind: 'links_to',
      count: 2,
    },
    {
      id: 'beta-gamma',
      source: 'file:Beta.md',
      target: 'file:Gamma.md',
      kind: 'links_to',
      count: 1,
    },
    {
      id: 'alpha-missing',
      source: 'file:Alpha.md',
      target: 'missing:Missing.md',
      kind: 'links_to',
      count: 1,
    },
  ],
})

test('renders real Sigma WebGL2 and separates graph selection from opening documents', async ({
  session,
}, info) => {
  const { page, backend } = session
  await page.emulateMedia({ reducedMotion: 'reduce' })
  backend.setGraph(graphFixture())
  backend.setGraphDetails({
    revision: 'fixture-relations-1',
    truncated: false,
    items: [
      {
        id: 'file:Beta.md',
        content: '# Beta\n\nBeta preview content.',
        preview: { html: '<h1>Beta</h1><p>Beta preview content.</p>', math: [] },
      },
    ],
  })
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  const canvas = page.getByTestId('knowledge-graph')
  await expect(canvas).toBeVisible()
  await expect(canvas).toHaveAttribute('data-graph-renderer', 'sigma')
  await expect(canvas).toHaveAttribute('data-graph-node-count', '4')
  await expect(canvas).toHaveAttribute('data-graph-edge-count', '3')
  expect(await canvas.locator('canvas').count()).toBeGreaterThan(0)
  await expect(page.getByText('Graph unavailable. Browse documents in the list.')).toBeHidden()
  await canvas.getByRole('button', { name: 'Rearrange graph', exact: true }).click()
  const search = canvas.getByRole('textbox', { name: 'Search documents' })
  await search.fill('Beta')
  await canvas.getByRole('button', { name: 'Beta Beta.md', exact: true }).click()
  const details = page.getByRole('complementary', { name: 'Document preview', exact: true })
  await expect(details).toContainText('Beta preview content.')
  await expect(details.getByRole('heading', { name: 'Beta', exact: true, level: 1 })).toBeVisible()
  await expect(page.getByTestId('markdown-editor')).toBeHidden()
  await search.fill('')
  await canvas.getByRole('button', { name: 'Fit graph', exact: true }).click()
  await expect(details.getByRole('button', { name: 'Open document', exact: true })).toBeVisible()
  await page.evaluate(() => new Promise(requestAnimationFrame))
  await info.attach('knowledge-graph-sigma.png', {
    body: await page.screenshot(),
    contentType: 'image/png',
  })
  await details.getByRole('button', { name: 'Open document', exact: true }).click()
  await expect(page.getByTestId('markdown-editor')).toBeVisible()
  await expect(page.getByTestId('markdown-editor')).toContainText('Beta preview content.')
  await page.getByRole('radio', { name: 'Graph', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-graph-renderer', 'sigma')
  await expect(details).toContainText('Beta preview content.')
  await search.fill('')
  await canvas.getByRole('button', { name: 'Document list', exact: true }).click()
  const first = canvas.getByRole('button', { name: 'Alpha Alpha.md', exact: true })
  await first.focus()
  await page.keyboard.press('ArrowDown')
  await expect(canvas.getByRole('button', { name: 'Beta Beta.md', exact: true })).toBeFocused()
  await page.keyboard.press('End')
  const missing = canvas.getByRole('button', { name: 'Missing Missing.md', exact: true })
  await expect(missing).toBeFocused()
  await expect(details).toContainText('Missing target')
  await expect(details.getByRole('button', { name: 'Open document', exact: true })).toHaveCount(0)
  await page.keyboard.press('Enter')
  await expect(canvas).toBeVisible()
  await expect(page.getByTestId('markdown-editor')).toBeHidden()
})
