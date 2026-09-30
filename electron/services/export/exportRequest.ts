import path from 'node:path'

export type ExportFormat = 'html' | 'pdf' | 'docx'
const schemePattern = /^[a-z][a-z\d+.-]*:/i
let exportTaskCounter = 0

export const parseExportFormat = (value: unknown): ExportFormat => {
  const format = stringArg(value, 'format').toLowerCase()
  if (format === 'html' || format === 'pdf' || format === 'docx') return format
  if (format === 'word') return 'docx'
  throw new Error(`Unsupported export format: ${format}`)
}

export const validateExportOutputPath = (value: unknown): string => {
  const outputPath = stringArg(value, 'outputPath').trim()
  if (!outputPath) throw new Error('outputPath is required')
  if (outputPath.includes('\0')) throw new Error('outputPath contains invalid characters')
  if (schemePattern.test(outputPath) && !path.win32.isAbsolute(outputPath)) {
    throw new Error('Only local filesystem output paths are allowed')
  }
  if (!path.isAbsolute(outputPath)) throw new Error('outputPath must be absolute')
  return path.resolve(outputPath)
}

export const validateExportOutputExtension = (outputPath: string, format: ExportFormat): void => {
  const expected = format === 'html' ? new Set(['.html', '.htm']) : new Set([`.${format}`])
  if (!expected.has(path.extname(outputPath).toLowerCase())) {
    throw new Error(`Export output extension does not match ${format}`)
  }
}

export const stringArg = (value: unknown, key: string): string => {
  const result =
    value && typeof value === 'object' && key in value
      ? (value as Record<string, unknown>)[key]
      : value
  if (typeof result !== 'string') throw new Error(`${key} must be a string`)
  return result
}

export const createExportTaskId = (format: ExportFormat): string => {
  exportTaskCounter += 1
  return `export-${format}-${Date.now()}-${exportTaskCounter}`
}
