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
import SettingsShell from '@/components/settings/SettingsShell'
import ShortcutsSettingsPage from '@/components/settings/ShortcutsSettingsPage'

type SettingsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SettingsDialog = ({ open, onOpenChange }: SettingsDialogProps) => {
  const { t } = useI18n()

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

        <SettingsShell
          defaultValue="general"
          sections={[
            {
              value: 'general',
              label: t('settings.general'),
              icon: Save,
              content: <GeneralSettingsPage />,
            },
            {
              value: 'appearance',
              label: t('settings.appearance'),
              icon: Palette,
              content: <AppearanceSettingsPage />,
            },
            {
              value: 'graph',
              label: t('settings.graphEditor'),
              icon: GitGraph,
              content: <GraphSettingsPage />,
            },
            {
              value: 'shortcuts',
              label: t('settings.shortcuts'),
              icon: Keyboard,
              content: <ShortcutsSettingsPage />,
            },
          ]}
        />
      </DialogContent>
    </Dialog>
  )
}

export default SettingsDialog
