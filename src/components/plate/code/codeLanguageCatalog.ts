export type CodeLanguageOption = {
  id: string
  label: string
  aliases?: readonly string[]
  monacoId?: string
}

export const codeLanguageCatalog: readonly CodeLanguageOption[] = [
  { id: '', label: 'Plain text', aliases: ['text', 'txt'] },
  { id: 'bash', label: 'Bash', aliases: ['shell', 'sh'], monacoId: 'shell' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++', aliases: ['cxx'] },
  { id: 'csharp', label: 'C#', aliases: ['cs'] },
  { id: 'css', label: 'CSS' },
  { id: 'diff', label: 'Diff' },
  { id: 'dockerfile', label: 'Dockerfile', aliases: ['docker'] },
  { id: 'go', label: 'Go' },
  { id: 'graphql', label: 'GraphQL', aliases: ['gql'] },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript', aliases: ['js', 'jsx'] },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin', aliases: ['kt', 'kts'] },
  { id: 'lua', label: 'Lua' },
  { id: 'markdown', label: 'Markdown', aliases: ['md'] },
  { id: 'mermaid', label: 'Mermaid', aliases: ['mmd'] },
  { id: 'php', label: 'PHP' },
  { id: 'powershell', label: 'PowerShell', aliases: ['ps1'] },
  { id: 'python', label: 'Python', aliases: ['py'] },
  { id: 'ruby', label: 'Ruby', aliases: ['rb'] },
  { id: 'rust', label: 'Rust', aliases: ['rs'] },
  { id: 'scss', label: 'SCSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'toml', label: 'TOML' },
  { id: 'typescript', label: 'TypeScript', aliases: ['ts', 'tsx'] },
  { id: 'xml', label: 'XML' },
  { id: 'yaml', label: 'YAML', aliases: ['yml'] },
]

export const codeLanguageLabel = (language: string): string => {
  const normalized = language.trim().toLowerCase()
  const option = codeLanguageCatalog.find(
    ({ aliases, id }) => id === normalized || aliases?.includes(normalized),
  )
  return option?.label ?? (language.trim() || 'Plain text')
}

export const monacoCodeLanguage = (language: string): string => {
  const normalized = language.trim().toLowerCase()
  if (!normalized) return 'plaintext'
  const option = codeLanguageCatalog.find(
    ({ aliases, id }) => id === normalized || aliases?.includes(normalized),
  )
  return (option?.monacoId ?? option?.id) || 'plaintext'
}
