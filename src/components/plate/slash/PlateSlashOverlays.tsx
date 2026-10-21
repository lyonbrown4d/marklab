import type { MarkdownLinkCompletionClient } from '@/components/editor/markdownLinkCompletionSession'
import { PlateSlashMenu } from '@/components/plate/slash/PlateSlashMenu'
import { PlateSlashUrlInput } from '@/components/plate/slash/PlateSlashUrlInput'
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
    <PlateSlashUrlInput
      key={controller.urlInput.requestId}
      activePath={activePath}
      completionClient={completionClient}
      labels={labels}
      state={controller.urlInput}
    />
  </>
)
