import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PlateEditor } from 'platejs/react'
import {
  createPlateSlashCommands,
  canRunPlateSlashCommand,
  filterPlateSlashCommands,
  getPlateSlashTrigger,
  isSamePlateSlashTrigger,
  runPlateSlashCommand,
} from '@/components/plate/slash/plateSlashCommands'
import type {
  PlateSlashCommand,
  PlateSlashCommandLabels,
  PlateSlashTrigger,
  RunPlateSlashCommandOptions,
} from '@/components/plate/slash/types'
import { usePlateSlashUrlDialog } from '@/components/plate/slash/usePlateSlashUrlDialog'
import { isImeKeyboardEvent } from '@/logic/ime'

type PlateSlashAnchor = { left: number; top: number }

type UsePlateSlashCommandsOptions = Pick<
  RunPlateSlashCommandOptions,
  'onCalendarFileCreate' | 'onError' | 'onImageImport'
> & {
  canEdit?: () => boolean
  documentIdentity: string | null | undefined
  editor: PlateEditor
  labels: PlateSlashCommandLabels
}

type ActiveSlash = {
  anchor: PlateSlashAnchor
  documentIdentity: string | null | undefined
  editor: PlateEditor
  trigger: PlateSlashTrigger
}

const captureAnchor = (): PlateSlashAnchor => {
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const rect = range?.getBoundingClientRect?.()
  return { left: rect?.left ?? 0, top: rect?.bottom ?? 0 }
}

export const usePlateSlashCommands = ({
  canEdit,
  documentIdentity,
  editor,
  labels,
  onCalendarFileCreate,
  onError,
  onImageImport,
}: UsePlateSlashCommandsOptions) => {
  const allCommands = useMemo(() => createPlateSlashCommands(labels), [labels])
  const [active, setActive] = useState<ActiveSlash | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const urlDialog = usePlateSlashUrlDialog(documentIdentity)
  const currentActive =
    active && active.documentIdentity === documentIdentity && active.editor === editor
      ? active
      : null
  const commands = useMemo(
    () =>
      currentActive
        ? filterPlateSlashCommands(allCommands, currentActive.trigger.query).filter((command) =>
            canRunPlateSlashCommand(editor, command, currentActive.trigger),
          )
        : [],
    [allCommands, currentActive, editor],
  )
  const menuOpen = Boolean(currentActive)

  const refreshAnchor = useCallback(() => {
    setActive((current) => {
      if (!current || current.documentIdentity !== documentIdentity || current.editor !== editor) {
        return current
      }
      const anchor = captureAnchor()
      if (anchor.left === current.anchor.left && anchor.top === current.anchor.top) return current
      return { ...current, anchor }
    })
  }, [documentIdentity, editor])

  useEffect(() => {
    if (!menuOpen) return
    window.addEventListener('resize', refreshAnchor)
    window.addEventListener('scroll', refreshAnchor, true)
    return () => {
      window.removeEventListener('resize', refreshAnchor)
      window.removeEventListener('scroll', refreshAnchor, true)
    }
  }, [menuOpen, refreshAnchor])

  const syncFromEditor = useCallback(() => {
    if (canEdit && !canEdit()) {
      setActive(null)
      setSelectedIndex(0)
      return
    }
    const trigger = getPlateSlashTrigger(editor)
    if (!trigger) {
      setActive(null)
      setSelectedIndex(0)
      return
    }
    setActive({ anchor: captureAnchor(), documentIdentity, editor, trigger })
    setSelectedIndex(0)
  }, [canEdit, documentIdentity, editor])

  const dismiss = useCallback(() => {
    setActive(null)
    setSelectedIndex(0)
  }, [])

  const selectCommand = useCallback(
    (command: PlateSlashCommand) => {
      if (canEdit && !canEdit()) {
        dismiss()
        return false
      }
      if (!currentActive) return false
      const { trigger } = currentActive
      const liveTrigger = getPlateSlashTrigger(editor)
      if (!liveTrigger || !isSamePlateSlashTrigger(liveTrigger, trigger)) {
        dismiss()
        return false
      }
      dismiss()
      void runPlateSlashCommand({
        command,
        editor,
        onCalendarFileCreate,
        onError,
        onImageImport,
        onUrlInsert: urlDialog.open,
        trigger,
      })
      return true
    },
    [
      canEdit,
      currentActive,
      dismiss,
      editor,
      onCalendarFileCreate,
      onError,
      onImageImport,
      urlDialog.open,
    ],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return false
      if (!currentActive) {
        if (event.key.length === 1 || event.key === 'Backspace') queueMicrotask(syncFromEditor)
        return false
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        dismiss()
        return true
      }
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && commands.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setSelectedIndex((current) => (current + delta + commands.length) % commands.length)
        return true
      }
      if (event.key === 'Enter' && commands[selectedIndex]) {
        if (!selectCommand(commands[selectedIndex])) return false
        event.preventDefault()
        event.stopPropagation()
        return true
      }
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        queueMicrotask(syncFromEditor)
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown'
      ) {
        setTimeout(syncFromEditor, 0)
      }
      return false
    },
    [commands, currentActive, dismiss, selectCommand, selectedIndex, syncFromEditor],
  )

  return {
    dismiss,
    menu: {
      anchor: currentActive?.anchor ?? { left: 0, top: 0 },
      commands,
      onSelectedIndexChange: setSelectedIndex,
      open: menuOpen,
      selectedIndex,
      selectCommand,
    },
    onKeyDown,
    syncFromEditor,
    urlDialog,
  }
}

export type PlateSlashCommandsController = ReturnType<typeof usePlateSlashCommands>
