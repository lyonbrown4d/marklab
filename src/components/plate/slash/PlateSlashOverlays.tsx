import type { MarkdownLinkCompletionClient } from '@/components/editor/markdownLinkCompletionSession'
import { PlateSlashMenu } from '@/components/plate/slash/PlateSlashMenu'
import { PlateSlashUrlDialog } from '@/components/plate/slash/PlateSlashUrlDialog'
import type { PlateSlashCommandsController } from '@/components/plate/slash/usePlateSlashCommands'
import type { PlateSlashCommandLabels } from '@/components/plate/slash/types'

type PlateSlashOverlaysProps = {
  activePath: string | null
  completionClient?: MarkdownLinkCompletionClient | null
  controller: PlateSlashCommandsController
  labels: PlateSlashCommandLabels
}

export const PlateSlashOverlays = ({
  activePath,
  completionClient,
  controller,
  labels,
}: PlateSlashOverlaysProps) => (
  <>
    <PlateSlashMenu
      {...controller.menu}
      labels={labels}
      onDismiss={controller.dismiss}
      onSelect={controller.menu.selectCommand}
    />
    <PlateSlashUrlDialog
      activePath={activePath}
      completionClient={completionClient}
      labels={labels}
      state={controller.urlDialog}
    />
  </>
)
