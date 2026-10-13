import { useRef, useState } from 'react'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import { SyncCenterPopover } from '@/features/workspace-sync/SyncCenterPopover'
import { WorkspaceSyncBindingDialog } from '@/features/workspace-sync/WorkspaceSyncBindingDialog'
import { WorkspaceSyncConflictsDialog } from '@/features/workspace-sync/WorkspaceSyncConflictsDialog'
import type { useWorkspaceSyncStatus } from '@/features/workspace-sync/useWorkspaceSyncStatus'

type Props = { rootPath: string; status: ReturnType<typeof useWorkspaceSyncStatus> }

export const WorkspaceSyncStatusControl = ({ rootPath, status }: Props) => {
  const [dialog, setDialog] = useState<'binding' | 'conflicts' | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useNativeSurfaceOcclusion('statusbar-sync-binding-dialog', dialog === 'binding', {
    blocksCommandPalette: true,
  })
  const closeDialog = (open: boolean) => {
    if (open) return
    setDialog(null)
    window.setTimeout(() => triggerRef.current?.focus(), 0)
  }
  return (
    <>
      <SyncCenterPopover
        {...status}
        triggerRef={triggerRef}
        onConfigure={() => setDialog('binding')}
        onReviewConflicts={() => setDialog('conflicts')}
      />
      {dialog === 'binding' ? (
        <WorkspaceSyncBindingDialog rootPath={rootPath} open onOpenChange={closeDialog} />
      ) : null}
      {dialog === 'conflicts' ? (
        <WorkspaceSyncConflictsDialog rootPath={rootPath} open onOpenChange={closeDialog} />
      ) : null}
    </>
  )
}
