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

type RunSearchIndexTaskOptions<T> = {
  fallback?: (() => Promise<T> | T) | null
  getStatus: () => BackgroundTaskStatus['status'] | null | undefined
  logger: Logger
  setTask: SetTask
  state: SearchIndexTaskState
  taskName: string
  work: () => Promise<T>
}

export const runSearchIndexTask = <T>({
  fallback = null,
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
    .catch(async (taskError: unknown) => {
      if (!fallback) {
        failed = true
        setTask('search-index', 'Search index', 'error', errorMessage(taskError))
        logger.error('search index task failed', { task: taskName, error: taskError })
        throw taskError
      }

      logger.warn('search index task failed; using fallback', { task: taskName, error: taskError })
      try {
        return await fallback()
      } catch (fallbackError) {
        failed = true
        setTask('search-index', 'Search index', 'error', errorMessage(fallbackError))
        logger.error('search index fallback failed', { task: taskName, error: fallbackError })
        throw fallbackError
      }
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
  fallback: () => Promise<T> | T,
  taskName: string,
  logger: Logger,
): Promise<T> => {
  return Promise.resolve()
    .then(task)
    .catch((error: unknown) => {
      logger.warn('workspace analysis worker failed; using main-thread fallback', {
        error,
        task: taskName,
      })
      return fallback()
    })
}
