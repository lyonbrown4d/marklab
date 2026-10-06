import MarkdownIt from 'markdown-it'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { DiagnosticSeverity } from 'vscode-languageserver-types'
import {
  createLanguageService,
  DiagnosticCode,
  DiagnosticLevel,
  githubSlugifier,
  LogLevel,
  type IMdParser,
  type ITextDocument,
  type IWorkspace,
  type Token,
} from 'vscode-markdown-languageservice'

import type { FsMarkdownDiagnostic } from '@electron/services/workspace/types'

type MicrosoftDiagnosticsRequest = {
  path: string
  content: string
}

type MicrosoftDiagnosticsOptions = {
  signal?: AbortSignal
}

type DiagnosticsCancellationToken = Parameters<
  ReturnType<typeof createLanguageService>['computeDiagnostics']
>[2]

const enabledDiagnosticCodes = new Set<string>([
  DiagnosticCode.link_noSuchReferences,
  DiagnosticCode.link_unusedDefinition,
  DiagnosticCode.link_duplicateDefinition,
])

const markdownIt = new MarkdownIt({ html: true, linkify: true })

const parser: IMdParser = {
  slugifier: githubSlugifier,
  async tokenize(document: ITextDocument): Promise<Token[]> {
    return markdownIt.parse(document.getText(), {}) as unknown as Token[]
  },
}

export const computeMicrosoftReferenceDiagnostics = async (
  { content, path }: MicrosoftDiagnosticsRequest,
  options: MicrosoftDiagnosticsOptions = {},
): Promise<FsMarkdownDiagnostic[]> => {
  throwIfAborted(options.signal)
  const document = TextDocument.create(virtualDocumentUri(path), 'markdown', 1, content)
  const service = createLanguageService({
    logger: { level: LogLevel.Off, log: () => undefined },
    parser,
    workspace: requestWorkspace(document),
  })

  try {
    const diagnostics = await service.computeDiagnostics(
      document,
      {
        ignoreLinks: [],
        validateDuplicateLinkDefinitions: DiagnosticLevel.warning,
        validateFileLinks: DiagnosticLevel.ignore,
        validateFragmentLinks: DiagnosticLevel.ignore,
        validateMarkdownFileLinkFragments: DiagnosticLevel.ignore,
        validateReferences: DiagnosticLevel.warning,
        validateUnusedLinkDefinitions: DiagnosticLevel.warning,
      },
      cancellationToken(options.signal),
    )
    throwIfAborted(options.signal)

    return sortAndDedupeDiagnostics(
      diagnostics
        .filter(
          (diagnostic) =>
            enabledDiagnosticCodes.has(String(diagnostic.code ?? '')) &&
            !isInsideWikiLink(document, diagnostic.range.start),
        )
        .map((diagnostic) => ({
          end_column: Math.max(
            diagnostic.range.start.character + 2,
            diagnostic.range.end.character + 1,
          ),
          line: diagnostic.range.start.line + 1,
          message:
            typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
          severity:
            diagnostic.severity === DiagnosticSeverity.Error
              ? ('error' as const)
              : ('warning' as const),
          start_column: diagnostic.range.start.character + 1,
        })),
    )
  } finally {
    service.dispose()
  }
}

const requestWorkspace = (document: ITextDocument): IWorkspace => ({
  workspaceFolders: [],
  onDidChangeMarkdownDocument: emptyEvent,
  onDidCreateMarkdownDocument: emptyEvent,
  onDidDeleteMarkdownDocument: emptyEvent,
  getAllMarkdownDocuments: async () => [document],
  hasMarkdownDocument: (resource) => resource.toString() === document.uri,
  openMarkdownDocument: async (resource) =>
    resource.toString() === document.uri ? document : undefined,
  readDirectory: async () => [],
  stat: async () => undefined,
})

const emptyEvent = () => ({ dispose: () => undefined })

const cancellationToken = (signal?: AbortSignal): DiagnosticsCancellationToken => {
  const onCancellationRequested: DiagnosticsCancellationToken['onCancellationRequested'] = (
    listener,
    thisArgs,
    disposables,
  ) => {
    const callback = () => listener.call(thisArgs, undefined)
    if (signal) signal.addEventListener('abort', callback, { once: true })
    const disposable = {
      dispose: () => signal?.removeEventListener('abort', callback),
    }
    disposables?.push(disposable)
    return disposable
  }

  return {
    get isCancellationRequested() {
      return signal?.aborted ?? false
    },
    onCancellationRequested,
  }
}

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return
  const error = new Error('Markdown diagnostics request was cancelled')
  error.name = 'AbortError'
  throw error
}

const virtualDocumentUri = (path: string): string => {
  const encodedPath = path
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map(encodeURIComponent)
    .join('/')
  return `file:///marklab-workspace/${encodedPath || 'document.md'}`
}

const isInsideWikiLink = (
  document: ITextDocument,
  position: { line: number; character: number },
): boolean => {
  const lineStart = document.offsetAt({ character: 0, line: position.line })
  const lineEnd = document.offsetAt({ character: Number.MAX_SAFE_INTEGER, line: position.line })
  const lineText = document.getText().slice(lineStart, lineEnd)
  const open = lineText.lastIndexOf('[[', position.character)
  if (open < 0) return false
  const close = lineText.indexOf(']]', open + 2)
  return close >= position.character
}

const sortAndDedupeDiagnostics = (diagnostics: FsMarkdownDiagnostic[]): FsMarkdownDiagnostic[] => {
  const unique = new Map<string, FsMarkdownDiagnostic>()
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.line,
      diagnostic.start_column,
      diagnostic.end_column,
      diagnostic.severity,
      diagnostic.message,
    ].join('\u0000')
    unique.set(key, diagnostic)
  }
  return [...unique.values()].sort(compareDiagnostics)
}

const compareDiagnostics = (left: FsMarkdownDiagnostic, right: FsMarkdownDiagnostic): number =>
  left.line - right.line ||
  left.start_column - right.start_column ||
  left.end_column - right.end_column ||
  left.severity.localeCompare(right.severity) ||
  left.message.localeCompare(right.message)
