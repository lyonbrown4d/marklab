import type { Logger } from '@electron/services/logger.js'
import type { BackgroundTaskStatus } from '@electron/services/workspace/types.js'
import { errorMessage } from '@electron/services/workspace/workspaceUtils.js'

type SetTask = (
  id: string,
  label: string,
  status: BackgroundTaskStatus['status'],
  message: string | null,
) => void

export type SearchIndexTaskState = {
  runs: number
}

export const initializeWorkspaceBackgroundTasks = (setTask: SetTask): void => {
  setTask('search-index', 'Search index', 'idle', null)
  setTask('buffer-flush', 'Save queue', 'idle', null)
  setTask('watcher', 'Workspace watcher', 'idle', null)
}

type RunSearchIndexTaskOptions<T> = {
  getStatus: () => BackgroundTaskStatus['status'] | null | undefined
  logger: Logger
  setTask: SetTask
  state: SearchIndexTaskState
  taskName: string
  work: () => Promise<T>
}

export const runSearchIndexTask = <T>({
  getStatus,
  logger,
  setTask,
  state,
  taskName,
  work,
}: RunSearchIndexTaskOptions<T>): Promise<T> => {
  let failed = false
  state.runs += 1
  logger.info('search index task started', { task: taskName, activeRuns: state.runs })
  setTask('search-index', 'Search index', 'running', null)

  return Promise.resolve()
    .then(work)
    .catch((taskError: unknown) => {
      failed = true
      setTask('search-index', 'Search index', 'error', errorMessage(taskError))
      logger.error('search index task failed', { task: taskName, error: taskError })
      throw taskError
    })
    .finally(() => {
      state.runs -= 1
      logger.info('search index task finished', { task: taskName, activeRuns: state.runs })
      if (state.runs === 0 && !failed && getStatus() !== 'error') {
        setTask('search-index', 'Search index', 'idle', null)
      }
    })
}

export const runWorkerTask = <T>(
  task: () => Promise<T>,
  taskName: string,
  logger: Logger,
): Promise<T> => {
  return Promise.resolve()
    .then(task)
    .catch((error: unknown) => {
      logger.error('workspace analysis worker failed', {
        error,
        task: taskName,
      })
      throw error
    })
}
