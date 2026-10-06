const CJK_PATTERN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

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

export const isFuzzySearchTerm = (term: string): boolean =>
  term.length >= 5 && !CJK_PATTERN.test(term) && /^[\p{Letter}\p{Number}]+$/u.test(term)

export const searchWordTokens = (value: string): string[] =>
  foldSearchText(value).match(/[\p{Letter}\p{Number}]+/gu) ?? []
