import PQueue from 'p-queue'

const MAX_PENDING_PREWARMS = 8
const prewarmQueue = new PQueue({ concurrency: 1 })

export const scheduleWorkspacePrewarm = <T>(task: () => Promise<T>): Promise<T> => {
  if (prewarmQueue.size >= MAX_PENDING_PREWARMS) {
    return Promise.reject(new Error('Workspace prewarm queue is full.'))
  }
  return prewarmQueue.add(task) as Promise<T>
}
