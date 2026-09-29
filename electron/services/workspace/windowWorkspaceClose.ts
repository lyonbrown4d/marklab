import type { WindowWorkspaceBinding } from '@electron/services/workspace/windowWorkspaceBinding.js'

export const flushWindowWorkspaceBindingForClose = async (
  binding: WindowWorkspaceBinding,
): Promise<void> => {
  await binding.mutationGate.freezeAndDrain('window close')
  const epoch = binding.service.bufferMutationEpoch()
  try {
    await binding.flushForShutdown()
    if (binding.service.bufferMutationEpoch() !== epoch) {
      throw new Error('Workspace changed while its window was closing')
    }
    if (binding.service.hasDirtyBuffers()) {
      throw new Error('Workspace buffers remained dirty after window close flush')
    }
  } finally {
    binding.mutationGate.unfreeze()
  }
}
