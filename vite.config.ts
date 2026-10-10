import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import TurboConsole from 'unplugin-turbo-console/vite'
import { visualizer } from 'rollup-plugin-visualizer'
// eslint-disable-next-line no-restricted-imports -- Root Vite helpers are outside renderer aliases.
import { devOptimizeDepsInclude, devWarmupClientFiles } from './vite.development.ts'
// eslint-disable-next-line no-restricted-imports -- Vite config helpers live at repository root before app aliases are available.
import {
  electronMainEntry,
  electronMainExternal,
  electronMainManualChunks,
  electronMainRequireBanner,
} from './vite.electron.ts'
// eslint-disable-next-line no-restricted-imports -- Worker config helpers live at repository root before app aliases are available.
import { plateMarkdownWorkerPlugins } from './vite.worker.ts'

const isNodeModule = (id: string) => id.includes('/node_modules/')

const includesAny = (id: string, values: string[]) => values.some((value) => id.includes(value))

const packagePathMatches = (id: string, pattern: RegExp) => pattern.test(id)

const isEnabled = (value: string | undefined) => value === '1' || value === 'true'

const workerCharacterReferencePath = fileURLToPath(
  import.meta.resolve('decode-named-character-reference'),
)

const alias = {
  '@': path.resolve(import.meta.dirname, 'src'),
  '@electron': path.resolve(import.meta.dirname, 'electron'),
  'decode-named-character-reference': workerCharacterReferencePath,
}

const distElectronDir = path.resolve(import.meta.dirname, 'dist-electron')
const distDesignPreviewAssets = [
  'logo-preview.html',
  'marklab-logo-direction-1.svg',
  'marklab-logo-direction-2.svg',
  'marklab-logo-direction-3.svg',
]
const DEFAULT_DEV_SERVER_PORT = 5173
const DEFAULT_DEV_SERVER_HOST = '127.0.0.1'

const removeDesignPreviewAssetsPlugin = () => ({
  name: 'remove-design-preview-assets',
  writeBundle() {
    for (const fileName of distDesignPreviewAssets) {
      rmSync(path.resolve(import.meta.dirname, 'dist', fileName), { force: true })
    }
  },
})

const cleanElectronDistPlugin = () => ({
  name: 'clean-electron-dist',
  buildStart() {
    rmSync(distElectronDir, { force: true, recursive: true })
  },
})

