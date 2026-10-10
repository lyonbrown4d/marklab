import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { build } from 'vite'
import { describe, expect, it, vi } from 'vitest'
// eslint-disable-next-line no-restricted-imports -- Worker config helpers live at repository root before app aliases are available.
import { plateMarkdownWorkerPlugins } from '../../vite.worker'
import type {
  PlateMarkdownWorkerRequest,
  PlateMarkdownWorkerResponse,
} from '@/workers/plateMarkdownWorkerProtocol'
import { plateMarkdownWorkerDialectFixtures } from '@/workers/plateMarkdownWorkerDialectFixtures'

const projectRoot = path.resolve(import.meta.dirname, '../..')

const buildWorkerBundle = async () => {
  const result = await build({
    build: {
      rollupOptions: {
        input: path.resolve(projectRoot, 'src/services/plateMarkdownWorkerClient.ts'),
        output: {
          assetFileNames: 'assets/[name][extname]',
          chunkFileNames: 'assets/[name].js',
          entryFileNames: 'entry.js',
        },
      },
      write: false,
    },
    configFile: false,
    logLevel: 'silent',
    mode: 'production',
    resolve: {
      alias: {
        '@': path.resolve(projectRoot, 'src'),
        'decode-named-character-reference': fileURLToPath(
          import.meta.resolve('decode-named-character-reference'),
        ),
      },
      conditions: ['module', 'browser', 'production'],
    },
    root: projectRoot,
    worker: {
      plugins: plateMarkdownWorkerPlugins,
    },
  })

  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) =>
    'output' in item ? item.output : [],
  )
  const worker = outputs.find(
    (output) => output.type === 'asset' && /plateMarkdownWorker-.*\.js$/.test(output.fileName),
  )
  if (!worker || worker.type !== 'asset') throw new Error('Plate Markdown worker was not emitted.')

  return {
    code: String(worker.source),
    files: outputs.map((output) => output.fileName),
  }
}

describe('Plate Markdown worker production bundle', () => {
  it('contains no renderer-only DOM or CSS runtime', async () => {
    const bundle = await buildWorkerBundle()

    expect(bundle.code).not.toMatch(/\bdocument\s*(?:\.|\[)/)
    expect(bundle.code).not.toMatch(/\bwindow\s*(?:\.|\[)/)
    expect(bundle.code).not.toMatch(/\b(?:DOMParser|HTMLElement|NodeFilter)\b/)
    expect(bundle.code).not.toMatch(
      /\b(?:globalThis|self)\s*(?:\.\s*(?:document|window)|\[\s*['"](?:document|window)['"]\s*\])\s*=/,
    )
    expect(bundle.code).not.toMatch(/\bReact(?:DOM)?\b|react-dom/)
    expect(bundle.files).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/(?:\.css$|KaTeX_)/i)]),
    )

    const responses: PlateMarkdownWorkerResponse[] = []
    const workerScope: {
      onmessage: ((event: { data: PlateMarkdownWorkerRequest }) => void) | null
      postMessage: (response: PlateMarkdownWorkerResponse) => void
    } = { onmessage: null, postMessage: vi.fn((response) => responses.push(response)) }
    const loadWorker = () =>
      runInNewContext(bundle.code, {
        TextDecoder,
        TextEncoder,
        URL,
        console,
        self: workerScope,
        structuredClone,
      })
    expect(loadWorker).not.toThrow()
    expect(workerScope.onmessage).toEqual(expect.any(Function))

    const onmessage = workerScope.onmessage
    if (!onmessage) throw new Error('Plate Markdown worker did not install its message handler.')

    for (const [index, fixture] of plateMarkdownWorkerDialectFixtures.entries()) {
      const parseId = index * 2 + 1
      const serializeId = parseId + 1
      onmessage({ data: { id: parseId, markdown: fixture.markdown, operation: 'parse' } })
      const parsed = responses.at(-1)
      if (!parsed?.ok || parsed.operation !== 'parse') {
        throw new Error(`Bundled worker failed to parse ${fixture.name}.`)
      }
      const parsedJson = JSON.stringify(parsed.value)
      for (const expectedNode of fixture.expectedNodes ?? []) {
        expect(parsedJson, fixture.name).toContain(expectedNode)
      }

      onmessage({ data: { id: serializeId, operation: 'serialize', value: parsed.value } })
      expect(responses.at(-1), fixture.name).toMatchObject({
        id: serializeId,
        markdown: `${fixture.expectedMarkdown ?? fixture.markdown}\n`,
        ok: true,
        operation: 'serialize',
      })
    }
  })
})
