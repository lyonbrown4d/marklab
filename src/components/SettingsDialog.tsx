import {
  FileText,
  GitGraph,
  Keyboard,
  Palette,
  PenLine,
  Save,
  SlidersHorizontal,
} from 'lucide-react'
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
import EditingSettingsPage from '@/components/settings/EditingSettingsPage'
import FileSettingsPage from '@/components/settings/FileSettingsPage'
import SavingSettingsPage from '@/components/settings/SavingSettingsPage'
import ShortcutsSettingsPage from '@/components/settings/ShortcutsSettingsPage'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { type ReactElement, useCallback, useMemo, useState } from 'react'

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
    value: 'saving',
    labelKey: 'settings.saveBehavior',
    icon: Save,
    render: () => <SavingSettingsPage />,
  },
  {
    value: 'files',
    labelKey: 'settings.files',
    icon: FileText,
    render: () => <FileSettingsPage />,
  },
  {
    value: 'editing',
    labelKey: 'settings.editing',
    icon: PenLine,
    render: () => <EditingSettingsPage />,
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
      <DialogContent className="settings-dialog-surface max-w-none gap-0 overflow-hidden rounded-md p-0">
        <DialogHeader className="settings-dialog-header tab-strip border-b border-border/80 px-5 py-4">
          <DialogTitle className="settings-dialog-title flex items-center gap-2 text-base">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            {t('settings.title')}
          </DialogTitle>
          <DialogDescription className="settings-dialog-description">
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={section}
          onValueChange={onSectionChange}
          className="settings-dialog-body h-full min-h-0 overflow-hidden"
        >
          <TabsList className="settings-dialog-tabs flex h-full flex-col items-stretch justify-start rounded-none border-r border-border p-2">
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
          <div className="settings-dialog-panel-shell h-full min-h-0 min-w-0 overflow-hidden">
            <TabsContent value={section} className="m-0 h-full min-h-0 overflow-hidden">
              <div className="settings-scroll-viewport h-full min-h-0 overflow-y-auto overflow-x-hidden p-0">
                <div className="settings-dialog-panel mx-auto w-full max-w-3xl p-5">
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
