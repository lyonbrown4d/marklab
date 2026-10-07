import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { Logger } from '@electron/services/logger'
import { mergeMarkdownDiagnostics } from '@electron/services/workspace/markdown/diagnostics'
import type { FsMarkdownDiagnostic, FsStateData } from '@electron/services/workspace/types'
import type { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient'
import type {
  MarkdownDocument,
  WorkspaceKnownPaths,
} from '@electron/services/workspace/workspaceAnalysisWorkerMessages'
import { trySidecarMarkdownDiagnostics } from '@electron/services/workspace/workspaceSidecarFileBridge'
import { stringArg } from '@electron/services/workspace/workspaceUtils'

type WorkspaceMarkdownAnalysisOptions = {
  knowledgeEngineService?: KnowledgeEngineService
  loadInput: (
    path: string,
    content: string,
  ) => Promise<{ documents: MarkdownDocument[]; knownPaths: WorkspaceKnownPaths }>
  logger: Logger
  runLocalTask: (work: () => Promise<FsMarkdownDiagnostic[]>) => Promise<FsMarkdownDiagnostic[]>
  state: FsStateData
  value: unknown
  worker: Pick<WorkspaceAnalysisWorkerClient, 'run'>
}

export const analyzeWorkspaceMarkdownBuffer = async (
  options: WorkspaceMarkdownAnalysisOptions,
): Promise<FsMarkdownDiagnostic[]> => {
  const path = stringArg(options.value, 'path')
  const content = stringArg(options.value, 'content')
  const { documents, knownPaths } = await options.loadInput(path, content)
  const [localDiagnostics, sidecarDiagnostics] = await Promise.all([
    options.runLocalTask(() =>
      options.worker.run<FsMarkdownDiagnostic[]>({
        type: 'markdown-diagnostics',
        documents,
        knownPaths,
        path,
      }),
    ),
    trySidecarMarkdownDiagnostics({
      content,
      knowledgeEngineService: options.knowledgeEngineService,
      logger: options.logger,
      path,
      state: options.state,
    }),
  ])
  return mergeMarkdownDiagnostics(localDiagnostics, sidecarDiagnostics)
}
