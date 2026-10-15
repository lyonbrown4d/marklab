import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const packageEntry = fileURLToPath(import.meta.resolve('monaco-editor'))
const packageRoot = path.dirname(packageEntry)
const runtimeEntry = path.resolve('src/lib/monacoRuntime.ts')

const staticImports = (file: string): string[] => {
  const source = readFileSync(file, 'utf8')
  return [
    ...source.matchAll(
      /(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+)['"]([^'"]+)['"]/g,
    ),
  ]
    .map((match) => match[1])
    .map((specifier) =>
      specifier.startsWith('monaco-editor/')
        ? fileURLToPath(import.meta.resolve(specifier))
        : path.resolve(path.dirname(file), specifier),
    )
}

const expandedRegistrations = (file: string): string[] =>
  staticImports(file).flatMap((target) =>
    target.endsWith('/register.all.js') ? expandedRegistrations(target) : [target],
  )

// Some official feature modules already import the root entry's codicon CSS.
const withContributionCss = (entries: string[]): string[] =>
  entries.flatMap((entry) => [
    entry,
    ...(entry.endsWith('.js')
      ? staticImports(entry).filter((target) => target.endsWith('.css'))
      : []),
  ])

describe('installed Monaco runtime compatibility', () => {
  it('retains every official editor and language registration while excluding the root LSP entry', () => {
    const official = withContributionCss(expandedRegistrations(packageEntry))
    const local = withContributionCss(expandedRegistrations(runtimeEntry))
    const lspEntry = official.find((entry) => entry.includes('/external/monaco-lsp-client/'))
    expect(lspEntry).toBeDefined()
    const expected = [...new Set(official.filter((entry) => entry !== lspEntry))].sort()
    expect([...new Set(local)].sort()).toEqual(expected)
    expect(local).not.toContain(lspEntry)
    expect(local).toContain(path.join(packageRoot, 'editor/contrib/find/browser/findController.js'))
    expect(local).toContain(
      path.join(packageRoot, 'editor/browser/widget/diffEditor/diffEditor.contribution.js'),
    )
  })

  it('retains upstream lazy grammar and rich language-service activation', () => {
    const languages = expandedRegistrations(runtimeEntry).filter(
      (entry) =>
        entry.includes('/languages/definitions/') || entry.includes('/languages/features/'),
    )
    expect(languages.length).toBeGreaterThan(80)
    for (const language of languages) {
      const source = readFileSync(language, 'utf8')
      expect(source).toContain('import(')
      if (language.includes('/features/')) expect(source).toContain('languages.onLanguage(')
      else expect(source).toContain('loader:')
    }
  })
})
