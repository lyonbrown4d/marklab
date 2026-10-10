import path from 'node:path'
import type { PluginOption } from 'vite'
// eslint-disable-next-line no-restricted-imports -- Root Vite helpers load before renderer aliases exist.
import { plateMarkdownDeadExportsPlugin } from './vite.workerPlateTransforms.ts'

const markdownWorkerRuntime = path.resolve(
  import.meta.dirname,
  'src/components/plate/plateMarkdownWorkerRuntime.ts',
)

const markdownWorkerPlateImporters = [
  '/@platejs/date/',
  '/@platejs/markdown/',
  '/src/components/plate/plateMarkdownRules.ts',
]

const isMarkdownWorkerPlateImporter = (importer: string) => {
  const normalizedImporter = importer.replaceAll('\\', '/')
  return markdownWorkerPlateImporters.some((part) => normalizedImporter.includes(part))
}

/**
 * @platejs/markdown imports the browser-oriented Plate barrel even when only
 * its pure MDAST converters are used. Keep that barrel out of the Markdown
 * worker while preserving Plate's public conversion implementation.
 */
export const plateMarkdownWorkerPlugins = (): PluginOption[] => [
  {
    enforce: 'pre',
    name: 'plate-markdown-worker-runtime',
    resolveId(source, importer) {
      if (source !== 'platejs' || !importer || !isMarkdownWorkerPlateImporter(importer)) {
        return null
      }
      return markdownWorkerRuntime
    },
  },
  plateMarkdownDeadExportsPlugin(),
]
