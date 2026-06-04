import { GitGraph, Keyboard, Palette, Save, SlidersHorizontal } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n/useI18n'
import AppearanceSettingsPage from '@/components/settings/AppearanceSettingsPage'
import GeneralSettingsPage from '@/components/settings/GeneralSettingsPage'
import GraphSettingsPage from '@/components/settings/GraphSettingsPage'
import ShortcutsSettingsPage from '@/components/settings/ShortcutsSettingsPage'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMemo, useState } from 'react'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const settingsRoutes = [
  {
    value: 'general',
    labelKey: 'settings.general',
    icon: Save,
    render: () => <GeneralSettingsPage />,
  },
  {
    value: 'appearance',
    labelKey: 'settings.appearance',
    icon: Palette,
    render: () => <AppearanceSettingsPage />,
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
  render: () => JSX.Element
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

  const onSectionChange = (nextRoute: string) => {
    setRoute(nextRoute)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog-surface max-w-none gap-0 overflow-hidden rounded-md p-0">
        <DialogHeader className="tab-strip border-b border-border/80 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            {t('settings.title')}
          </DialogTitle>
          <DialogDescription>{t('settings.description')}</DialogDescription>
        </DialogHeader>
        <Tabs
          value={section}
          onValueChange={onSectionChange}
          className="settings-dialog-body h-full min-h-0 overflow-hidden"
        >
          <TabsList className="settings-dialog-tabs flex h-full flex-col items-stretch justify-start rounded-none border-r border-border bg-muted/35 p-2">
            {settingsRoutes.map((routeConfig) => {
              const Icon = routeConfig.icon
              return (
                <TabsTrigger
                  key={routeConfig.value}
                  value={routeConfig.value}
                  className="settings-dialog-tab-trigger justify-start gap-2 rounded-md"
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{t(routeConfig.labelKey)}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
          <div className="h-full min-h-0 min-w-0 overflow-hidden">
            {settingsRoutes.map((routeConfig) => (
              <TabsContent
                key={routeConfig.value}
                value={routeConfig.value}
                className="m-0 min-h-0 h-full overflow-hidden"
              >
                <div className="settings-scroll-viewport h-full min-h-0 overflow-y-auto overflow-x-hidden p-0">
                  <div className="settings-dialog-panel mx-auto w-full max-w-3xl p-5">
                    {routeConfig.render()}
                  </div>
                </div>
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
