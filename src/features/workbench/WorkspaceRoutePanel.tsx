import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { useLatest } from 'ahooks'
import { toast } from 'sonner'
import { createLayoutContextStore, type LayoutContext } from '@/app/AppLayoutContext'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { writeClipboardText } from '@/runtime/clipboard'
import { WorkspacePaneContext, type WorkspacePane } from '@/features/workbench/paneContext'
import { WorkspacePaneRoutes } from '@/features/workbench/WorkspacePaneRoutes'
import { documentAtRoute } from '@/features/workbench/workbenchState'
import type { DockTab } from '@/features/workbench/dockTypes'

type Props = {
  tab: DockTab
  context: LayoutContext
  pane: WorkspacePane
}

export const WorkspaceRoutePanel = ({ tab, context, pane }: Props) => {
  const { t } = useI18n()
  const latestPane = useLatest(pane)
  const [recovery, setRecovery] = useState<{
    attempted: string
    current: string
    key: number
  } | null>(null)
  const document = documentAtRoute(tab.route)
  const change =
    document && context.bindDocument
      ? context.bindDocument(document.path, tab.id, (attempted, current) =>
          setRecovery((previous) => ({ attempted, current, key: (previous?.key ?? 0) + 1 })),
        )
      : context.onEditorChange
  const scoped = {
    ...context,
    activePath: document?.path ?? null,
    editorBufferPath: document?.path ?? null,
    editorValue: document ? (context.fileContents[document.path] ?? '') : '',
    currentView:
      document?.view === 'source'
        ? ('source' as const)
        : document?.view === 'preview'
          ? ('preview' as const)
          : ('wysiwyg' as const),
    activeTab: document
      ? { kind: 'file' as const, path: document.path, view: document.view }
      : context.activeTab,
    onEditorChange: change,
    onOpenFile: (path: string) => pane.openFile(path),
    onOpenFileView: pane.openFile,
    editorReadOnlyMode: context.editorReadOnlyMode || !pane.active,
  }
  const [store] = useState(() => createLayoutContextStore(scoped))
  useLayoutEffect(() => store.setState(scoped, true))
  const registerFlush = useCallback<WorkspacePane['registerFlush']>(
    (flush) => latestPane.current.registerFlush(flush),
    [latestPane],
  )
  const openFile = useCallback<WorkspacePane['openFile']>(
    (...args) => latestPane.current.openFile(...args),
    [latestPane],
  )
  const openBeside = useCallback<WorkspacePane['openBeside']>(
    (...args) => latestPane.current.openBeside(...args),
    [latestPane],
  )
  const session = useMemo(
    () => ({
      id: pane.id,
      active: pane.active,
      visible: pane.visible,
      recoveryKey: recovery?.key ?? 0,
      registerFlush,
      openFile,
      openBeside,
    }),
    [pane.id, pane.active, pane.visible, recovery?.key, registerFlush, openFile, openBeside],
  )
  return (
    <WorkspacePaneContext.Provider value={session}>
      <div
        className="flex h-full min-h-0 w-full min-w-0 flex-col"
        data-workbench-pane={tab.id}
        data-pane-active={pane.active}
      >
        {recovery && (
          <div
            className="flex items-center justify-between gap-2 border-b bg-muted px-3 py-2 text-xs"
            role="alert"
          >
            <span>{t('workbench.recoveredDraft')}</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void writeClipboardText(recovery.attempted).catch(() =>
                  toast.error(t('workbench.copyDraftFailed')),
                )
              }}
            >
              {t('workbench.copyDraft')}
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          <WorkspacePaneRoutes key={recovery?.key ?? 0} route={tab.route} context={store} />
        </div>
      </div>
    </WorkspacePaneContext.Provider>
  )
}
