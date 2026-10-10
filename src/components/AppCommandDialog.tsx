import type { DialogProps } from 'radix-ui/dialog'
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

const fallbackFocusSelectors = [
  '[data-app-focus-fallback="sidebar-toggle"]',
  '[data-app-focus-zone="editor"] [contenteditable="true"]',
  '[data-app-focus-zone="editor"] textarea:not([disabled])',
  '[data-app-focus-zone="editor"] input:not([disabled])',
  '[data-app-focus-zone="editor"] [tabindex]:not([tabindex="-1"])',
]

const isAvailableFocusTarget = (target: HTMLElement | null): target is HTMLElement => {
  if (
    !target?.isConnected ||
    target === document.body ||
    target === document.documentElement ||
    target.getAttribute('aria-disabled') === 'true'
  ) {
    return false
  }
  if (
    (target instanceof HTMLButtonElement ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement) &&
    target.disabled
  ) {
    return false
  }

  let current: HTMLElement | null = target
  while (current) {
    if (
      current.hidden ||
      (current.hasAttribute('inert') && !current.hasAttribute('data-inert-ed')) ||
      (current.getAttribute('aria-hidden') === 'true' && !current.hasAttribute('data-aria-hidden'))
    ) {
      return false
    }
    const style = getComputedStyle(current)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
    current = current.parentElement
  }
  return true
}

const findFallbackFocusTarget = () =>
  fallbackFocusSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll<HTMLElement>(selector)))
    .find(isAvailableFocusTarget) ?? null

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
          const originalTarget = returnFocusRef.current
          const target = isAvailableFocusTarget(originalTarget)
            ? originalTarget
            : findFallbackFocusTarget()
          if (!target) return

          // A selected command may already have focused another editor or dialog.
          const active = document.activeElement
          const closingDialog = event.currentTarget
          if (
            active instanceof HTMLElement &&
            active !== document.body &&
            active !== document.documentElement &&
            !(closingDialog instanceof HTMLElement && closingDialog.contains(active)) &&
            isAvailableFocusTarget(active)
          ) {
            return
          }
          target.focus({ preventScroll: true })
          const selection = returnSelectionRef.current
          if (
            selection &&
            target === originalTarget &&
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
        className="command-dialog-surface !top-1/2 !w-[min(860px,calc(100vw-32px))] !max-w-[860px] !-translate-y-1/2 overflow-hidden rounded-2xl border-border/70 bg-popover/98 p-0 shadow-2xl shadow-foreground/15 backdrop-blur-xl transform-cpu will-change-auto [&>button:last-child]:hidden data-[state=open]:!duration-150 data-[state=closed]:!duration-100 data-[state=open]:!zoom-in-[0.99] data-[state=closed]:!zoom-out-[0.99] motion-reduce:data-[state=open]:!animate-none motion-reduce:data-[state=closed]:!animate-none motion-reduce:transition-none"
      >
        <DialogTitle className="sr-only">{t('command.palette')}</DialogTitle>
        <Command
          loop
          filter={filterCommand}
          className="command-dialog-command rounded-2xl bg-transparent [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-group]]:px-1 [&_[cmdk-input-wrapper]]:rounded-xl [&_[cmdk-input-wrapper]]:border-0 [&_[cmdk-input-wrapper]]:px-4 [&_[cmdk-input-wrapper]_svg]:size-5 [&_[cmdk-input-wrapper]_svg]:text-muted-foreground [&_[cmdk-item]]:mx-1 [&_[cmdk-item]]:rounded-lg [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-item]]:transition-colors [&_[cmdk-item]_svg]:size-4"
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export default AppCommandDialog
