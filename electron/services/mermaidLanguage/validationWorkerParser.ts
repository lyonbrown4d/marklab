import type { MermaidValidationIssue } from '@electron/services/mermaidLanguage/types.js'

type MermaidParser = Pick<(typeof import('mermaid'))['default'], 'parse'>

let parserPromise: Promise<MermaidParser> | null = null

const loadMermaidParser = (): Promise<MermaidParser> => {
  parserPromise ??= import('mermaid').then(({ default: mermaid }) => ({ parse: mermaid.parse }))
  return parserPromise
}

export const validateWithOfficialMermaidParser = async (
  source: string,
): Promise<readonly MermaidValidationIssue[]> => {
  if (!source.trim()) return []
  const parser = await loadMermaidParser()
  await parser.parse(source)
  return []
}
