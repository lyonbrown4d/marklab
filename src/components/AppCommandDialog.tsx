import type { DialogProps } from '@radix-ui/react-dialog'
import { Command } from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n/useI18n'

const AppCommandDialog = ({ children, ...props }: DialogProps) => {
  const { t } = useI18n()

  return (
    <Dialog {...props}>
      <DialogContent
        aria-describedby={undefined}
        className="command-dialog-surface max-w-[780px] overflow-hidden rounded-md p-0"
      >
        <DialogTitle className="sr-only">{t('command.palette')}</DialogTitle>
        <Command
          loop
          className="command-dialog-command [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export default AppCommandDialog
