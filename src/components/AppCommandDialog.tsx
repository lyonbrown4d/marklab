import type { DialogProps } from '@radix-ui/react-dialog'
import { useRef } from 'react'
import { defaultFilter } from 'cmdk'
import { parseCommandSearchScope } from '@/components/command/commandSearchScope'
import { Command } from '@/components/ui/command'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/i18n/useI18n'

type EditorSelection = {
  anchorNode: Node
  anchorOffset: number
  focusNode: Node
  focusOffset: number
}

const isValidSelectionPoint = (node: Node, offset: number) =>
  offset <=
  (node.nodeType === Node.TEXT_NODE ? (node.textContent?.length ?? 0) : node.childNodes.length)

const filterCommand = (value: string, search: string, keywords?: string[]) =>
  defaultFilter(value, parseCommandSearchScope(search).query, keywords)

const AppCommandDialog = ({ children, ...props }: DialogProps) => {
  const { t } = useI18n()
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const returnSelectionRef = useRef<EditorSelection | null>(null)

  return (
    <Dialog {...props}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={() => {
          returnFocusRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          const target = returnFocusRef.current
          const selection = document.getSelection()
          returnSelectionRef.current =
            selection?.anchorNode &&
            selection.focusNode &&
            target?.isContentEditable &&
            target.contains(selection.anchorNode) &&
            target.contains(selection.focusNode)
              ? {
                  anchorNode: selection.anchorNode,
                  anchorOffset: selection.anchorOffset,
                  focusNode: selection.focusNode,
                  focusOffset: selection.focusOffset,
                }
              : null
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const target = returnFocusRef.current
          if (!target?.isConnected) return

          // A selected command may already have focused another editor or dialog.
          const active = document.activeElement
          const closingDialog = event.currentTarget
          if (
            active instanceof HTMLElement &&
            active !== document.body &&
            active !== document.documentElement &&
            !(closingDialog instanceof HTMLElement && closingDialog.contains(active))
          ) {
            return
          }
          target.focus({ preventScroll: true })
          const selection = returnSelectionRef.current
          if (
            selection &&
            target.contains(selection.anchorNode) &&
            target.contains(selection.focusNode) &&
            isValidSelectionPoint(selection.anchorNode, selection.anchorOffset) &&
            isValidSelectionPoint(selection.focusNode, selection.focusOffset)
          ) {
            document
              .getSelection()
              ?.setBaseAndExtent(
                selection.anchorNode,
                selection.anchorOffset,
                selection.focusNode,
                selection.focusOffset,
              )
          }
        }}
        className="command-dialog-surface max-w-[780px] overflow-hidden rounded-md p-0 transform-cpu will-change-auto data-[state=open]:!duration-100 data-[state=closed]:!duration-75 data-[state=open]:!zoom-in-100 data-[state=closed]:!zoom-out-100 motion-reduce:data-[state=open]:!animate-none motion-reduce:data-[state=closed]:!animate-none motion-reduce:transition-none"
      >
        <DialogTitle className="sr-only">{t('command.palette')}</DialogTitle>
        <Command
          loop
          filter={filterCommand}
          className="command-dialog-command [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-2 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:size-5"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export default AppCommandDialog
