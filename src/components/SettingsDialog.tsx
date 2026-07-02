import {
  FileText,
  GitGraph,
  Keyboard,
  Palette,
  PenLine,
  Save,
  SlidersHorizontal,
} from 'lucide-react'
import { type ReactElement, useCallback, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useI18n } from '@/i18n/useI18n'
import AppearanceSettingsPage from '@/components/settings/AppearanceSettingsPage'
import EditingSettingsPage from '@/components/settings/EditingSettingsPage'
import FileSettingsPage from '@/components/settings/FileSettingsPage'
import GeneralSettingsPage from '@/components/settings/GeneralSettingsPage'
import GraphSettingsPage from '@/components/settings/GraphSettingsPage'
import SavingSettingsPage from '@/components/settings/SavingSettingsPage'
import ShortcutsSettingsPage from '@/components/settings/ShortcutsSettingsPage'

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
  const [route, setRoute] = useState(settingsRoutes[0]?.value ?? 'general')
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

  const onSectionChange = useCallback((nextRoute: string) => {
    setRoute(nextRoute)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[calc(100vh-1.5rem)] max-h-[calc(100vh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-md border border-border bg-card p-0 text-card-foreground shadow-[0_16px_40px_-30px_hsl(var(--foreground)/0.34)] sm:h-[min(740px,calc(100vh-2rem))] sm:max-h-[calc(100vh-2rem)] sm:w-[min(960px,calc(100vw-2rem))]">
        <DialogHeader className="border-b border-border/80 bg-card px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base tracking-[0.01em]">
            <SlidersHorizontal className="size-4 text-primary" aria-hidden="true" />
            {t('settings.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={section}
          onValueChange={onSectionChange}
          className="grid h-full min-h-0 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-card sm:grid-cols-[176px_minmax(0,1fr)] sm:grid-rows-1"
        >
          <TabsList
            aria-label={t('settings.title')}
            className="flex h-auto flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-none border-b border-border bg-muted/30 p-2 sm:h-full sm:flex-col sm:border-b-0 sm:border-r"
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
                  title={label}
                  className="relative flex-none cursor-pointer justify-start gap-2 rounded-md border border-transparent text-muted-foreground transition-[background-color,color,border-color,box-shadow] before:absolute before:left-1 before:top-1/2 before:h-4 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:bg-transparent hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=active]:border-border/80 data-[state=active]:bg-background/80 data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:before:bg-primary [&_svg]:size-4 [&_svg]:shrink-0"
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
                <div className="mx-auto min-h-full w-full max-w-3xl p-5">
                  {activeRoute.render()}
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
