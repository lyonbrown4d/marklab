export const conflictEditorLanguage = (path: string): string => {
  const extension = path.split('.').pop()?.toLowerCase()
  const languages: Record<string, string> = {
    md: 'markdown',
    markdown: 'markdown',
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    rs: 'rust',
    py: 'python',
    java: 'java',
    toml: 'toml',
    yaml: 'yaml',
    yml: 'yaml',
    sql: 'sql',
    sh: 'shell',
    xml: 'xml',
    c: 'c',
    cpp: 'cpp',
  }
  return languages[extension ?? ''] ?? 'plaintext'
}
