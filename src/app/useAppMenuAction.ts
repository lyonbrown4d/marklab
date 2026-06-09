import { useCallback } from 'react'
import { exportApi } from '@/services/exportApi'
import { requestExportContent } from '@/utils/exportContent'
import { isDesktopRuntime } from '@/runtime/environment'
import type { useAppLayoutState } from '@/app/useAppLayoutState'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { toast } from 'sonner'

type AppLayoutState = ReturnType<typeof useAppLayoutState>

type UseAppMenuActionArgs = {
  stateRef: { current: AppLayoutState }
  openSettings: () => void
}

export const useAppMenuAction = ({ stateRef, openSettings }: UseAppMenuActionArgs) => {
  const setImmersiveZenMode = usePreferencesStore((state) => state.setImmersiveZenMode)
  const setImmersiveFocusMode = usePreferencesStore((state) => state.setImmersiveFocusMode)
  const setImmersiveTypewriterMode = usePreferencesStore(
    (state) => state.setImmersiveTypewriterMode,
  )
  return useCallback(
    (id: string) => {
      const currentState = stateRef.current

      const executeEdit = (action: string) => {
        if (typeof document === 'undefined') return
        if (action === 'edit.undo') document.execCommand('undo')
        if (action === 'edit.redo') document.execCommand('redo')
        if (action === 'edit.cut') document.execCommand('cut')
        if (action === 'edit.copy') document.execCommand('copy')
        if (action === 'edit.paste') document.execCommand('paste')
        if (action === 'edit.select_all') document.execCommand('selectAll')
      }

      const createUntitledPath = () => {
        const files = new Set(
          currentState.files
            .filter((entry) => entry.kind === 'file')
            .map((entry) => entry.path.toLowerCase()),
        )
        if (!files.has('untitled.md')) return 'Untitled.md'
        for (let index = 1; index <= 999; index += 1) {
          const next = `Untitled-${index}.md`
          if (!files.has(next.toLowerCase())) return next
        }
        return `Untitled-${Date.now()}.md`
      }

      if (id.startsWith('edit.')) {
        executeEdit(id)
        return
      }
      if (id === 'file.open_project') {
        void currentState.onSelectProject()
        return
      }
      if (id === 'file.open_file') {
        void currentState.onSelectSingleFile()
        return
      }
      if (id === 'file.new') {
        const next = createUntitledPath()
        void currentState.createFile(next).then(() => currentState.onOpenFile(next))
        return
      }
      if (id === 'file.export_pdf' || id === 'file.export_docx' || id === 'file.export_html') {
        if (!isDesktopRuntime()) return
        const format =
          id === 'file.export_pdf' ? 'pdf' : id === 'file.export_docx' ? 'docx' : 'html'
        const { activePath, rootPath, editorValue } = currentState
        void (async () => {
          const content = await requestExportContent(editorValue, {
            expectedActivePath: activePath,
          })
          await exportApi.exportMarkdown(content, format, {
            rootPath,
            activePath,
          })
        })().catch((err) => {
          toast.error('Export failed', {
            description: String(err),
          })
        })
        return
      }
      if (id === 'view.wysiwyg') currentState.setViewMode('wysiwyg')
      if (id === 'view.source') currentState.setViewMode('source')
      if (id === 'view.graph') currentState.setViewMode('graph')
      if (id === 'view.toggle_sidebar') currentState.toggleSidebar()
      if (id === 'view.toggle_right_sidebar') currentState.toggleRightSidebar()
      if (id === 'view.toggle_zen_mode') {
        setImmersiveZenMode(!usePreferencesStore.getState().immersiveZenMode)
      }
      if (id === 'view.toggle_focus_mode') {
        setImmersiveFocusMode(!usePreferencesStore.getState().immersiveFocusMode)
      }
      if (id === 'view.toggle_typewriter_mode') {
        setImmersiveTypewriterMode(!usePreferencesStore.getState().immersiveTypewriterMode)
      }
      if (id === 'settings.open') openSettings()
      if (id === 'theme.light') currentState.setTheme('light')
      if (id === 'theme.dark') currentState.setTheme('dark')
      if (id === 'theme.marko-light') currentState.setTheme('marko-light')
      if (id === 'theme.marko-dark') currentState.setTheme('marko-dark')
      if (id === 'help.about') {
        toast('marklab', {
          description: 'A desktop Markdown workspace with graph navigation.',
        })
      }
    },
    [
      openSettings,
      setImmersiveFocusMode,
      setImmersiveTypewriterMode,
      setImmersiveZenMode,
      stateRef,
    ],
  )
}
