import { describe, expect, it } from 'vitest'

import {
  buildInlineCompletionGenerationRequest,
  cleanInlineCompletion,
} from '@electron/services/ai/completion/prompt.js'

const input = {
  providerId: 'openai-main',
  completionSessionId: 'editor-1',
  revision: 1,
  prefix: '上一段介绍了今日安排。\n我今天打算',
  suffix: '。\n下一段是复盘记录。',
  heading: '今日计划',
  language: 'zh-CN' as const,
  length: 'short' as const,
  excludedSuggestions: ['去跑步'],
}

describe('inline completion prompt', () => {
  it('isolates untrusted document data from the controlled system instruction', () => {
    const request = buildInlineCompletionGenerationRequest(input)

    expect(request.system).toContain('untrusted')
    expect(request.system).not.toContain(input.prefix)
    expect(request.prompt).toContain('[UNTRUSTED_DOCUMENT_DATA_START]')
    expect(request.prompt).toContain('"prefix":"我今天打算"')
    expect(request.prompt).toContain('"contextBefore":"上一段介绍了今日安排。"')
    expect(request.prompt).toContain('"suffix":"。"')
    expect(request.prompt).toContain('"contextAfter":"下一段是复盘记录。"')
    expect(request.maxOutputTokens).toBe(48)
    expect(request.temperature).toBeLessThanOrEqual(0.5)
  })

  it.each([
    ['short', 48],
    ['medium', 96],
    ['long', 160],
  ] as const)('maps %s to a controlled token budget', (length, expected) => {
    expect(buildInlineCompletionGenerationRequest({ ...input, length }).maxOutputTokens).toBe(
      expected,
    )
  })
})

describe('cleanInlineCompletion', () => {
  it('removes fences, quotes, control characters, and an echoed prefix', () => {
    const output = '```text\n“我今天打算去\u0000图书馆”\n```'

    expect(cleanInlineCompletion(output, input)).toBe('去图书馆')
  })

  it('drops excluded duplicates and caps output at 512 characters', () => {
    expect(cleanInlineCompletion('去跑步', input)).toBe('')
    expect(cleanInlineCompletion('x'.repeat(600), input)).toHaveLength(512)
  })

  it.each([
    [' write  ', ' write'],
    ['\nnext paragraph\n', '\nnext paragraph'],
    ['我今天打算去图书馆  ', '去图书馆'],
  ])('preserves semantic leading whitespace for %j', (output, expected) => {
    expect(cleanInlineCompletion(output, input)).toBe(expected)
  })
})
