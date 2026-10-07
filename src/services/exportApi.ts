import { saveDialog } from '@/runtime/dialog'
import { invoke } from '@/runtime/ipc'
/** Supported export formats. */
export type ExportFormat = 'pdf' | 'docx' | 'html'
const FORMAT_CONFIG: Record<
  ExportFormat,
  {
    extensions: string[]
    filterName: string
  }
> = {
  pdf: { extensions: ['pdf'], filterName: 'PDF' },
  docx: { extensions: ['docx'], filterName: 'Word' },
  html: { extensions: ['html'], filterName: 'HTML' },
}
const getDefaultExportPath = (
  rootPath: string,
  activePath: string | null,
  ext: string,
): string | undefined => {
  if (!rootPath || !activePath) return undefined
  const normalizedRoot = rootPath.replace(/[/\\]$/, '')
  const fullPath = `${normalizedRoot}/${activePath.replace(/^[/\\]/, '')}`
  return fullPath.replace(/\.[^/.]+$/, `.${ext}`)
}
let exportInProgress = false
const exportDocument = async (
  format: ExportFormat,
  options: {
    rootPath: string
    activePath: string
  },
): Promise<string | undefined> => {
  if (exportInProgress) return undefined
  exportInProgress = true
  try {
    const config = FORMAT_CONFIG[format]
    const ext = config.extensions[0]
    const defaultPath =
      options.rootPath && options.activePath
        ? getDefaultExportPath(options.rootPath, options.activePath, ext)
        : undefined
    // Defer so native menu can close before the save dialog opens (macOS)
    await new Promise((r) => setTimeout(r, 0))
    const path = await saveDialog({
      defaultPath,
      filters: [{ name: config.filterName, extensions: config.extensions }],
    })
    if (!path) return undefined
    return await invoke<string>('export_markdown', {
      format,
      outputPath: path,
      sourceDocumentPath: options.activePath,
    })
  } finally {
    exportInProgress = false
  }
}
export const exportApi = {
  exportDocument,
  cancelExport(taskId: string) {
    return invoke<boolean>('export_cancel', { taskId })
  },
  openExportedFile(path: string) {
    return invoke<void>('export_open_output_path', { path })
  },
}
