export type DocumentCompletionTokenKind = 'word' | 'cjk-ngram' | 'symbol'

export type DocumentCompletionToken = {
  end: number
  kind: DocumentCompletionTokenKind
  normalized: string
  start: number
  text: string
}

export type DocumentCompletionSentence = {
  end: number
  start: number
  text: string
}

export type DocumentCompletionAnalysis = {
  searchKeys: string[]
  sentences: DocumentCompletionSentence[]
  tokens: DocumentCompletionToken[]
}

export type DocumentCompletionTokenizer = {
  analyze: (text: string) => DocumentCompletionAnalysis
}

const MAX_COMPLETION_PREFIX_LENGTH = 80

const isHan = (text: string) => /\p{Script=Han}/u.test(text)
const isSearchableSymbol = (text: string) => /[\p{L}\p{N}\p{S}\p{M}]/u.test(text)

export const normalizeCompletionSearchKey = (text: string) =>
  text.normalize('NFKC').trim().toLowerCase()

export const normalizeCompletionCandidateKey = (text: string) =>
  normalizeCompletionSearchKey(text).replace(/[.!?。！？;,，；:：]+$/u, '')

export const completionTrailingPrefix = (context: string) => {
  const tail = context.slice(-MAX_COMPLETION_PREFIX_LENGTH * 2)
  const segment =
    tail
      .split(/[\n.!?。！？]/u)
      .at(-1)
      ?.trimStart() ?? ''
  return segment.slice(-MAX_COMPLETION_PREFIX_LENGTH).trimEnd()
}

const createSegmenter = (granularity: Intl.SegmenterOptions['granularity']) =>
  typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity }) : null

const wordSegmenter = createSegmenter('word')
const sentenceSegmenter = createSegmenter('sentence')
const graphemeSegmenter = createSegmenter('grapheme')

const fallbackSegments = (text: string) => {
  const result: Array<{ index: number; segment: string }> = []
  let index = 0
  for (const character of text) {
    result.push({ index, segment: character })
    index += character.length
  }
  return result
}

const graphemes = (text: string) =>
  graphemeSegmenter ? [...graphemeSegmenter.segment(text)] : fallbackSegments(text)

const wordTokens = (text: string): DocumentCompletionToken[] => {
  if (!wordSegmenter) {
    return fallbackSegments(text)
      .filter(({ segment }) => isSearchableSymbol(segment))
      .map(({ index, segment }) => ({
        end: index + segment.length,
        kind: /[\p{L}\p{N}\p{M}]/u.test(segment) ? 'word' : 'symbol',
        normalized: normalizeCompletionSearchKey(segment),
        start: index,
        text: segment,
      }))
  }

  const tokens: DocumentCompletionToken[] = []
  for (const part of wordSegmenter.segment(text)) {
    if (!part.isWordLike && !isSearchableSymbol(part.segment)) continue
    tokens.push({
      end: part.index + part.segment.length,
      kind: part.isWordLike ? 'word' : 'symbol',
      normalized: normalizeCompletionSearchKey(part.segment),
      start: part.index,
      text: part.segment,
    })
  }
  return tokens
}

const cjkNgrams = (text: string): DocumentCompletionToken[] => {
  const result: DocumentCompletionToken[] = []
  let run: Array<{ index: number; segment: string }> = []
  const flush = () => {
    for (const size of [2, 3]) {
      for (let index = 0; index + size <= run.length; index += 1) {
        const parts = run.slice(index, index + size)
        const first = parts[0]
        const last = parts.at(-1)
        if (!first || !last) continue
        const raw = parts.map(({ segment }) => segment).join('')
        result.push({
          end: last.index + last.segment.length,
          kind: 'cjk-ngram',
          normalized: normalizeCompletionSearchKey(raw),
          start: first.index,
          text: raw,
        })
      }
    }
    run = []
  }

  for (const part of graphemes(text)) {
    if (isHan(part.segment)) run.push(part)
    else flush()
  }
  flush()
  return result
}

const sentenceSegments = (text: string): DocumentCompletionSentence[] => {
  if (sentenceSegmenter) {
    return [...sentenceSegmenter.segment(text)].map(({ index, segment }) => ({
      end: index + segment.length,
      start: index,
      text: segment,
    }))
  }

  const result: DocumentCompletionSentence[] = []
  let start = 0
  for (const part of graphemes(text)) {
    if (!'.!?。！？'.includes(part.segment)) continue
    const end = part.index + part.segment.length
    result.push({ end, start, text: text.slice(start, end) })
    start = end
  }
  if (start < text.length) result.push({ end: text.length, start, text: text.slice(start) })
  return result
}

export const createDocumentCompletionTokenizer = (): DocumentCompletionTokenizer => ({
  analyze: (text) => {
    const tokens = [...wordTokens(text), ...cjkNgrams(text)]
    const searchKeys = [...new Set(tokens.map(({ normalized }) => normalized).filter(Boolean))]
    return { searchKeys, sentences: sentenceSegments(text), tokens }
  },
})

export const documentCompletionTokenizer = createDocumentCompletionTokenizer()
