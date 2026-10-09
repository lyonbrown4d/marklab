import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import type { PlateEditor } from 'platejs/react'
import { getEditorSuggestionOptionIdForIndex } from '@/components/menu/EditorSuggestionMenu'
import { useEditorSuggestionAria } from '@/components/menu/useEditorSuggestionAria'
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
import { usePlateSlashDeferredTasks } from '@/components/plate/slash/usePlateSlashDeferredTasks'
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
  contextToken: object
  documentIdentity: string | null | undefined
  editor: PlateEditor
  trigger: PlateSlashTrigger
}

const captureAnchor = (editor: PlateEditor): PlateSlashAnchor | null => {
  const root = editor.api.toDOMNode(editor)
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const container = range?.commonAncestorContainer
  if (!root || !container || (container !== root && !root.contains(container))) return null
  const rect = Array.from(range.getClientRects()).find(
    ({ bottom, height, left, width }) =>
      Number.isFinite(left) &&
      Number.isFinite(bottom) &&
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      (width > 0 || height > 0),
  )
  if (!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.bottom)) return null
  return { left: rect.left, top: rect.bottom }
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
  const generatedId = useId()
  const menuId = `marklab-slash-suggestions-${generatedId}`
  const editingAllowed = !canEdit || canEdit()
  const contextToken = useMemo(
    () => ({ documentIdentity, editingAllowed, editor }),
    [documentIdentity, editingAllowed, editor],
  )
  const [active, setActive] = useState<ActiveSlash | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const urlDialog = usePlateSlashUrlDialog(documentIdentity)
  const {
    cancelAnimationFrameTask,
    cancelPending,
    scheduleAnimationFrame,
    scheduleMicrotask,
    scheduleTimeout,
  } = usePlateSlashDeferredTasks({ canEdit, contextToken })
  const currentActive = active && active.contextToken === contextToken ? active : null
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
  const activeOptionId = getEditorSuggestionOptionIdForIndex(
    menuId,
    commands,
    currentActive ? selectedIndex : 0,
    (command) => command.key,
  )
  const dismiss = useCallback(() => {
    cancelPending()
    setActive(null)
    setSelectedIndex(0)
  }, [cancelPending])
  useEditorSuggestionAria({ activeOptionId, editor, menuId, open: menuOpen })

  const refreshAnchor = useCallback(() => {
    const anchor = captureAnchor(editor)
    if (!anchor) {
      dismiss()
      return
    }
    setActive((current) => {
      if (!current || current.documentIdentity !== documentIdentity || current.editor !== editor) {
        return current
      }
      if (anchor.left === current.anchor.left && anchor.top === current.anchor.top) return current
      return { ...current, anchor }
    })
  }, [dismiss, documentIdentity, editor])

  const scheduleAnchorRefresh = useCallback(
    () => scheduleAnimationFrame(refreshAnchor),
    [refreshAnchor, scheduleAnimationFrame],
  )

  useEffect(() => {
    if (!menuOpen) return
    const dismissOnVisibilityLoss = () => {
      if (document.visibilityState === 'hidden') dismiss()
    }
    window.addEventListener('blur', dismiss)
    window.addEventListener('pagehide', dismiss)
    window.addEventListener('resize', scheduleAnchorRefresh)
    window.addEventListener('scroll', scheduleAnchorRefresh, true)
    document.addEventListener('visibilitychange', dismissOnVisibilityLoss)
    return () => {
      window.removeEventListener('blur', dismiss)
      window.removeEventListener('pagehide', dismiss)
      window.removeEventListener('resize', scheduleAnchorRefresh)
      window.removeEventListener('scroll', scheduleAnchorRefresh, true)
      document.removeEventListener('visibilitychange', dismissOnVisibilityLoss)
      cancelAnimationFrameTask()
    }
  }, [cancelAnimationFrameTask, dismiss, menuOpen, scheduleAnchorRefresh])

  const syncFromEditor = useCallback(() => {
    if (canEdit && !canEdit()) {
      dismiss()
      return
    }
    const trigger = getPlateSlashTrigger(editor)
    if (!trigger) {
      dismiss()
      return
    }
    const anchor = captureAnchor(editor)
    if (!anchor) {
      dismiss()
      return
    }
    setActive({ anchor, contextToken, documentIdentity, editor, trigger })
    setSelectedIndex(0)
  }, [canEdit, contextToken, dismiss, documentIdentity, editor])

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
        if (event.key.length === 1 || event.key === 'Backspace') {
          scheduleMicrotask(syncFromEditor)
        }
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
        scheduleMicrotask(syncFromEditor)
      }
      if (
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown'
      ) {
        scheduleTimeout(syncFromEditor)
      }
      return false
    },
    [
      commands,
      currentActive,
      dismiss,
      scheduleMicrotask,
      scheduleTimeout,
      selectCommand,
      selectedIndex,
      syncFromEditor,
    ],
  )

  return {
    dismiss,
    menu: {
      anchor: currentActive?.anchor ?? { left: 0, top: 0 },
      commands,
      menuId,
      onSelectedIndexChange: setSelectedIndex,
      open: menuOpen,
      selectedIndex: currentActive ? selectedIndex : 0,
      selectCommand,
    },
    onKeyDown,
    syncFromEditor,
    urlDialog,
  }
}

export type PlateSlashCommandsController = ReturnType<typeof usePlateSlashCommands>
