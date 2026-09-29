import MiniSearch, { type Options, type SearchOptions } from 'minisearch'

import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

export const NODE_SEARCH_SCHEMA_VERSION = 2 as const

export const NODE_SEARCH_SNAPSHOT_OPTIONS = {
  fields: ['title', 'path', 'content'],
  idField: 'path',
  storeFields: ['path', 'title'],
  tokenizer: 'marklab-unicode-v1',
} as const

const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const TOKEN_PATTERN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+|[\p{Letter}\p{Number}]+/gu

export const foldSearchText = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[øØ]/g, 'o')
    .replace(/[łŁ]/g, 'l')
    .replace(/[ðÐ]/g, 'd')
    .replace(/[þÞ]/g, 'th')
    .replace(/ß/g, 'ss')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .toLocaleLowerCase()

export const tokenizeSearchText = (value: string): string[] => {
  const groups = foldSearchText(value).match(TOKEN_PATTERN) ?? []
  const tokens: string[] = []
  for (const group of groups) {
    if (!CJK_PATTERN.test(group)) {
      tokens.push(group)
      continue
    }
    const characters = [...group]
    tokens.push(...characters)
    for (let index = 0; index < characters.length - 1; index += 1) {
      tokens.push(`${characters[index]}${characters[index + 1]}`)
    }
  }
  return tokens
}

export const nodeSearchMiniSearchOptions = (): Options<WorkspaceSearchDocument> => ({
  fields: [...NODE_SEARCH_SNAPSHOT_OPTIONS.fields],
  idField: NODE_SEARCH_SNAPSHOT_OPTIONS.idField,
  storeFields: [...NODE_SEARCH_SNAPSHOT_OPTIONS.storeFields],
  tokenize: tokenizeSearchText,
  processTerm: (term) => term,
})

export const nodeSearchQueryOptions = (): SearchOptions => ({
  boost: { title: 5, path: 3, content: 1 },
  combineWith: 'AND',
  fuzzy: (term) => (term.length >= 5 && !CJK_PATTERN.test(term) ? 0.2 : false),
  prefix: (term) => term.length >= 2,
  weights: { fuzzy: 0.45, prefix: 0.7 },
})

export const createMiniSearch = (): MiniSearch<WorkspaceSearchDocument> =>
  new MiniSearch<WorkspaceSearchDocument>(nodeSearchMiniSearchOptions())
