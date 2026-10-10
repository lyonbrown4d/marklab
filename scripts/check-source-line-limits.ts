import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const MAX_EFFECTIVE_LINES = 300
const ROOT_SOURCE_DIRECTORY = '.'
const SOURCE_ROOTS = ['electron', 'e2e', 'scripts', 'src'] as const
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx'])
const EXEMPT_FILES = new Set([
  // Downloaded shadcn source. Project-specific behavior must be composed around it.
  'src/components/ui/sidebar.tsx',
])

const normalizePath = (filePath: string) => filePath.replaceAll('\\', '/')

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(entryPath)
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : []
  })

const collectRootSourceFiles = () =>
  readdirSync(ROOT_SOURCE_DIRECTORY, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(path.extname(entry.name))) return []
    return [path.join(ROOT_SOURCE_DIRECTORY, entry.name)]
  })

const lineCount = (filePath: string) => {
  const source = readFileSync(filePath, 'utf8')
  if (source.length === 0) return 0
  return source.split(/\r?\n/u).filter((line) => line.trim().length > 0).length
}

const violations = [...collectRootSourceFiles(), ...SOURCE_ROOTS.flatMap(collectSourceFiles)]
  .map(normalizePath)
  .filter((filePath) => !EXEMPT_FILES.has(filePath))
  .map((filePath) => ({ filePath, lines: lineCount(filePath) }))
  .filter(({ lines }) => lines > MAX_EFFECTIVE_LINES)
  .sort((left, right) => right.lines - left.lines || left.filePath.localeCompare(right.filePath))

if (violations.length > 0) {
  const details = violations
    .map(({ filePath, lines }) => `  ${filePath}: ${lines} lines`)
    .join('\n')
  throw new Error(
    `Source files must stay within ${MAX_EFFECTIVE_LINES} effective lines. Split these files:\n${details}`,
  )
}

console.log(`Source line limit passed (${MAX_EFFECTIVE_LINES} effective lines).`)
