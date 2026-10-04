import { useCallback } from 'react'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspaceTab } from '@/store/appTypes'
import { useWebTabActions } from '@/pages/web/useWebTabActions'
import { useWebTabNativeView } from '@/pages/web/useWebTabNativeView'
import { WebTabStatusOverlay } from '@/pages/web/WebTabStatusOverlay'
import { WebTabToolbar } from '@/pages/web/WebTabToolbar'
import { useOpenWebTab } from '@/app/useOpenWebTab'
import { useNativeSurfaceInsetsStore } from '@/app/nativeSurfaceInsets'
import { cn } from '@/lib/utils'

type WebTab = Extract<WorkspaceTab, { kind: 'web' }>

type WebTabSurfaceProps = {
  suspended: boolean
  tab: WebTab
  onClose?: () => void
}

const WebTabSurface = ({ suspended, tab, onClose }: WebTabSurfaceProps) => {
  const { t } = useI18n()
  const openWebTab = useOpenWebTab()
  const openRequestedTab = useCallback(
    (url: string) => openWebTab(url, t('webTab.newTab')),
    [openWebTab, t],
  )
  const { hostRef, state: nativeState } = useWebTabNativeView({
    onOpenRequested: openRequestedTab,
    suspended,
    tab,
  })
  const actions = useWebTabActions(tab.id)
  const nativeInsets = useNativeSurfaceInsetsStore()
  const loading = nativeState.status === 'idle' || nativeState.status === 'loading'
  const failed = nativeState.status === 'error' || nativeState.status === 'crashed'
  const close = useCallback(() => {
    if (onClose) return onClose()
    return actions.close()
  }, [actions, onClose])
  const navigate = useCallback((url: string) => actions.navigate(url), [actions])

  return (
    <section className="flex h-full min-h-0 flex-col bg-background pt-11">
      <WebTabToolbar
        canGoBack={nativeState.canGoBack}
        canGoForward={nativeState.canGoForward}
        loading={loading}
        url={nativeState.url}
        onBack={actions.goBack}
        onClose={close}
        onForward={actions.goForward}
        onNavigate={navigate}
        onReload={actions.reload}
        onStop={actions.stop}
      />
      <div
        className={cn(
          'min-h-0 flex-1',
          nativeInsets.leftDrawerOpen && 'pl-[min(22rem,88vw)]',
          nativeInsets.rightDrawerOpen && 'pr-[min(22rem,88vw)]',
        )}
        style={{ paddingBottom: nativeInsets.toastHeight }}
      >
        <div
          ref={hostRef}
          aria-busy={loading}
          className="relative ml-5 h-full min-h-0 overflow-hidden bg-muted/15"
          data-native-active={nativeState.active}
          data-native-status={nativeState.status}
          data-testid="web-tab-native-host"
        >
          <WebTabStatusOverlay
            errorDescription={nativeState.error?.description}
            failed={failed}
            loading={loading}
            onRetry={() => void Promise.resolve(actions.reload()).catch(() => undefined)}
          />
        </div>
      </div>
    </section>
  )
}

export default WebTabSurface
