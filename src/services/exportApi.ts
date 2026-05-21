import { saveDialog } from '@/runtime/dialog'
import { invoke } from '@/runtime/ipc'

/** Supported export formats. */
export type ExportFormat = 'pdf' | 'docx' | 'html'

const FORMAT_CONFIG: Record<ExportFormat, { extensions: string[]; filterName: string }> = {
  pdf: { extensions: ['pdf'], filterName: 'PDF' },
  docx: { extensions: ['docx'], filterName: 'Word' },
  html: { extensions: ['html'], filterName: 'HTML' },
}

/**
 * Derive suggested default path for save dialog from current file.
 * e.g. rootPath="/proj", activePath="docs/notes.md" -> "/proj/docs/notes.pdf"
 */
function getDefaultExportPath(
  rootPath: string,
  activePath: string | null,
  ext: string,
): string | undefined {
  if (!rootPath || !activePath) return undefined
  const normalizedRoot = rootPath.replace(/[/\\]$/, '')
  const fullPath = `${normalizedRoot}/${activePath.replace(/^[/\\]/, '')}`
  return fullPath.replace(/\.[^/.]+$/, `.${ext}`)
}

let exportInProgress = false

/**
 * Export Markdown to the given format.
 * Shows save dialog (defaults to current file's path with new extension), then invokes export.
 * Guards against concurrent export to prevent multiple dialogs.
 */
async function exportMarkdown(
  markdown: string,
  format: ExportFormat,
  options?: { rootPath?: string; activePath?: string | null },
): Promise<void> {
  if (exportInProgress) return
  exportInProgress = true
  try {
    const config = FORMAT_CONFIG[format]
    const ext = config.extensions[0]
    const defaultPath =
      options?.rootPath && options?.activePath
        ? getDefaultExportPath(options.rootPath, options.activePath, ext)
        : undefined

    // Defer so native menu can close before the save dialog opens (macOS)
    await new Promise((r) => setTimeout(r, 0))

    const path = await saveDialog({
      defaultPath,
      filters: [{ name: config.filterName, extensions: config.extensions }],
    })
    if (!path) return

    await invoke('export_markdown', {
      markdown,
      format,
      outputPath: path,
    })
  } finally {
    exportInProgress = false
  }
}

export const exportApi = {
  exportMarkdown,
  openExportedFile(path: string) {
    return invoke<void>('export_open_output_path', { path })
  },
}
