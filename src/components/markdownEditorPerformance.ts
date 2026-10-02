export type MarkdownEditorPerformancePolicy = {
  diagnostics: 'full' | 'disabled'
  deferInitialMount: boolean
  largeDocumentMode: boolean
  updateThrottleMs: number
  virtualizeDocument: boolean
}

const FULL_DIAGNOSTICS_MAX_CHARS = 500_000
const VIRTUALIZED_DOCUMENT_MIN_CHARS = 250_000
const DEFERRED_MOUNT_MIN_CHARS = 750_000
const VERY_LARGE_DOCUMENT_MIN_CHARS = 4_000_000
const LARGE_DOCUMENT_MIN_LINES = 2_000
const DEFERRED_MOUNT_MIN_LINES = 5_000
const VERY_LARGE_DOCUMENT_MIN_LINES = 10_000

const countLogicalLines = (content: string) => {
  let lines = 1
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) lines += 1
  }
  return lines
}

export const markdownEditorPerformancePolicy = (
  content: number | string,
): MarkdownEditorPerformancePolicy => {
  const normalizedLength = Math.max(0, typeof content === 'number' ? content : content.length)
  const lineCount = typeof content === 'string' ? countLogicalLines(content) : 1
  const largeDocumentMode =
    normalizedLength >= DEFERRED_MOUNT_MIN_CHARS || lineCount >= LARGE_DOCUMENT_MIN_LINES
  const deferInitialMount =
    normalizedLength >= DEFERRED_MOUNT_MIN_CHARS || lineCount >= DEFERRED_MOUNT_MIN_LINES
  const veryLargeDocument =
    normalizedLength >= VERY_LARGE_DOCUMENT_MIN_CHARS || lineCount >= VERY_LARGE_DOCUMENT_MIN_LINES
  const virtualizeDocument =
    normalizedLength >= VIRTUALIZED_DOCUMENT_MIN_CHARS || lineCount >= LARGE_DOCUMENT_MIN_LINES
  return {
    diagnostics:
      normalizedLength <= FULL_DIAGNOSTICS_MAX_CHARS && lineCount < LARGE_DOCUMENT_MIN_LINES
        ? 'full'
        : 'disabled',
    deferInitialMount,
    largeDocumentMode,
    updateThrottleMs: veryLargeDocument ? 650 : deferInitialMount ? 350 : 200,
    virtualizeDocument,
  }
}

export const waitForMarkdownEditorMount = (content: number | string): Promise<void> | undefined => {
  if (!markdownEditorPerformancePolicy(content).deferInitialMount) return undefined
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0))
}

const fixtureBlock = [
  '# Marklab performance fixture',
  '',
  'A deterministic paragraph with **bold**, _italic_, `code`, and [a link](notes.md).',
  '',
  '| Column A | Column B |',
  '| :--- | ---: |',
  '| Alpha | Beta |',
  '',
  '- Item one',
  '- Item two',
  '',
].join('\n')

export const createMarkdownPerformanceFixture = (size: number): string => {
  const targetSize = Math.max(0, Math.floor(size))
  if (targetSize === 0) return ''
  return fixtureBlock.repeat(Math.ceil(targetSize / fixtureBlock.length)).slice(0, targetSize)
}
