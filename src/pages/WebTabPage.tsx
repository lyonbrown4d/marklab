import { Navigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { useNativeSurfaceOccluded } from '@/app/nativeSurfaceOcclusion'
import WebTabSurface from '@/pages/web/WebTabSurface'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { WorkspaceTab } from '@/store/appTypes'

type WebTab = Extract<WorkspaceTab, { kind: 'web' }>

const WebTabPage = () => {
  const { tabId } = useParams<{ tabId: string }>()
  const onCloseActiveTab = useLayoutContext((state) => state.onCloseActiveTab)
  const tab = useWorkspaceStore(
    useShallow((state) => ({
      tab:
        state.tabs.find((item): item is WebTab => item.kind === 'web' && item.id === tabId) ?? null,
    })),
  ).tab
  const suspended = useNativeSurfaceOccluded()

  if (!tabId || !tab) {
    return <Navigate replace to="/" />
  }

  return <WebTabSurface key={tab.id} suspended={suspended} tab={tab} onClose={onCloseActiveTab} />
}

export default WebTabPage
