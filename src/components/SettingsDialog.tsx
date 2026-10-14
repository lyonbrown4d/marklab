import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'
import { useIsMobile } from '@/hooks/use-mobile'
import { useI18n } from '@/i18n/useI18n'
import {
  SettingsDialogLoadingPanel,
  settingsDialogContentClassName,
  settingsScrollViewportClassName,
} from '@/components/settings/SettingsDialogLoading'
import { SettingsSearch } from '@/components/settings/SettingsSearch'
import {
  settingsGroups,
  settingsRoutes,
  type SettingsRouteId,
  type SettingsSelection,
} from '@/components/settings/settingsRoutes'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialSelection?: SettingsSelection
}

const defaultRoute: SettingsRouteId = 'general'

const SettingsDialog = ({ open, onOpenChange, initialSelection }: SettingsDialogProps) => {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [route, setRoute] = useState<SettingsRouteId>(initialSelection?.route ?? defaultRoute)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTargetId, setSearchTargetId] = useState<string | null>(
    initialSelection?.targetId ?? null,
  )
  const tabsListRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const section = settingsRoutes.some((entry) => entry.value === route) ? route : defaultRoute
  const activeRoute = useMemo(
    () => settingsRoutes.find((entry) => entry.value === section) ?? settingsRoutes[0]!,
    [section],
  )
  const contentReady = useDeferredOpenContent(open)

  const onSectionChange = useCallback((nextRoute: string) => {
    if (settingsRoutes.some((entry) => entry.value === nextRoute)) {
      setSearchTargetId(null)
      setRoute(nextRoute as SettingsRouteId)
    }
  }, [])

  const onSearchSelect = useCallback((nextRoute: SettingsRouteId, targetId: string) => {
    setSearchTargetId(targetId)
    setRoute(nextRoute)
  }, [])

  useEffect(() => {
    const activeTab = tabsListRef.current?.querySelector<HTMLElement>(
      `[data-settings-route="${section}"]`,
    )
    activeTab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [section])

  useEffect(() => {
    if (scrollViewportRef.current) scrollViewportRef.current.scrollTop = 0
  }, [section])

  useEffect(() => {
    if (!contentReady || !searchTargetId) return
    const target = document.getElementById(searchTargetId)
    if (!target || !scrollViewportRef.current?.contains(target)) return

    target.scrollIntoView({ block: 'center' })
    target.focus({ preventScroll: true })
    setSearchTargetId(null)
  }, [contentReady, searchTargetId, section])

  useEffect(() => {
    if (!open) return

    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ',') {
        event.preventDefault()
        searchInputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={settingsDialogContentClassName}
        onEscapeKeyDown={(event) => {
          if (!searchQuery) return
          event.preventDefault()
          setSearchQuery('')
          searchInputRef.current?.focus()
        }}
      >
        <DialogHeader className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 border-b border-border/60 px-4 py-3 pr-12 text-left md:grid-cols-[144px_minmax(0,1fr)]">
          <div>
            <DialogTitle className="text-sm font-semibold">{t('settings.title')}</DialogTitle>
            <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
          </div>
          <SettingsSearch
            inputRef={searchInputRef}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSelect={onSearchSelect}
          />
        </DialogHeader>
        <Tabs
          value={section}
          orientation={isMobile ? 'horizontal' : 'vertical'}
          onValueChange={onSectionChange}
          className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden md:grid-cols-[176px_minmax(0,1fr)] md:grid-rows-1"
        >
          <div className="min-h-0 min-w-0 overflow-hidden border-b border-border/60 bg-muted/20 md:border-b-0 md:border-r">
            <TabsList
              ref={tabsListRef}
              aria-label={t('settings.title')}
              className="settings-navigation flex h-auto max-h-full min-h-0 w-full flex-row items-stretch justify-start gap-1 overflow-x-auto overflow-y-hidden overscroll-contain rounded-none bg-transparent px-2 py-2 [scroll-padding:0.5rem] [scrollbar-width:thin] group-data-[orientation=horizontal]/tabs:h-auto group-data-[orientation=vertical]/tabs:h-full md:flex-col md:gap-0 md:overflow-x-hidden md:overflow-y-auto md:py-3 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5"
            >
              {settingsGroups.map((group) => {
                const routes = settingsRoutes.filter((entry) => entry.group === group.value)
                return (
                  <div
                    key={group.value}
                    className="contents md:mb-3 md:block md:shrink-0 md:last:mb-0"
                  >
                    <div className="hidden px-2 pb-1 text-[11px] font-medium text-muted-foreground md:block">
                      {t(group.labelKey)}
                    </div>
                    <div className="contents md:flex md:flex-col md:gap-0.5">
                      {routes.map((routeConfig) => {
                        const Icon = routeConfig.icon
                        const label = t(routeConfig.labelKey)
                        const isActive = section === routeConfig.value
                        return (
                          <TabsTrigger
                            key={routeConfig.value}
                            value={routeConfig.value}
                            aria-current={isActive ? 'page' : undefined}
                            data-settings-route={routeConfig.value}
                            title={label}
                            className="relative h-8 flex-none cursor-pointer justify-start gap-2 rounded-md border-0 px-2 text-[13px] text-muted-foreground shadow-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none md:w-full motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0"
                          >
                            <Icon aria-hidden="true" />
                            <span className="truncate">{label}</span>
                          </TabsTrigger>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </TabsList>
          </div>
          <div className="h-full min-h-0 min-w-0 overflow-hidden bg-card">
            <TabsContent value={section} className="m-0 h-full min-h-0 overflow-hidden">
              <div ref={scrollViewportRef} className={settingsScrollViewportClassName}>
                <header className="sticky top-0 z-10 border-b border-border/50 bg-card px-4 py-3 md:px-6">
                  <div
                    id={activeRoute.pageTargetId}
                    tabIndex={-1}
                    className="mx-auto w-full max-w-3xl rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <h2 className="text-sm font-semibold">{t(activeRoute.labelKey)}</h2>
                  </div>
                </header>
                <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-3 md:px-6">
                  {contentReady ? activeRoute.render() : <SettingsDialogLoadingPanel />}
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
