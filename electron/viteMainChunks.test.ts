import { build, type Rolldown } from 'vite'
import { describe, expect, it } from 'vitest'

// eslint-disable-next-line no-restricted-imports -- Exercise the root Electron build helper directly.
import { electronMainManualChunks, electronMainRequireBanner } from '../vite.electron'

const fixtureRoot = '/__main_chunk_fixture__'
const fixturePath = (name: string) => `${fixtureRoot}/${name}`
const packagePath = (name: string) => fixturePath(`node_modules/${name}/index.js`)
const entryPath = fixturePath('main.js')
const schemaPath = fixturePath('schemas.js')
const zodPath = packagePath('zod')
const sdkPath = packagePath('ai')
const sdkUtilsPath = packagePath('@ai-sdk/provider-utils')
const providerPaths = ['anthropic', 'google', 'openai-compatible', 'openai'].map((name) =>
  packagePath(`@ai-sdk/${name}`),
)

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

describe('Electron main production chunk boundaries', () => {
  it.each([false, true])(
    'keeps generation and providers lazy with shared startup SDK utilities: %s',
    async (useStartupSdkUtils) => {
      const fixtureModules: Record<string, string> = {
        [entryPath]: `
          import { schema } from '${schemaPath}';
          ${useStartupSdkUtils ? `import { helper } from '${sdkUtilsPath}';` : ''}
          globalThis.mainFixture = schema ${useStartupSdkUtils ? '+ helper' : ''};
          export const generate = () => import('${sdkPath}');
          export const providers = [${providerPaths.map((id) => `() => import('${id}')`).join(',')}];
        `,
        [schemaPath]: `import { schema } from '${zodPath}'; export { schema };`,
        [zodPath]: 'export const schema = globalThis.fixtureSchema ?? 1;',
        [sdkUtilsPath]: `
          import { schema } from '${zodPath}';
          export const helper = schema + 1;
        `,
        [sdkPath]: `
          import { helper } from '${sdkUtilsPath}';
          export const generateText = () => helper;
        `,
        ...Object.fromEntries(
          providerPaths.map((id, index) => [
            id,
            `import { helper } from '${sdkUtilsPath}'; export const createModel = () => helper + ${index};`,
          ]),
        ),
      }
      const result = await build({
        configFile: false,
        logLevel: 'silent',
        plugins: [
          {
            name: 'main-chunk-fixture',
            resolveId: (id) => (id in fixtureModules ? id : undefined),
            load: (id) => fixtureModules[id],
          },
        ],
        build: {
          write: false,
          minify: false,
          lib: { entry: { main: entryPath }, formats: ['es'] },
          rolldownOptions: {
            platform: 'node',
            external: [/^node:/],
            input: { main: entryPath },
            preserveEntrySignatures: 'strict',
            output: {
              entryFileNames: '[name].js',
              chunkFileNames: 'chunks/[name]-[hash].js',
              banner: electronMainRequireBanner,
              codeSplitting: true,
              manualChunks: electronMainManualChunks,
            },
          },
        },
      })
      const bundle = Array.isArray(result) ? result[0] : result
      if (!bundle || !('output' in bundle)) throw new Error('Expected one fixture bundle')
      const chunks = bundle.output.filter(
        (item): item is Rolldown.OutputChunk => item.type === 'chunk',
      )
      const entry = chunks.find((chunk) => chunk.isEntry)
      if (!entry) throw new Error('Missing fixture entry')
      const startup = staticClosure(chunks, entry)

      expect(startup).toContain(schemaPath)
      expect(startup).toContain(zodPath)
      if (useStartupSdkUtils) expect(startup).toContain(sdkUtilsPath)
      for (const lazyModule of [sdkPath, ...providerPaths]) {
        expect(startup).not.toContain(lazyModule)
        const lazyEntry = chunks.find((chunk) => chunk.facadeModuleId === lazyModule)
        if (!lazyEntry) throw new Error(`Missing lazy entry: ${lazyModule}`)
        expect(entry.dynamicImports).toContain(lazyEntry.fileName)
        expect(staticClosure(chunks, lazyEntry)).toContain(lazyModule)
        for (const otherProvider of providerPaths.filter((id) => id !== lazyModule)) {
          expect(staticClosure(chunks, lazyEntry)).not.toContain(otherProvider)
        }
      }
      for (const chunk of chunks) {
        expect(chunk.code).toContain('__marklabCreateRequire(import.meta.url)')
        expect(chunk.code).toContain('node:module')
        if (!chunk.isEntry) expect(chunk.fileName).toMatch(/^chunks\/.+\.js$/)
      }
    },
  )
})
