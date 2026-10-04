import { useCallback } from 'react'
import { AlertTriangle, Globe2, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspaceTab } from '@/store/appTypes'
import { useWebTabActions } from '@/pages/web/useWebTabActions'
import { useWebTabNativeView } from '@/pages/web/useWebTabNativeView'
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
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <span className="relative flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background shadow-sm">
                <Globe2 aria-hidden className="size-4" />
                <LoaderCircle
                  aria-hidden
                  className="absolute -right-1 -top-1 size-3.5 animate-spin text-primary motion-reduce:animate-none"
                />
              </span>
              <span className="text-xs">{t('webTab.loading')}</span>
            </div>
          ) : null}
          {failed ? (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div
                className="max-w-sm rounded-xl border border-destructive/25 bg-background p-5 text-center shadow-sm"
                role="alert"
              >
                <AlertTriangle aria-hidden className="mx-auto size-5 text-destructive" />
                <p className="mt-3 text-sm font-semibold">{t('webTab.failed')}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {nativeState.error?.description ?? t('webTab.failedHint')}
                </p>
                <Button
                  className="mt-4"
                  size="sm"
                  variant="outline"
                  onClick={() => void Promise.resolve(actions.reload()).catch(() => undefined)}
                >
                  {t('webTab.retry')}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default WebTabSurface
