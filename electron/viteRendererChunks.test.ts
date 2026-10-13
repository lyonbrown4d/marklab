import { build, loadConfigFromFile, type Rolldown } from 'vite'
import { describe, expect, it } from 'vitest'

const fixtureRoot = '/__renderer_chunk_fixture__'
const fixturePath = (name: string) => `${fixtureRoot}/${name}`
const packagePath = (name: string) => fixturePath(`node_modules/${name}/index.js`)
const sharedPath = packagePath('shared-helper')
const reactPath = packagePath('react')
const platePath = packagePath('platejs')
const mermaidPath = packagePath('mermaid')
const elkPath = packagePath('elkjs')
const graphPath = packagePath('@xyflow/react')
const editorPath = fixturePath('editor.js')
const entryPath = fixturePath('entry.js')

const fixtureModules: Record<string, string> = {
  [entryPath]: `
    import { value } from '${reactPath}';
    globalThis.rendererFixture = value;
    export const loadEditor = () => import('${editorPath}');
    export const loadGraph = () => import('${graphPath}');
  `,
  [sharedPath]: 'export const shared = globalThis.fixtureShared ?? 1;',
  [reactPath]: `import { shared } from '${sharedPath}'; export const value = shared;`,
  [editorPath]: `
    export { value } from '${platePath}';
    export const loadDiagram = () => import('${mermaidPath}');
  `,
  [platePath]: `import { shared } from '${sharedPath}'; export const value = shared + 1;`,
  [mermaidPath]: `
    import { shared } from '${sharedPath}';
    import { value as layout } from '${elkPath}';
    export const value = shared + layout;
  `,
  [elkPath]: `import { shared } from '${sharedPath}'; export const value = shared + 2;`,
  [graphPath]: `
    import { value } from '${elkPath}';
    export const layout = value;
  `,
}

const staticClosure = (chunks: Rolldown.OutputChunk[], entry: Rolldown.OutputChunk) => {
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]))
  const visited = new Set<string>()
  const modules = new Set<string>()
  const visit = (chunk: Rolldown.OutputChunk) => {
    if (visited.has(chunk.fileName)) return
    visited.add(chunk.fileName)
    Object.keys(chunk.modules).forEach((id) => modules.add(id))
    chunk.imports.forEach((name) => {
      const dependency = byName.get(name)
      if (dependency) visit(dependency)
    })
  }
  visit(entry)
  return modules
}

describe('renderer production chunk boundaries', () => {
  it('keeps shared dependencies from pulling lazy editor, diagram, and graph packages into startup', async () => {
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'test' })
    expect(loaded).not.toBeNull()
    const result = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'renderer-chunk-fixture',
          resolveId: (id) => (id in fixtureModules ? id : undefined),
          load: (id) => fixtureModules[id],
        },
      ],
      build: {
        write: false,
        minify: false,
        rolldownOptions: {
          // eslint-disable-next-line @typescript-eslint/no-deprecated -- Also exercise the previous Rollup-compatible config so this regression fails before the fix.
          ...(loaded?.config.build?.rolldownOptions ?? loaded?.config.build?.rollupOptions),
          input: entryPath,
          preserveEntrySignatures: 'strict',
        },
      },
    })
    if (Array.isArray(result) || !('output' in result))
      throw new Error('Expected one fixture bundle')
    const chunks = result.output.filter(
      (item): item is Rolldown.OutputChunk => item.type === 'chunk',
    )
    const entry = chunks.find((chunk) => chunk.isEntry)
    if (!entry) throw new Error('Missing fixture entry')
    const startup = staticClosure(chunks, entry)

    expect(startup).toContain(reactPath)
    expect(startup).toContain(sharedPath)
    for (const lazyPackage of [platePath, mermaidPath, elkPath, graphPath]) {
      expect(startup).not.toContain(lazyPackage)
    }

    const editor = chunks.find((chunk) => chunk.facadeModuleId === editorPath)
    const graph = chunks.find((chunk) => chunk.facadeModuleId === graphPath)
    const diagram = chunks.find((chunk) => chunk.facadeModuleId === mermaidPath)
    if (!editor || !graph || !diagram) throw new Error('Missing lazy feature entry')
    expect(entry.dynamicImports).toContain(editor.fileName)
    expect(entry.dynamicImports).toContain(graph.fileName)
    expect(editor.dynamicImports).toContain(diagram.fileName)
    expect(staticClosure(chunks, editor)).toContain(platePath)
    expect(staticClosure(chunks, graph)).toContain(elkPath)
    expect(staticClosure(chunks, diagram)).toContain(mermaidPath)
  })
})
