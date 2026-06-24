import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { constants as zlibConstants } from 'node:zlib'
import electron from 'vite-plugin-electron/simple'
import TurboConsole from 'unplugin-turbo-console/vite'
import { compression, defineAlgorithm } from 'vite-plugin-compression2'
import { visualizer } from 'rollup-plugin-visualizer'
// eslint-disable-next-line no-restricted-imports -- Vite config helpers live at repository root before app aliases are available.
import {
  electronMainExternal,
  electronMainManualChunks,
  electronMainRequireBanner,
} from './vite.electron'

const isNodeModule = (id: string) => id.includes('/node_modules/')

const includesAny = (id: string, values: string[]) => values.some((value) => id.includes(value))

const packagePathMatches = (id: string, pattern: RegExp) => pattern.test(id)

const isEnabled = (value: string | undefined) => value === '1' || value === 'true'

const alias = {
  '@': path.resolve(__dirname, 'src'),
  '@electron': path.resolve(__dirname, 'electron'),
}

const devOptimizeDepsInclude = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react-router-dom',
  '@tanstack/react-query',
  'zustand',
  'sonner',
  'lucide-react',
]

const devWarmupClientFiles = [
  './src/main.tsx',
  './src/App.tsx',
  './src/app/AppLayout.tsx',
  './src/app/AppShellPanels.tsx',
  './src/pages/WorkspaceHomePage.tsx',
]

const electronMainEntry = {
  main: path.resolve(__dirname, 'electron/main.ts'),
  workspaceAnalysisWorkerEntry: path.resolve(
    __dirname,
    'electron/services/workspace/workspaceAnalysisWorkerEntry.ts',
  ),
}
const distKatexFontsDir = path.resolve(__dirname, 'dist/fonts')
const distElectronDir = path.resolve(__dirname, 'dist-electron')
const DEFAULT_DEV_SERVER_PORT = 5173

const resolveKatexFontsDir = (): string | null => {
  const hoistedFontsDir = path.resolve(__dirname, 'node_modules/katex/dist/fonts')
  if (existsSync(hoistedFontsDir)) return hoistedFontsDir

  const pnpmDir = path.resolve(__dirname, 'node_modules/.pnpm')
  if (!existsSync(pnpmDir)) return null

  const candidates = readdirSync(pnpmDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('katex@'))
    .map((entry) => path.resolve(pnpmDir, entry.name, 'node_modules/katex/dist/fonts'))
    .filter(existsSync)
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))

  return candidates[0] ?? null
}

const copyKatexFontsPlugin = () => ({
  name: 'copy-katex-fonts',
  writeBundle() {
    const source = resolveKatexFontsDir()
    if (!source) return
    mkdirSync(distKatexFontsDir, { recursive: true })
    cpSync(source, distKatexFontsDir, { recursive: true })
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
  const shouldCompress =
    isBuild && !isElectron && (mode === 'compressed' || isEnabled(process.env.MARKLAB_COMPRESS))
  const shouldReportCompressedSize =
    mode === 'analyze' ||
    mode === 'compressed' ||
    isEnabled(process.env.MARKLAB_REPORT_COMPRESSED_SIZE)
  const shouldUseReactCompiler =
    isBuild && (mode === 'compiler' || isEnabled(process.env.MARKLAB_REACT_COMPILER))
  const devServerPort = isServe
    ? (parseDevServerPort(process.env.MARKLAB_DEV_SERVER_PORT ?? process.env.VITE_PORT) ??
      DEFAULT_DEV_SERVER_PORT)
    : DEFAULT_DEV_SERVER_PORT

  return {
    server: {
      port: devServerPort,
      strictPort: false,
      warmup: {
        clientFiles: devWarmupClientFiles,
      },
    },
    optimizeDeps: {
      include: devOptimizeDepsInclude,
    },
    plugins: [
      isBuild && isElectron && cleanElectronDistPlugin(),
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
      shouldCompress &&
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
      shouldAnalyze &&
        visualizer({
          brotliSize: true,
          filename: 'dist/stats.html',
          gzipSize: true,
          open: false,
          template: 'treemap',
        }),
      isServe &&
        !isPerf &&
        !process.env.VITEST &&
        TurboConsole({
          /* options here */
        }),
      isBuild && copyKatexFontsPlugin(),
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
      setupFiles: './src/test/setup.ts',
    },
    build: {
      chunkSizeWarningLimit: isElectron ? 7000 : 500,
      reportCompressedSize: shouldReportCompressedSize,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/')
            if (!isNodeModule(normalizedId)) return undefined
            if (normalizedId.includes('react-scan')) return 'dev-react-scan'
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
