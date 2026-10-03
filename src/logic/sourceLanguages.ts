import { fileExtension } from '@/logic/documentAdapters'

export type SourceLanguage = {
  id: string
  label: string
}

const languagesByExtension: Readonly<Record<string, SourceLanguage>> = {
  bash: { id: 'shell', label: 'Shell' },
  c: { id: 'c', label: 'C' },
  cc: { id: 'cpp', label: 'C++' },
  conf: { id: 'ini', label: 'Configuration' },
  cpp: { id: 'cpp', label: 'C++' },
  cs: { id: 'csharp', label: 'C#' },
  css: { id: 'css', label: 'CSS' },
  csv: { id: 'plaintext', label: 'CSV' },
  cts: { id: 'typescript', label: 'TypeScript' },
  cxx: { id: 'cpp', label: 'C++' },
  go: { id: 'go', label: 'Go' },
  h: { id: 'c', label: 'C header' },
  hh: { id: 'cpp', label: 'C++ header' },
  hpp: { id: 'cpp', label: 'C++ header' },
  htm: { id: 'html', label: 'HTML' },
  html: { id: 'html', label: 'HTML' },
  hxx: { id: 'cpp', label: 'C++ header' },
  ini: { id: 'ini', label: 'INI' },
  java: { id: 'java', label: 'Java' },
  js: { id: 'javascript', label: 'JavaScript' },
  json: { id: 'json', label: 'JSON' },
  jsonc: { id: 'json', label: 'JSON with comments' },
  jsx: { id: 'javascript', label: 'JSX' },
  kt: { id: 'kotlin', label: 'Kotlin' },
  kts: { id: 'kotlin', label: 'Kotlin script' },
  less: { id: 'less', label: 'Less' },
  lua: { id: 'lua', label: 'Lua' },
  mjs: { id: 'javascript', label: 'JavaScript' },
  mts: { id: 'typescript', label: 'TypeScript' },
  php: { id: 'php', label: 'PHP' },
  ps1: { id: 'powershell', label: 'PowerShell' },
  py: { id: 'python', label: 'Python' },
  rb: { id: 'ruby', label: 'Ruby' },
  rs: { id: 'rust', label: 'Rust' },
  scss: { id: 'scss', label: 'SCSS' },
  sh: { id: 'shell', label: 'Shell' },
  sql: { id: 'sql', label: 'SQL' },
  svelte: { id: 'html', label: 'Svelte' },
  swift: { id: 'swift', label: 'Swift' },
  toml: { id: 'toml', label: 'TOML' },
  ts: { id: 'typescript', label: 'TypeScript' },
  tsv: { id: 'plaintext', label: 'TSV' },
  tsx: { id: 'typescript', label: 'TSX' },
  txt: { id: 'plaintext', label: 'Plain text' },
  vue: { id: 'html', label: 'Vue' },
  xml: { id: 'xml', label: 'XML' },
  yaml: { id: 'yaml', label: 'YAML' },
  yml: { id: 'yaml', label: 'YAML' },
  zsh: { id: 'shell', label: 'Shell' },
}

const plainTextLanguage: SourceLanguage = { id: 'plaintext', label: 'Plain text' }

export const sourceLanguageForPath = (path: string): SourceLanguage =>
  languagesByExtension[fileExtension(path)] ?? plainTextLanguage
