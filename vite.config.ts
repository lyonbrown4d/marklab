import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import path from 'node:path'
import { constants as zlibConstants } from 'node:zlib'
import electron from 'vite-plugin-electron/simple'
import TurboConsole from 'unplugin-turbo-console/vite'
import { compression, defineAlgorithm } from 'vite-plugin-compression2'

const isNodeModule = (id: string) => id.includes('/node_modules/')

const includesAny = (id: string, values: string[]) => values.some((value) => id.includes(value))

const packagePathMatches = (id: string, pattern: RegExp) => pattern.test(id)

const alias = {
  '@': path.resolve(__dirname, 'src'),
  '@electron': path.resolve(__dirname, 'electron'),
}

const electronMainRequireBanner = [
  "import { createRequire as __marklabCreateRequire } from 'node:module';",
  'const require = __marklabCreateRequire(import.meta.url);',
].join('\n')

const electronMainExternal = ['@homebridge/node-pty-prebuilt-multiarch']

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build'
  const isServe = command === 'serve'
  const isPerf = mode === 'perf'
  const isElectron = mode === 'electron'

  return {
    server: {
      port: 5173,
      strictPort: true, // fail if port is taken so Electron loads the expected dev server
    },
    plugins: [
      react(),
      babel({
        presets: [reactCompilerPreset()],
      }),
      isElectron &&
        electron({
          main: {
            entry: 'electron/main.ts',
            vite: {
              resolve: {
                alias,
              },
              build: {
                assetsInlineLimit: 0,
                rollupOptions: {
                  external: electronMainExternal,
                  input: {
                    main: path.resolve(__dirname, 'electron/main.ts'),
                    workspaceAnalysisWorkerEntry: path.resolve(
                      __dirname,
                      'electron/services/workspace/workspaceAnalysisWorkerEntry.ts',
                    ),
                  },
                  output: {
                    entryFileNames: '[name].js',
                    banner: electronMainRequireBanner,
                  },
                },
              },
            },
          },
          preload: {
            input: 'electron/preload.ts',
            vite: {
              resolve: {
                alias,
              },
              build: {
                rollupOptions: {
                  output: {
                    entryFileNames: '[name].cjs',
                    chunkFileNames: '[name].cjs',
                  },
                },
              },
            },
          },
        }),
      isBuild &&
        compression({
          include: /\.(html|xml|css|json|js|mjs|svg|wasm)$/,
          threshold: 10 * 1024,
          deleteOriginalAssets: false,
          skipIfLargerOrEqual: true,
          algorithms: [
            defineAlgorithm('gzip', { level: 9 }),
            defineAlgorithm('brotliCompress', {
              params: {
                [zlibConstants.BROTLI_PARAM_QUALITY]: 11,
              },
            }),
          ],
        }),
      isServe &&
        !isPerf &&
        !process.env.VITEST &&
        TurboConsole({
          /* options here */
        }),
    ].filter(Boolean),
    resolve: {
      alias,
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['import'],
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/')
            if (!isNodeModule(normalizedId)) return undefined
            if (normalizedId.includes('react-scan')) return 'dev-react-scan'
            if (normalizedId.includes('reactflow')) return 'vendor-graph'
            if (normalizedId.includes('lucide-react')) return 'vendor-icons'
            if (
              packagePathMatches(
                normalizedId,
                /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store|zustand|@tanstack\/react-query|@tanstack\/query-core)\//,
              )
            ) {
              return 'vendor-react'
            }
            if (includesAny(normalizedId, ['monaco-editor', '@monaco-editor'])) {
              return 'vendor-monaco'
            }
            if (normalizedId.includes('@codemirror/language-data')) {
              return 'vendor-codemirror-language-data'
            }
            const codemirrorLanguageMatch = normalizedId.match(/@codemirror\/(lang-[^/]+)/)
            if (codemirrorLanguageMatch?.[1]) {
              return `vendor-codemirror-${codemirrorLanguageMatch[1]}`
            }
            const lezerLanguageMatch = normalizedId.match(/@lezer\/([^/]+)/)
            if (lezerLanguageMatch?.[1]) {
              return `vendor-lezer-${lezerLanguageMatch[1]}`
            }
            if (includesAny(normalizedId, ['@codemirror', 'style-mod', 'w3c-keyname'])) {
              return 'vendor-codemirror-core'
            }
            if (normalizedId.includes('prosemirror')) return 'vendor-prosemirror'
            if (normalizedId.includes('@milkdown/crepe')) return 'vendor-milkdown-crepe'
            if (normalizedId.includes('@milkdown')) return 'vendor-milkdown-core'
            if (includesAny(normalizedId, ['katex', 'mhchem'])) return 'vendor-katex'
            if (includesAny(normalizedId, ['d3-', '/d3/'])) return 'vendor-d3'
            if (normalizedId.includes('elkjs')) return 'vendor-elk'
            if (normalizedId.includes('cytoscape')) return 'vendor-cytoscape'
            if (includesAny(normalizedId, ['dagre', 'graphlib', 'layout-base', 'cose-base'])) {
              return 'vendor-graph-layout'
            }
            if (normalizedId.includes('mermaid')) return 'vendor-mermaid'
            if (normalizedId.includes('@radix-ui')) return 'vendor-radix'
            return undefined
          },
        },
      },
    },
  }
})
