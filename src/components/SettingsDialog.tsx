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
} from '@/components/settings/SettingsDialogLoading'
import { SettingsSearch } from '@/components/settings/SettingsSearch'
import {
  settingsGroups,
  settingsRoutes,
  type SettingsRouteId,
} from '@/components/settings/settingsRoutes'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const defaultRoute: SettingsRouteId = 'general'

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [route, setRoute] = useState<SettingsRouteId>(defaultRoute)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchTargetId, setSearchTargetId] = useState<string | null>(null)
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
        <DialogHeader className="grid grid-cols-1 items-center gap-3 border-b px-5 py-4 pr-14 text-left md:grid-cols-[176px_minmax(0,1fr)]">
          <div>
            <DialogTitle className="text-base font-semibold">{t('settings.title')}</DialogTitle>
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
          className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[196px_minmax(0,1fr)] md:grid-rows-1"
        >
          <TabsList
            ref={tabsListRef}
            aria-label={t('settings.title')}
            className="settings-dialog-tabs flex h-auto flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-none border-b bg-muted/20 px-3 py-2 md:h-full md:flex-col md:gap-0 md:overflow-x-hidden md:overflow-y-auto md:border-b-0 md:border-r md:px-3 md:py-4"
          >
            {settingsGroups.map((group) => {
              const routes = settingsRoutes.filter((entry) => entry.group === group.value)
              return (
                <div key={group.value} className="contents md:mb-4 md:block md:last:mb-0">
                  <div className="hidden px-2 pb-1.5 text-[11px] font-medium text-muted-foreground md:block">
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
                          className="settings-dialog-tab-trigger relative h-9 flex-none cursor-pointer justify-start gap-2 rounded-md border-0 px-2.5 text-muted-foreground shadow-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-none md:w-full md:data-[state=active]:before:absolute md:data-[state=active]:before:-left-3 md:data-[state=active]:before:h-5 md:data-[state=active]:before:w-0.5 md:data-[state=active]:before:rounded-full md:data-[state=active]:before:bg-primary motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0"
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
          <div className="h-full min-h-0 min-w-0 overflow-hidden bg-card">
            <TabsContent value={section} className="m-0 h-full min-h-0 overflow-hidden">
              <div
                ref={scrollViewportRef}
                className="settings-scroll-viewport h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin]"
              >
                <header className="sticky top-0 z-10 border-b bg-card/95 px-5 py-5 backdrop-blur-sm md:px-8">
                  <div
                    id={activeRoute.pageTargetId}
                    tabIndex={-1}
                    className="mx-auto flex w-full max-w-3xl items-start gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <activeRoute.icon
                      aria-hidden="true"
                      className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                    />
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold tracking-tight">
                        {t(activeRoute.labelKey)}
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        {t(activeRoute.descriptionKey)}
                      </p>
                    </div>
                  </div>
                </header>
                <div className="mx-auto min-h-full w-full max-w-3xl px-5 pb-10 pt-6 md:px-8">
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
