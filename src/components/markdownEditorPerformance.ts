export type MarkdownEditorPerformancePolicy = {
  diagnostics: 'full' | 'disabled'
  deferInitialMount: boolean
  updateThrottleMs: number
}

const FULL_DIAGNOSTICS_MAX_CHARS = 500_000
const DEFERRED_MOUNT_MIN_CHARS = 750_000
const VERY_LARGE_DOCUMENT_MIN_CHARS = 4_000_000

export const markdownEditorPerformancePolicy = (
  contentLength: number,
): MarkdownEditorPerformancePolicy => {
  const normalizedLength = Math.max(0, contentLength)
  return {
    diagnostics: normalizedLength <= FULL_DIAGNOSTICS_MAX_CHARS ? 'full' : 'disabled',
    deferInitialMount: normalizedLength >= DEFERRED_MOUNT_MIN_CHARS,
    updateThrottleMs:
      normalizedLength >= VERY_LARGE_DOCUMENT_MIN_CHARS
        ? 650
        : normalizedLength >= DEFERRED_MOUNT_MIN_CHARS
          ? 350
          : 200,
  }
}

export const waitForMarkdownEditorMount = (contentLength: number): Promise<void> | undefined => {
  if (!markdownEditorPerformancePolicy(contentLength).deferInitialMount) return undefined
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
