import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import TurboConsole from 'unplugin-turbo-console/vite'
import { visualizer } from 'rollup-plugin-visualizer'
// eslint-disable-next-line no-restricted-imports -- Root Vite helpers are outside renderer aliases.
import { devOptimizeDepsInclude, devWarmupClientFiles } from './vite.development.ts'
// eslint-disable-next-line no-restricted-imports -- Worker config helpers live at repository root before app aliases are available.
import { plateMarkdownWorkerPlugins } from './vite.worker.ts'
// eslint-disable-next-line no-restricted-imports -- Development-only HTML integration is a root Vite helper.
import { reactDevToolsPlugin } from './vite.reactDevTools.ts'
// eslint-disable-next-line no-restricted-imports -- Shared dotenv-backed configuration belongs to Node tooling.
import { loadDevelopmentConfig } from './scripts/development-config.ts'

const isEnabled = (value: string | undefined) => value === '1' || value === 'true'

const workerCharacterReferencePath = fileURLToPath(
  import.meta.resolve('decode-named-character-reference'),
)

const alias = {
  '@': path.resolve(import.meta.dirname, 'src'),
  'decode-named-character-reference': workerCharacterReferencePath,
  // Use the plugin's ESM entry and map its legacy Monaco paths to 0.57 exports.
  'monaco-vim': fileURLToPath(import.meta.resolve('monaco-vim')),
  'monaco-editor/esm/vs/editor/editor.api': fileURLToPath(
    import.meta.resolve('monaco-editor/editor/editor.api.js'),
  ),
  'monaco-editor/esm/vs/editor/common/commands/shiftCommand': fileURLToPath(
    import.meta.resolve('monaco-editor/editor/common/commands/shiftCommand.js'),
  ),
}

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
  const development =
    isServe && !isPerf && !process.env.VITEST
      ? loadDevelopmentConfig(mode).configuration
      : undefined
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
      strictPort: mode === 'tauri',
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
      development && reactDevToolsPlugin(development),
      react(),
      shouldUseReactCompiler &&
        babel({
          presets: [reactCompilerPreset()],
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
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/**/*.spec.ts', 'src/**/*.spec.tsx'],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
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
          'src/runtime/desktop.ts',
          'src/runtime/rendererFrame.ts',
          'src/runtime/rendererLifecycle.ts',
          'src/runtime/tauri/index.ts',
          'src/runtime/tauri/transport.ts',
          'src/runtime/tauri/window.ts',
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
      // React Data Grid uses light-dark(); preserve it when minifying vendor CSS.
      cssTarget: 'esnext',
      chunkSizeWarningLimit: 500,
      reportCompressedSize: shouldReportCompressedSize,
      rolldownOptions: {
        output: {
          // Let the import graph keep editor, diagram, and graph dependencies lazy.
          // Named vendor groups absorb shared dependencies and can make React
          // statically import the entire feature group during startup.
          codeSplitting: true,
        },
      },
    },
  }
})
