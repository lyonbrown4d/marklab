import {
  FileText,
  GitGraph,
  Keyboard,
  Palette,
  PenLine,
  Save,
  SlidersHorizontal,
} from 'lucide-react'
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/i18n/useI18n'
import { useDeferredOpenContent } from '@/hooks/useDeferredOpenContent'
import { useIsMobile } from '@/hooks/use-mobile'
import AppearanceSettingsPage from '@/components/settings/AppearanceSettingsPage'
import EditingSettingsPage from '@/components/settings/EditingSettingsPage'
import FileSettingsPage from '@/components/settings/FileSettingsPage'
import GeneralSettingsPage from '@/components/settings/GeneralSettingsPage'
import GraphSettingsPage from '@/components/settings/GraphSettingsPage'
import SavingSettingsPage from '@/components/settings/SavingSettingsPage'
import ShortcutsSettingsPage from '@/components/settings/ShortcutsSettingsPage'
import {
  SettingsDialogLoadingPanel,
  settingsDialogContentClassName,
} from '@/components/settings/SettingsDialogLoading'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const settingsRoutes = [
  {
    value: 'general',
    labelKey: 'settings.general',
    icon: SlidersHorizontal,
    render: () => <GeneralSettingsPage />,
  },
  {
    value: 'appearance',
    labelKey: 'settings.appearance',
    icon: Palette,
    render: () => <AppearanceSettingsPage />,
  },
  {
    value: 'editing',
    labelKey: 'settings.editing',
    icon: PenLine,
    render: () => <EditingSettingsPage />,
  },
  {
    value: 'files',
    labelKey: 'settings.files',
    icon: FileText,
    render: () => <FileSettingsPage />,
  },
  {
    value: 'saving',
    labelKey: 'settings.saveBehavior',
    icon: Save,
    render: () => <SavingSettingsPage />,
  },
  {
    value: 'graph',
    labelKey: 'settings.graphEditor',
    icon: GitGraph,
    render: () => <GraphSettingsPage />,
  },
  {
    value: 'shortcuts',
    labelKey: 'settings.shortcuts',
    icon: Keyboard,
    render: () => <ShortcutsSettingsPage />,
  },
] satisfies Array<{
  value: string
  labelKey: string
  icon: typeof Save
  render: () => ReactElement
}>

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { t } = useI18n()
  const isMobile = useIsMobile()
  const [route, setRoute] = useState(settingsRoutes[0]?.value ?? 'general')
  const tabsListRef = useRef<HTMLDivElement | null>(null)
  const section = useMemo(() => {
    return (
      settingsRoutes.find((entry) => entry.value === route)?.value ??
      settingsRoutes[0]?.value ??
      'general'
    )
  }, [route])
  const activeRoute = useMemo(
    () => settingsRoutes.find((entry) => entry.value === section) ?? settingsRoutes[0],
    [section],
  )
  const contentReady = useDeferredOpenContent(open)

  const onSectionChange = useCallback((nextRoute: string) => {
    setRoute(nextRoute)
  }, [])

  useEffect(() => {
    const activeTab = tabsListRef.current?.querySelector<HTMLElement>(
      `[data-settings-route="${section}"]`,
    )
    if (typeof activeTab?.scrollIntoView === 'function') {
      activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [section])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={settingsDialogContentClassName}>
        <DialogHeader className="px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-sm font-medium">{t('settings.title')}</DialogTitle>
          <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <Tabs
          value={section}
          orientation={isMobile ? 'horizontal' : 'vertical'}
          onValueChange={onSectionChange}
          className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden md:grid-cols-[152px_minmax(0,1fr)] md:grid-rows-1"
        >
          <TabsList
            ref={tabsListRef}
            aria-label={t('settings.title')}
            className="settings-dialog-tabs flex h-auto flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-none bg-transparent px-3 pb-3 md:h-full md:flex-col md:overflow-x-hidden md:overflow-y-auto"
          >
            {settingsRoutes.map((routeConfig) => {
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
                  className="settings-dialog-tab-trigger h-9 flex-none cursor-pointer justify-start gap-2 rounded-md border-0 px-3 text-muted-foreground shadow-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0"
                >
                  <Icon aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
          <div className="h-full min-h-0 min-w-0 overflow-hidden bg-card">
            <TabsContent value={section} className="m-0 h-full min-h-0 overflow-hidden">
              <div
                key={section}
                className="settings-scroll-viewport h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-0 [scrollbar-gutter:stable] [scrollbar-width:thin]"
              >
                <div className="mx-auto min-h-full w-full max-w-2xl px-5 pb-8 pt-2 md:px-7">
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
