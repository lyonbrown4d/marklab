import type { WindowWorkspaceBinding } from '@electron/services/workspace/windowWorkspaceBinding'
import type {
  WorkspaceShutdownBarrier,
  WorkspaceShutdownParticipant,
} from '@electron/services/workspace/workspaceShutdownBarrier'

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

export const flushWorkspaceBindingsForShutdown = async (
  bindings: WindowWorkspaceBinding[],
  barrier: Pick<WorkspaceShutdownBarrier, 'review'>,
  barrierId: number,
  participants: WorkspaceShutdownParticipant[],
): Promise<number> => {
  const results = await Promise.allSettled(bindings.map((binding) => binding.flushForShutdown()))
  const errors: Error[] = []

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') return
    errors.push(
      new Error(
        `Window ${bindings[index].window.id} failed to flush: ${errorMessage(result.reason)}`,
        { cause: result.reason },
      ),
    )
  })

  try {
    barrier.review(barrierId, participants)
  } catch (error) {
    errors.push(error instanceof Error ? error : new Error(String(error)))
  }

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Workspace shutdown flush did not reach a stable state')
  }
  return bindings.length
}