const parseDevServerPort = (value: string | undefined): number | null => {
  if (!value) return null
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null
  return port
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const isBuild = command === 'build'
  const isServe = command === 'serve'
  const isPerf = mode === 'perf'
  const isElectron = mode === 'electron'
  const shouldAnalyze = isBuild && (mode === 'analyze' || isEnabled(process.env.MARKLAB_ANALYZE))
  const shouldReportCompressedSize =
    mode === 'analyze' || isEnabled(process.env.MARKLAB_REPORT_COMPRESSED_SIZE)
  const shouldUseReactCompiler =
    isBuild && (mode === 'compiler' || isEnabled(process.env.MARKLAB_REACT_COMPILER))
  const devServerPort = isServe
    ? (parseDevServerPort(process.env.MARKLAB_DEV_SERVER_PORT ?? process.env.VITE_PORT) ??
      DEFAULT_DEV_SERVER_PORT)
    : DEFAULT_DEV_SERVER_PORT

  return {
    base: './',
    server: {
      host: process.env.MARKLAB_DEV_SERVER_HOST ?? DEFAULT_DEV_SERVER_HOST,
      port: devServerPort,
      strictPort: false,
      warmup: {
        clientFiles: devWarmupClientFiles,
      },
    },
    optimizeDeps: {
      include: devOptimizeDepsInclude,
    },
    worker: {
      plugins: plateMarkdownWorkerPlugins,
    },
    plugins: [
      isElectron && cleanElectronDistPlugin(),
      react(),
      shouldUseReactCompiler &&
        babel({
          presets: [reactCompilerPreset()],
        }),
      isElectron &&
        electron({
          main: {
            entry: electronMainEntry,
            vite: {
              resolve: {
                alias,
              },
              build: {
                assetsInlineLimit: 0,
                rolldownOptions: {
                  external: electronMainExternal,
                  output: {
                    entryFileNames: '[name].js',
                    chunkFileNames: 'chunks/[name]-[hash].js',
                    banner: electronMainRequireBanner,
                    codeSplitting: true,
                    manualChunks: electronMainManualChunks,
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
      shouldAnalyze &&
        visualizer({
          brotliSize: true,
          filename: 'dist/stats.html',
          gzipSize: true,
          open: false,
          template: 'treemap',
        }),
      isServe && !isPerf && !process.env.VITEST && TurboConsole({/* options here */}),
      isBuild && removeDesignPreviewAssetsPlugin(),
    ].filter(Boolean),
    resolve: {
      alias,
      // Keep lazy feature chunks on the renderer's React instances, including
      // after Vite discovers and prebundles a dependency during development.
      dedupe: ['react', 'react-dom'],
    },
    css: {
      preprocessorOptions: {
        scss: {
          silenceDeprecations: ['import'],
        },
      },
    },
    test: {
      include: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.ts',
        'src/**/*.spec.tsx',
        'electron/**/*.test.ts',
        'electron/**/*.spec.ts',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/dist-electron/**',
        '**/release/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/coverage/**',
      ],
      environment: 'jsdom',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json-summary'],
        reportsDirectory: 'coverage/critical',
        include: [
          'electron/main/initialNativeOpen.ts',
          'electron/main/singleInstance.ts',
          'electron/main/windowCurrentPathOpen.ts',
          'electron/main/windowCommandSetup.ts',
          'electron/main/windowCommandTargets.ts',
          'electron/main/windowCommands.ts',
          'electron/services/workspace/windowWorkspaceMutationGate.ts',
          'electron/services/workspace/workspaceRootTransitionGate.ts',
          'electron/services/workspace/workspaceRootCommit.ts',
          'src/app/nativeSurfaceOcclusion.ts',
          'src/components/command/useDoubleShiftCommandPalette.ts',
          'src/components/plate/nodes/MathFootnoteElements.tsx',
          'src/components/plate/plateMarkdownConfig.ts',
          'src/components/plate/plateMarkdownInputRuleGuard.ts',
          'src/components/plate/plateMarkdownInputRules.ts',
          'src/components/plate/plateMarkdownWorkerConfig.ts',
          'src/components/plate/plateMarkdownWorkerRuntime.ts',
          'src/components/plate/selection/PlateSelectionToolbar.tsx',
          'src/components/plate/selection/selectionToolbarActions.ts',
          'src/components/plate/usePlateSelectionToolbar.ts',
          'src/pages/workspace-map/WorkspaceMapFileNode.tsx',
          'src/pages/workspace-map/WorkspaceMapStaticMarkdownPreview.tsx',
          'src/workers/plateMarkdownWorker.ts',
          'vite.worker.ts',
          'vite.workerPlateTransforms.ts',
        ],
        thresholds: {
          perFile: true,
          lines: 85,
          functions: 85,
          statements: 85,
          branches: 85,
        },
      },
      server: {
        deps: {
          inline: ['@platejs/math', 'katex'],
        },
      },
      // Native Git processes, workspace workers, and jsdom are resource-heavy when combined.
      // A fixed cap avoids Windows worker crashes and locked temporary repositories.
      maxWorkers: 4,
      setupFiles: './src/test/setup.ts',
      testTimeout: 10_000,
    },
    build: {
      chunkSizeWarningLimit: isElectron ? 7000 : 500,
      reportCompressedSize: shouldReportCompressedSize,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/')
            if (!isNodeModule(normalizedId)) return undefined
            if (normalizedId.includes('/node_modules/lodash-es/')) return 'vendor-lodash'
            if (includesAny(normalizedId, ['reactflow', '@xyflow/react', '@xyflow/system'])) {
              return 'vendor-graph'
            }
            if (normalizedId.includes('lucide-react')) return 'vendor-icons'
            if (
              packagePathMatches(
                normalizedId,
                /\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|use-sync-external-store|zustand|@tanstack\/react-query|@tanstack\/query-core)\//,
              )
            ) {
              return 'vendor-react'
            }
            if (
              packagePathMatches(
                normalizedId,
                /\/node_modules\/(platejs|@platejs\/[^/]+|@udecode\/[^/]+|slate(?:-[^/]+)?)\//,
              )
            ) {
              return 'vendor-plate'
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
