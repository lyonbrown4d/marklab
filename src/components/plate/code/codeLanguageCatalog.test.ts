import { describe, expect, it } from 'vitest'
import { monacoCodeLanguage } from '@/components/plate/code/codeLanguageCatalog'

describe('monacoCodeLanguage', () => {
  it.each([
    ['bash', 'shell'],
    ['sh', 'shell'],
    ['shell', 'shell'],
    ['typescript', 'typescript'],
    ['tsx', 'typescript'],
    ['javascript', 'javascript'],
    ['jsx', 'javascript'],
    ['csharp', 'csharp'],
    ['cs', 'csharp'],
    ['markdown', 'markdown'],
    ['md', 'markdown'],
    ['powershell', 'powershell'],
    ['ps1', 'powershell'],
    ['yaml', 'yaml'],
    ['yml', 'yaml'],
  ])('maps %s to Monaco language %s', (language, expected) => {
    expect(monacoCodeLanguage(language)).toBe(expected)
  })

  it.each(['', 'text', 'txt', 'unknown-language'])('falls back for %s', (language) => {
    expect(monacoCodeLanguage(language)).toBe('plaintext')
  })
})
